// The sampled drum kit: recorded one-shots for the kick, snare, hats, tom and percussion, which a drum track plays
// unless its kit is the 909-style synth (ADR 0009). The files are small mono FLAC served from this site
// (public/samples/drums), fetched after the audio context starts, so they cost nothing on first load and need no
// network beyond this computer (ADR 0004). Each file is decoded once per audio context and its buffer kept. Until a
// sample is ready, or if it fails to load, the drum plays its synthesised voice instead, so playback never goes silent.
// The clap has no sample yet and stays synthesised.
import { DRUM_KITS, SYNTH_KIT, kitOf, soundOf } from '../../shared/sound.js';

/**
 * @typedef {{ time: number, gain: number, sound?: import('../../shared/types.js').TrackSound }} DrumHit `gain` 0 to 1,
 *   accent included; `sound` the track's kit and knobs
 * @typedef {(url: string) => Promise<ArrayBuffer>} FetchFile
 */

/** Where the files are served: next to the app, whatever base path it is built for. */
const SAMPLE_BASE = `${import.meta.env?.BASE_URL ?? '/'}samples/drums/`;

/**
 * The peak gain of each drum at full velocity. The files are all normalised to the same peak, so these set the balance
 * between drums, close to the synthesised voices' levels so a track sounds as loud whichever kit it plays.
 * @type {Record<string, number>}
 */
const LEVELS = { kick: 1, snare: 0.7, hat: 0.42, openhat: 0.38, tom: 0.75, perc: 0.5 };

/** How fast a closed hat cuts off a ringing open hat, in seconds: quick, but not a click. */
const CHOKE_SECONDS = 0.008;

/** Every sample file, by name: `<instrument>-<kit>`. */
export const SAMPLE_IDS = Object.entries(DRUM_KITS).flatMap(([instrument, kits]) =>
  kits.filter((choice) => choice.id !== SYNTH_KIT).map((choice) => `${instrument}-${choice.id}`),
);

/** @type {WeakMap<BaseAudioContext, { buffers: Map<string, AudioBuffer>, loading: Promise<void> }>} */
const kits = new WeakMap();

/** @type {WeakMap<BaseAudioContext, { choke: GainNode, start: number, until: number }>} the open hat ringing now */
const ringingOpenHats = new WeakMap();

/** @type {FetchFile} */
async function fetchFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * @param {number} tune a knob, 0 to 100
 * @returns {number} a playback rate: half an octave down to half an octave up, 1 at 50 (as the synthesised drums tune)
 */
const tuneRate = (tune) => 2 ** ((tune - 50) / 100);

/**
 * @param {number} decay a knob, 0 to 100
 * @returns {number} how much of the sample to keep: about a third at 0, all of it from 50 up (a recording cannot ring
 *   longer than it was recorded)
 */
const decayShare = (decay) => Math.min(1, 2 ** ((decay - 50) / 35));

/**
 * Cuts off an open hat that started before `time` and is still ringing, as closing the hat does on a drum machine.
 * @param {BaseAudioContext} context
 * @param {number} time
 */
function chokeOpenHat(context, time) {
  const ringing = ringingOpenHats.get(context);
  if (ringing && time > ringing.start && time < ringing.until) {
    ringing.choke.gain.setValueAtTime(1, time);
    ringing.choke.gain.linearRampToValueAtTime(0, time + CHOKE_SECONDS);
    ringingOpenHats.delete(context);
  }
}

/**
 * Fetches and decodes every sample of the kit for a context, once: calling it again returns the same promise. A file
 * that cannot be fetched or decoded is logged and left out, and its drum keeps its synthesised voice.
 * @param {BaseAudioContext} context
 * @param {{ fetchFile?: FetchFile }} [options] `fetchFile` replaces the network, for tests
 * @returns {Promise<void>} settles when every file has loaded or failed; never rejects
 */
export function loadDrumSamples(context, { fetchFile: fetchBytes = fetchFile } = {}) {
  const existing = kits.get(context);
  if (existing) {
    return existing.loading;
  }
  /** @type {Map<string, AudioBuffer>} */
  const buffers = new Map();
  const loading = Promise.all(
    SAMPLE_IDS.map(async (id) => {
      try {
        const bytes = await fetchBytes(`${SAMPLE_BASE}${id}.flac`);
        buffers.set(id, await context.decodeAudioData(bytes));
      } catch (error) {
        console.warn(`[audio] the ${id} sample could not load; that drum plays its synthesised voice`, error);
      }
    }),
  ).then(() => undefined);
  kits.set(context, { buffers, loading });
  return loading;
}

/**
 * Plays one drum hit from its sample, if the track's kit is a sample and it is ready: an AudioBufferSourceNode at the
 * hit's time, sped up or slowed down by the tune knob, through a gain that follows velocity and fades early when the
 * decay knob is below the middle, into `out` (the same node the synthesised voices play into: the track's strip). A
 * closed or open hat chokes an open hat still ringing.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {string} instrument
 * @param {DrumHit} hit
 * @returns {boolean} false when there is no sample to play, so the caller plays the synthesised voice instead
 */
export function playSample(context, out, instrument, { time, gain, sound }) {
  const kit = kitOf(instrument, sound);
  const buffer = kit && kit !== SYNTH_KIT ? kits.get(context)?.buffers.get(`${instrument}-${kit}`) : undefined;
  if (!buffer) {
    return false;
  }
  const knobs = soundOf(instrument, sound);
  if (instrument === 'hat' || instrument === 'openhat') {
    chokeOpenHat(context, time);
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = tuneRate(knobs.tune);
  const length = buffer.duration / source.playbackRate.value;
  const level = Math.max(0, gain) * (LEVELS[instrument] ?? 1);
  const amp = context.createGain();
  const share = decayShare(knobs.decay);
  let stopAt = null;
  if (share < 1) {
    // Hold, then fade over the second half of what is kept: a shorter ring without cutting the attack.
    const end = time + length * share;
    amp.gain.setValueAtTime(level, time);
    amp.gain.setValueAtTime(level, time + length * share * 0.5);
    amp.gain.linearRampToValueAtTime(0, end);
    stopAt = end + 0.01;
  } else {
    amp.gain.value = level;
  }
  source.connect(amp);
  if (instrument === 'openhat') {
    // Through a gain of its own, which the next hat closes.
    const choke = context.createGain();
    amp.connect(choke).connect(out);
    ringingOpenHats.set(context, { choke, start: time, until: time + length * share });
  } else {
    amp.connect(out);
  }
  source.start(time);
  if (stopAt !== null) {
    source.stop(stopAt);
  }
  return true;
}
