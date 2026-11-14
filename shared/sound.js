// The sound controls a track can turn: an acid line's cutoff, resonance, envelope amount, decay and waveform (modelled
// on the classic 303-style bassline), and each drum's tune and decay (909-style), plus attack for the kick and snappy
// for the snare. Every knob runs 0 to 100, with 50 the instrument's usual sound for tune; a track saves only the knobs
// it uses, and a knob left out plays at its default. A drum track also picks its kit: one of the recorded samples
// bundled with the app (the first, unless chosen), or the 909-style synth voice (ADR 0009). Pure, for browser and
// server.

/** @typedef {import('./types.js').TrackSound} TrackSound */

/**
 * @typedef {{ id: KnobId, label: string, defaultValue: number, hint: string }} Knob
 * @typedef {'cutoff' | 'resonance' | 'envMod' | 'decay' | 'tune' | 'attack' | 'snappy'} KnobId
 */

export const KNOB_IDS = /** @type {const} */ (['cutoff', 'resonance', 'envMod', 'decay', 'tune', 'attack', 'snappy']);

/** The acid voice's oscillator: a sawtooth (the classic squelch) or a square (hollower). */
export const WAVEFORMS = /** @type {const} */ (['saw', 'square']);

/**
 * @param {KnobId} id
 * @param {string} label
 * @param {number} defaultValue
 * @param {string} hint
 * @returns {Knob}
 */
const knob = (id, label, defaultValue, hint) => ({ id, label, defaultValue, hint });

const TUNE = knob('tune', 'Tune', 50, 'Pitch of the drum, 50 is its usual tuning');
const DECAY = knob('decay', 'Decay', 50, 'How long the hit rings');

/** @type {Record<string, Knob[]>} the knobs of each instrument that has any */
export const SOUND_KNOBS = {
  acid: [
    knob('cutoff', 'Cutoff', 35, 'Where the 303-style ladder filter closes'),
    knob('resonance', 'Resonance', 70, 'The squelch: how hard the filter rings at its cutoff'),
    knob('envMod', 'Env mod', 55, 'How far each note opens the filter'),
    knob('decay', 'Decay', 30, 'How quickly the filter closes after each note; accents always close fast'),
  ],
  kick: [
    TUNE,
    knob('attack', 'Attack', 50, 'The click at the start of the 909-style kick'),
    knob('decay', 'Decay', 50, 'How long the kick booms'),
  ],
  snare: [TUNE, knob('snappy', 'Snappy', 50, 'How much of the rattling noise sits over the two tones'), DECAY],
  clap: [TUNE, DECAY],
  hat: [TUNE, DECAY],
  openhat: [TUNE, DECAY],
  tom: [TUNE, DECAY],
};

/** The kit that plays a drum with its synthesised voice instead of a sample. */
export const SYNTH_KIT = '909';

/**
 * @param {string} id
 * @param {string} label
 * @returns {Kit}
 */
const kit = (id, label) => ({ id, label });

const SYNTH = kit(SYNTH_KIT, '909 synth');

/**
 * @typedef {{ id: string, label: string }} Kit
 * @type {Record<string, Kit[]>} the kits of each drum that has samples, the default first. A sampled kit plays the file
 *   `public/samples/drums/<instrument>-<kit id>.flac`. The clap has no sample yet, so no choice.
 */
export const DRUM_KITS = {
  kick: [kit('tek', 'Tek'), kit('haus', 'Haus'), kit('zum', 'Zum'), SYNTH],
  snare: [kit('electro', 'Electro'), kit('dub', 'Dub'), SYNTH],
  hat: [kit('tight', 'Tight'), kit('zild', 'Zild'), kit('psych', 'Psych'), SYNTH],
  openhat: [kit('cymbal', 'Cymbal'), SYNTH],
  tom: [kit('low', 'Low'), kit('fuzz', 'Fuzz'), SYNTH],
  perc: [kit('blip', 'Blip'), kit('tick', 'Tick'), kit(SYNTH_KIT, 'Synth')],
};

/** Every kit id any drum has, for validation. */
export const KIT_IDS = /** @type {[string, ...string[]]} */ ([
  ...new Set(Object.values(DRUM_KITS).flatMap((kits) => kits.map((choice) => choice.id))),
]);

/** The knobs a sample can follow: tune is its playback speed, decay how soon it fades. */
const SAMPLE_KNOB_IDS = ['tune', 'decay'];

/**
 * @param {string} instrument
 * @returns {Kit[]} the kits it can play, none for the clap and the synths
 */
export const kitsOf = (instrument) => DRUM_KITS[instrument] ?? [];

/**
 * @param {string} instrument
 * @param {TrackSound | undefined} sound
 * @returns {string | null} the kit the track plays: its own if the instrument has it, else the default; null when the
 *   instrument has no kits
 */
export function kitOf(instrument, sound) {
  const kits = kitsOf(instrument);
  return (kits.find((choice) => choice.id === sound?.kit) ?? kits[0])?.id ?? null;
}

/**
 * @param {string} instrument
 * @param {TrackSound | undefined} sound
 * @returns {boolean} true when the track plays a recorded sample rather than a synthesised voice
 */
export function isSampled(instrument, sound) {
  const chosen = kitOf(instrument, sound);
  return chosen !== null && chosen !== SYNTH_KIT;
}

/**
 * @param {string} instrument
 * @returns {Knob[]} the knobs it has, none for most synths
 */
export const knobsOf = (instrument) => SOUND_KNOBS[instrument] ?? [];

/**
 * @param {string} instrument
 * @param {TrackSound | undefined} sound
 * @returns {Knob[]} the knobs that change how the track sounds now: a sampled drum follows tune and decay only
 */
export function activeKnobsOf(instrument, sound) {
  const knobs = knobsOf(instrument);
  return isSampled(instrument, sound) ? knobs.filter((control) => SAMPLE_KNOB_IDS.includes(control.id)) : knobs;
}

/**
 * @param {string} instrument
 * @returns {boolean} true when its waveform can be chosen
 */
export const hasWaveform = (instrument) => instrument === 'acid';

/**
 * Every knob with its value for an instrument: the track's, else the instrument's default (50 for a knob it lacks).
 * @param {string} instrument
 * @param {TrackSound | undefined} sound
 * @returns {Record<KnobId, number> & { waveform: 'saw' | 'square' }}
 */
export function soundOf(instrument, sound) {
  const knobs = knobsOf(instrument);
  const values = /** @type {Record<KnobId, number>} */ ({});
  for (const id of KNOB_IDS) {
    const value = sound?.[id];
    const fallback = knobs.find((control) => control.id === id)?.defaultValue ?? 50;
    values[id] = typeof value === 'number' && Number.isFinite(value) ? clampKnob(value) : fallback;
  }
  return { ...values, waveform: sound?.waveform === 'square' ? 'square' : 'saw' };
}

/**
 * @param {number} value
 * @returns {number} a whole number from 0 to 100
 */
function clampKnob(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * A track's sound reduced to the knobs its instrument has, each a whole number from 0 to 100. Used when a track
 * changes instrument and on anything that comes from outside.
 * @param {string} instrument
 * @param {unknown} sound
 * @returns {TrackSound}
 */
export function cleanSound(instrument, sound) {
  const source = /** @type {Record<string, unknown>} */ (sound && typeof sound === 'object' ? sound : {});
  /** @type {TrackSound} */
  const cleaned = {};
  for (const control of knobsOf(instrument)) {
    const value = Number(source[control.id]);
    if (source[control.id] !== undefined && source[control.id] !== null && Number.isFinite(value)) {
      cleaned[control.id] = clampKnob(value);
    }
  }
  if (hasWaveform(instrument) && WAVEFORMS.includes(/** @type {any} */ (source.waveform))) {
    cleaned.waveform = /** @type {'saw' | 'square'} */ (source.waveform);
  }
  if (kitsOf(instrument).some((choice) => choice.id === source.kit)) {
    cleaned.kit = /** @type {string} */ (source.kit);
  }
  return cleaned;
}
