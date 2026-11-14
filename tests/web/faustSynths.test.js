// Tests for the Faust synths on the main thread, against a stand-in context and worklet node: loading (and where it
// cannot happen), one node per output and instrument wired to that output, the built-in voices until a node is ready
// or after it fails, and every note turned into timed messages, a slide into a held note that glides.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { GLIDE_SECONDS } from '../../src/audio/faust/noteParams.js';
import { SYNTH_PROCESSOR } from '../../src/audio/faust/synthCore.js';
import { TrackSynth, faustSynthFor, loadFaustSynths } from '../../src/audio/faustSynths.js';

/** A worklet node that records what is posted to it and where it is connected. */
class MockWorkletNode {
  constructor(options) {
    this.options = options;
    this.posted = [];
    this.connectedTo = [];
    this.port = { onmessage: null, postMessage: (message) => this.posted.push(message) };
    this.onprocessorerror = null;
  }

  connect(target) {
    this.connectedTo.push(target);
    return target;
  }

  /** What the processor says once it has built its voices. */
  ready() {
    this.port.onmessage?.({ data: { type: 'ready' } });
  }
}

/** A context whose worklet records the modules added, and a factory that records the nodes made. */
function setup() {
  const context = /** @type {any} */ ({
    audioWorklet: { modules: [], addModule: async (url) => context.audioWorklet.modules.push(url) },
  });
  const nodes = [];
  const createNode = (_context, options) => {
    const node = new MockWorkletNode(options);
    nodes.push(node);
    return /** @type {any} */ (node);
  };
  // The real compiled voices, read from the project, so WebAssembly.compile gets real modules.
  const fetch = async (url) => {
    const name = String(url).match(/(acid|bass|fx|keys|lead|pad|pluck)[^/]*\.wasm/)?.[1];
    return readFileSync(path.resolve('src/audio/faust/generated', `${name}.wasm`));
  };
  return { context, nodes, createNode, fetch };
}

describe('Faust synths on the main thread', () => {
  it('loads the processor and compiles every voice once per context', async () => {
    const { context, createNode, fetch } = setup();
    const compile = vi.spyOn(WebAssembly, 'compile');
    expect(await loadFaustSynths(context, { fetch, createNode })).toBe(true);
    expect(await loadFaustSynths(context, { fetch, createNode })).toBe(true);
    expect(context.audioWorklet.modules).toHaveLength(1);
    expect(context.audioWorklet.modules[0]).toMatch(/synthProcessor/);
    expect(compile).toHaveBeenCalledTimes(7);
    compile.mockRestore();
  });

  it('does not load where there is no AudioWorklet, and plays nothing on Faust before it has loaded', async () => {
    expect(await loadFaustSynths(/** @type {any} */ ({}))).toBe(false);
    const { context } = setup();
    expect(faustSynthFor(context, /** @type {any} */ ({}), 'acid')).toBeNull();
  });

  it('makes one node per output and instrument, wired to that output, used once it is ready', async () => {
    const { context, nodes, createNode, fetch } = setup();
    await loadFaustSynths(context, { fetch, createNode });
    const strip = /** @type {any} */ ({ name: 'strip' });
    const other = /** @type {any} */ ({ name: 'other strip' });
    expect(faustSynthFor(context, strip, 'acid')).toBeNull(); // starting: the built-in voice plays this note
    expect(faustSynthFor(context, strip, 'kick')).toBeNull(); // drums have no Faust voice
    expect(nodes).toHaveLength(1);
    const [node] = nodes;
    expect(node.connectedTo).toEqual([strip]);
    expect(node.options).toMatchObject({ numberOfInputs: 0, outputChannelCount: [2] });
    expect(node.options.processorOptions).toMatchObject({ instrument: 'acid', polyphony: 3 });
    expect(node.options.processorOptions.module).toBeInstanceOf(WebAssembly.Module);
    node.ready();
    const synth = faustSynthFor(context, strip, 'acid');
    expect(synth).toBeInstanceOf(TrackSynth);
    expect(faustSynthFor(context, strip, 'acid')).toBe(synth);
    faustSynthFor(context, other, 'acid');
    faustSynthFor(context, strip, 'pad');
    expect(nodes).toHaveLength(3);
    expect(nodes[1].connectedTo).toEqual([other]);
  });

  it('falls back to the built-in voice for good when a node fails to start or its processor fails', async () => {
    const { context, nodes, createNode, fetch } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let shouldThrow = true;
    await loadFaustSynths(context, {
      fetch,
      createNode: (owner, options) => {
        if (shouldThrow) {
          throw new Error('no processor');
        }
        return createNode(owner, options);
      },
    });
    const out = /** @type {any} */ ({});
    expect(faustSynthFor(context, out, 'lead')).toBeNull();
    expect(faustSynthFor(context, out, 'lead')).toBeNull();
    shouldThrow = false;
    faustSynthFor(context, out, 'pluck');
    nodes[0].ready();
    expect(faustSynthFor(context, out, 'pluck')).not.toBeNull();
    nodes[0].onprocessorerror();
    expect(faustSynthFor(context, out, 'pluck')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('sends a note as on and off at its exact times, with its controls', () => {
    const node = new MockWorkletNode({});
    const synth = new TrackSynth(/** @type {any} */ (node), 'keys', () => 0.5);
    node.port.onmessage({ data: { type: 'something else' } });
    expect(synth.isPlayable).toBe(false);
    node.ready();
    expect(synth.isPlayable).toBe(true);
    expect(synth.play({ time: 3, duration: 0.5, pitch: 60, gain: 0.7 })).toBeUndefined();
    const [on, off] = node.posted;
    expect(on).toMatchObject({ type: 'on', time: 3, tail: expect.any(Number) });
    expect(on.params).toMatchObject({ gain: 0.7, attack: expect.any(Number) });
    expect(off).toEqual({ type: 'off', id: on.id, time: 3.5 });
    synth.play({ time: 4, duration: 0.5, pitch: 60, gain: 0.7 });
    expect(node.posted[2].id).not.toBe(on.id);
  });

  it('holds a sliding note and glides it into the next, ending it where the last note of the slide ends', () => {
    const node = new MockWorkletNode({});
    const synth = new TrackSynth(/** @type {any} */ (node), 'acid');
    const held = synth.play({ time: 1, duration: 0.25, pitch: 45, gain: 0.8, slide: true });
    expect(node.posted).toHaveLength(1);
    const { id } = node.posted[0];
    held?.glide({ time: 1.25, duration: 0.25, pitch: 57, gain: 0.8, slide: true });
    expect(node.posted[1]).toMatchObject({ type: 'set', id, time: 1.25, params: { glide: GLIDE_SECONDS } });
    expect(node.posted[1].params.freq).toBeCloseTo(220);
    held?.glide({ time: 1.5, duration: 0.25, pitch: 52, gain: 0.8 });
    expect(node.posted.at(-1)).toEqual({ type: 'off', id, time: 1.73 });
    held?.glide({ time: 2, duration: 0.25, pitch: 40, gain: 0.8 });
    held?.release(3);
    expect(node.posted).toHaveLength(4);
  });

  it('ends a held note where it is released, once', () => {
    const node = new MockWorkletNode({});
    const held = new TrackSynth(/** @type {any} */ (node), 'bass').play({
      time: 1,
      duration: 0.2,
      pitch: 36,
      gain: 1,
      slide: true,
    });
    held?.release(1.2);
    held?.release(1.4);
    expect(node.posted.slice(1)).toEqual([{ type: 'off', id: node.posted[0].id, time: 1.2 }]);
  });

  it('registers its processor under the name the nodes ask for', () => {
    expect(SYNTH_PROCESSOR).toBe('bpm-faust-synth');
  });
});
