// The mix: where each track sits (pan, how much it sends to the reverb and the delay, whether it ducks under the kick)
// and the song's shared effects (reverb, tempo-synced delay, sidechain). Defaults suit the home genres: the kick and
// bass dry and centred, hats and percussion a little off centre, pads and leads in the reverb, the bass, pad and lead
// ducking under every kick. Cleaning turns anything (an old file, the AI's answer) into values in range. Pure, for
// browser and server.
import { instrumentOf } from './instruments.js';
import { clamp } from './music.js';

/** @typedef {import('./types.js').TrackMix} TrackMix */
/** @typedef {import('./types.js').SongFx} SongFx */

/** The delay times the delay offers, as fractions of a beat. `1/8d` is a dotted eighth. */
export const DELAY_DIVISIONS = /** @type {const} */ ({ '1/16': 0.25, '1/8': 0.5, '1/8d': 0.75, '1/4': 1 });
export const DELAY_DIVISION_IDS = /** @type {[string, ...string[]]} */ (Object.keys(DELAY_DIVISIONS));

/** Bounds of every mix number, so the schema, the cleaning and the controls agree. */
export const MIX_RANGES = {
  pan: [-100, 100],
  send: [0, 100],
  reverbSize: [0, 100],
  reverbDecay: [0, 100],
  level: [0, 100],
  feedback: [0, 90],
  tone: [0, 100],
  duckAmount: [0, 95],
  duckRelease: [5, 100],
};

/** @type {Record<string, TrackMix>} by instrument; any other instrument plays centred and dry */
const INSTRUMENT_MIX = {
  kick: { pan: 0, reverb: 0, delay: 0, duck: false },
  snare: { pan: 0, reverb: 14, delay: 0, duck: false },
  clap: { pan: 0, reverb: 18, delay: 0, duck: false },
  hat: { pan: 18, reverb: 6, delay: 0, duck: false },
  openhat: { pan: -16, reverb: 10, delay: 0, duck: false },
  tom: { pan: -12, reverb: 16, delay: 0, duck: false },
  perc: { pan: 28, reverb: 14, delay: 12, duck: false },
  bass: { pan: 0, reverb: 0, delay: 0, duck: true },
  acid: { pan: 0, reverb: 10, delay: 22, duck: false },
  lead: { pan: 0, reverb: 26, delay: 24, duck: true },
  pluck: { pan: -10, reverb: 18, delay: 26, duck: false },
  keys: { pan: 8, reverb: 22, delay: 10, duck: false },
  pad: { pan: 0, reverb: 40, delay: 0, duck: true },
  fx: { pan: 0, reverb: 36, delay: 16, duck: false },
};

/**
 * @param {string} instrument
 * @returns {TrackMix} where a new track of this instrument sits in the mix
 */
export function defaultMix(instrument) {
  return { ...(INSTRUMENT_MIX[instrumentOf(instrument).id] ?? INSTRUMENT_MIX.lead) };
}

/** @returns {SongFx} a medium hall, a dotted-eighth ping-pong, and a firm duck that lets go before the next sixteenth */
export function defaultFx() {
  return {
    reverb: { size: 55, decay: 50, level: 70 },
    delay: { division: '1/8d', feedback: 38, tone: 55, level: 60 },
    sidechain: { amount: 60, release: 40 },
  };
}

/**
 * @param {unknown} value
 * @param {number[]} range
 * @param {number} fallback
 * @returns {number} a whole number in range, or the fallback when it is not a number
 */
function cleanNumber(value, [low, high], fallback) {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) ? clamp(Math.round(number), low, high) : fallback;
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/**
 * @param {unknown} raw a mix from anywhere: a part of it, values out of range, or nothing at all
 * @param {TrackMix} fallback what fills in the gaps
 * @returns {TrackMix}
 */
export function cleanMix(raw, fallback) {
  const mix = asObject(raw);
  return {
    pan: cleanNumber(mix.pan, MIX_RANGES.pan, fallback.pan),
    reverb: cleanNumber(mix.reverb, MIX_RANGES.send, fallback.reverb),
    delay: cleanNumber(mix.delay, MIX_RANGES.send, fallback.delay),
    duck: typeof mix.duck === 'boolean' ? mix.duck : fallback.duck,
  };
}

/**
 * @param {unknown} raw song effects from anywhere
 * @param {SongFx} [fallback] what fills in the gaps
 * @returns {SongFx}
 */
export function cleanFx(raw, fallback = defaultFx()) {
  const fx = asObject(raw);
  const reverb = asObject(fx.reverb);
  const delay = asObject(fx.delay);
  const sidechain = asObject(fx.sidechain);
  return {
    reverb: {
      size: cleanNumber(reverb.size, MIX_RANGES.reverbSize, fallback.reverb.size),
      decay: cleanNumber(reverb.decay, MIX_RANGES.reverbDecay, fallback.reverb.decay),
      level: cleanNumber(reverb.level, MIX_RANGES.level, fallback.reverb.level),
    },
    delay: {
      division: DELAY_DIVISION_IDS.includes(delay.division) ? delay.division : fallback.delay.division,
      feedback: cleanNumber(delay.feedback, MIX_RANGES.feedback, fallback.delay.feedback),
      tone: cleanNumber(delay.tone, MIX_RANGES.tone, fallback.delay.tone),
      level: cleanNumber(delay.level, MIX_RANGES.level, fallback.delay.level),
    },
    sidechain: {
      amount: cleanNumber(sidechain.amount, MIX_RANGES.duckAmount, fallback.sidechain.amount),
      release: cleanNumber(sidechain.release, MIX_RANGES.duckRelease, fallback.sidechain.release),
    },
  };
}

/**
 * @param {string} division one of DELAY_DIVISION_IDS
 * @param {number} bpm
 * @returns {number} the delay time in seconds
 */
export function delaySeconds(division, bpm) {
  const beats = DELAY_DIVISIONS[/** @type {keyof typeof DELAY_DIVISIONS} */ (division)] ?? DELAY_DIVISIONS['1/8d'];
  return (beats * 60) / bpm;
}

/**
 * @param {number} release 5 to 100, a percentage of a beat
 * @param {number} bpm
 * @returns {number} how long a ducked track takes to come back, in seconds
 */
export function duckReleaseSeconds(release, bpm) {
  return ((release / 100) * 60) / bpm;
}
