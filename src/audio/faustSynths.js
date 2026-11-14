// The synth voices written in Faust, as the main thread sees them. On the first play the engine loads them: the
// worklet processor (faust/synthProcessor.js) and each instrument's compiled WebAssembly, fetched from this site and
// compiled once. After that, each output a synth plays into (the master now, a track's channel strip once there is a
// mixer) gets one AudioWorkletNode per instrument, with a pool of voices inside, and every note becomes two timed
// messages to it: on, with all its controls, and off. The processor applies them at the exact sample, so timing is as
// tight as the look-ahead scheduler's. Until a node says it is ready, and wherever AudioWorklet or WebAssembly is
// missing or fails, playNote falls back to the built-in Web Audio voices, so playback never goes silent.
// See docs/adr/0008-synth-voices-in-faust.md.
import { FAUST_INSTRUMENTS, GLIDE_SECONDS, controlsOf } from './faust/noteParams.js';
import { POLYPHONY } from './faust/polyphony.js';
import { SYNTH_PROCESSOR } from './faust/synthCore.js';
import { frequencyOf } from '../../shared/music.js';
import processorUrl from './faust/synthProcessor.js?worker&url';
import acidUrl from './faust/generated/acid.wasm?url&no-inline';
import bassUrl from './faust/generated/bass.wasm?url&no-inline';
import fxUrl from './faust/generated/fx.wasm?url&no-inline';
import keysUrl from './faust/generated/keys.wasm?url&no-inline';
import leadUrl from './faust/generated/lead.wasm?url&no-inline';
import padUrl from './faust/generated/pad.wasm?url&no-inline';
import pluckUrl from './faust/generated/pluck.wasm?url&no-inline';

/** @type {Record<string, string>} */
const WASM_URLS = {
  acid: acidUrl,
  bass: bassUrl,
  fx: fxUrl,
  keys: keysUrl,
  lead: leadUrl,
  pad: padUrl,
  pluck: pluckUrl,
};

/**
 * @typedef {import('./faust/noteParams.js').SynthNote} SynthNote
 * @typedef {{ glide: (next: SynthNote) => void, release: (time: number) => void }} HeldVoice a note held open by a
 *   slide: `glide` moves it to the next note's pitch without a new attack, `release` ends it
 * @typedef {(context: BaseAudioContext, options: AudioWorkletNodeOptions) => AudioWorkletNode} NodeFactory
 * @typedef {{ modules: Map<string, WebAssembly.Module>, synths: WeakMap<AudioNode, Map<string, TrackSynth>>,
 *   createNode: NodeFactory }} Loaded
 */

/** @type {WeakMap<BaseAudioContext, Loaded>} contexts whose Faust synths are loaded */
const loaded = new WeakMap();

/** @type {NodeFactory} */
const createWorkletNode = (context, options) => new AudioWorkletNode(context, SYNTH_PROCESSOR, options);

/** @param {string} url @returns {Promise<ArrayBuffer>} */
async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * Loads the processor and compiles every instrument's voice. Resolves false where the browser cannot run them; the
 * built-in voices then play everything.
 * @param {BaseAudioContext} context
 * @param {{ fetch?: (url: string) => Promise<ArrayBuffer>, createNode?: NodeFactory }} [options] for tests
 * @returns {Promise<boolean>}
 */
export async function loadFaustSynths(context, { fetch = fetchBytes, createNode = createWorkletNode } = {}) {
  if (!context.audioWorklet || typeof WebAssembly === 'undefined') {
    return false;
  }
  if (loaded.has(context)) {
    return true;
  }
  const [, ...modules] = await Promise.all([
    context.audioWorklet.addModule(processorUrl),
    ...FAUST_INSTRUMENTS.map(async (instrument) => WebAssembly.compile(await fetch(WASM_URLS[instrument]))),
  ]);
  loaded.set(context, {
    modules: new Map(FAUST_INSTRUMENTS.map((instrument, index) => [instrument, modules[index]])),
    synths: new WeakMap(),
    createNode,
  });
  return true;
}

let nextNoteId = 0;

/** One instrument's worklet node on one output, and the notes sent to it. */
export class TrackSynth {
  /**
   * @param {AudioWorkletNode} node
   * @param {string} instrument
   * @param {() => number} [random] for the drift, 0 to 1
   */
  constructor(node, instrument, random = Math.random) {
    this.node = node;
    this.instrument = instrument;
    this.random = random;
    this.isReady = false;
    this.isBroken = false;
    node.port.onmessage = (event) => {
      if (event.data?.type === 'ready') {
        this.isReady = true;
      }
    };
    node.onprocessorerror = () => {
      this.isBroken = true;
      console.warn(`[audio] the ${instrument} synth stopped; using the built-in voice`);
    };
  }

  /** @returns {boolean} true when notes should go to this synth */
  get isPlayable() {
    return this.isReady && !this.isBroken;
  }

  /** @param {import('./faust/synthCore.js').NoteEvent} event */
  send(event) {
    this.node.port.postMessage(event);
  }

  /**
   * Plays a note: on at its time, off where its gate closes. A note that slides is held open instead, and the handle
   * returned glides it into the next note or ends it.
   * @param {SynthNote} note
   * @returns {HeldVoice | undefined}
   */
  play(note) {
    nextNoteId += 1;
    const id = nextNoteId;
    const { params, end, tail } = controlsOf(this.instrument, note, this.random);
    this.send({ type: 'on', id, time: note.time, params, tail });
    if (!note.slide) {
      this.send({ type: 'off', id, time: end });
      return undefined;
    }
    let isOpen = true;
    return {
      glide: (next) => {
        if (!isOpen) {
          return;
        }
        this.send({
          type: 'set',
          id,
          time: next.time,
          params: { glide: GLIDE_SECONDS, freq: frequencyOf(next.pitch) },
        });
        if (!next.slide) {
          isOpen = false;
          this.send({ type: 'off', id, time: controlsOf(this.instrument, next, this.random).end });
        }
      },
      release: (time) => {
        if (isOpen) {
          isOpen = false;
          this.send({ type: 'off', id, time });
        }
      },
    };
  }
}

/**
 * The Faust synth to play a note on, or null to use the built-in voice: the synths are not loaded (yet), the
 * instrument has none, or its node for this output is still starting or has failed. The first call for an output
 * makes the node.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {string} instrument
 * @returns {TrackSynth | null}
 */
export function faustSynthFor(context, out, instrument) {
  const state = loaded.get(context);
  const module = state?.modules.get(instrument);
  if (!state || !module) {
    return null;
  }
  let synths = state.synths.get(out);
  if (!synths) {
    synths = new Map();
    state.synths.set(out, synths);
  }
  let synth = synths.get(instrument);
  if (!synth) {
    try {
      const node = state.createNode(context, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { instrument, module, polyphony: POLYPHONY[instrument] },
      });
      node.connect(out);
      synth = new TrackSynth(node, instrument);
    } catch (error) {
      console.warn(`[audio] the ${instrument} synth could not start; using the built-in voice`, error);
      synth = /** @type {TrackSynth} */ ({ isPlayable: false });
    }
    synths.set(instrument, synth);
  }
  return synth.isPlayable ? synth : null;
}
