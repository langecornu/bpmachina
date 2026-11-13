// Music theory the app needs, and nothing more: note names, keys and scales, the step grid, and frequencies. Pure, for
// browser and server. Pitches are MIDI note numbers (60 is middle C, C4).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Semitones above the root, for each scale the composer and the editor offer. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'minor pentatonic': [0, 3, 5, 7, 10],
  'major pentatonic': [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
};

export const SCALE_NAMES = /** @type {[string, ...string[]]} */ (Object.keys(SCALES));

/** The grid: sixteenth notes, four to a beat, four beats to a bar. */
export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;

export const MIN_BPM = 40;
export const MAX_BPM = 220;

/** @typedef {{ root: string, scale: string }} Key */

/**
 * @param {number} pitch MIDI note number
 * @returns {string} for example "C4" or "F#2"
 */
export function noteName(pitch) {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

/**
 * @param {number} pitch MIDI note number
 * @returns {number} in hertz, equal temperament with A4 at 440
 */
export function frequencyOf(pitch) {
  return 440 * 2 ** ((pitch - 69) / 12);
}

/**
 * @param {Key} key
 * @returns {Set<number>} the pitch classes (0 to 11) in the key
 */
export function pitchClassesOf(key) {
  const root = Math.max(0, NOTE_NAMES.indexOf(key.root));
  const intervals = SCALES[/** @type {keyof typeof SCALES} */ (key.scale)] ?? SCALES.major;
  return new Set(intervals.map((interval) => (root + interval) % 12));
}

/**
 * @param {number} pitch
 * @param {Key} key
 * @returns {boolean}
 */
export function isInKey(pitch, key) {
  return pitchClassesOf(key).has(((pitch % 12) + 12) % 12);
}

/**
 * @param {Key} key
 * @returns {string} for example "A minor"
 */
export function keyLabel(key) {
  return `${key.root} ${key.scale}`;
}

/**
 * @param {number} bpm
 * @returns {number} seconds per sixteenth-note step
 */
export function stepSeconds(bpm) {
  return 60 / bpm / STEPS_PER_BEAT;
}

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
