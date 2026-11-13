// The instruments a track can play. Drums are one sound per track (a kick track, a snare track), so their notes only
// say when and how hard; synths play pitches within a range. The browser's sound engine has a voice for each id, and the
// AI composer may only choose from this list. Pure, for browser and server.

/**
 * @typedef {{ id: string, name: string, kind: 'drum' | 'synth', low: number, high: number, defaultPitch: number,
 *   role: string }} Instrument `low` and `high`: the pitch range a synth plays in (drums: the one pitch they use)
 */

/** @type {Instrument[]} */
export const INSTRUMENTS = [
  { id: 'kick', name: 'Kick', kind: 'drum', low: 36, high: 36, defaultPitch: 36, role: 'the pulse, on the beats' },
  { id: 'snare', name: 'Snare', kind: 'drum', low: 38, high: 38, defaultPitch: 38, role: 'the backbeat' },
  { id: 'clap', name: 'Clap', kind: 'drum', low: 39, high: 39, defaultPitch: 39, role: 'backbeat accents' },
  { id: 'hat', name: 'Closed hat', kind: 'drum', low: 42, high: 42, defaultPitch: 42, role: 'the groove, offbeats' },
  { id: 'openhat', name: 'Open hat', kind: 'drum', low: 46, high: 46, defaultPitch: 46, role: 'lifts and offbeats' },
  { id: 'tom', name: 'Tom', kind: 'drum', low: 45, high: 45, defaultPitch: 45, role: 'fills' },
  { id: 'perc', name: 'Percussion', kind: 'drum', low: 56, high: 56, defaultPitch: 56, role: 'texture and fills' },
  { id: 'bass', name: 'Bass', kind: 'synth', low: 28, high: 55, defaultPitch: 36, role: 'the low end, the root' },
  {
    id: 'acid',
    name: 'Acid',
    kind: 'synth',
    low: 36,
    high: 72,
    defaultPitch: 52,
    role: 'squelchy resonant lines, the hypnotic hook',
  },
  { id: 'lead', name: 'Lead', kind: 'synth', low: 55, high: 88, defaultPitch: 72, role: 'the melody, the hook' },
  { id: 'pluck', name: 'Pluck', kind: 'synth', low: 48, high: 84, defaultPitch: 64, role: 'arpeggios and riffs' },
  { id: 'keys', name: 'Keys', kind: 'synth', low: 48, high: 79, defaultPitch: 60, role: 'chords and comping' },
  { id: 'pad', name: 'Pad', kind: 'synth', low: 45, high: 79, defaultPitch: 60, role: 'held chords, atmosphere' },
  {
    id: 'fx',
    name: 'FX',
    kind: 'synth',
    low: 36,
    high: 96,
    defaultPitch: 60,
    role: 'risers and sweeps: a long note rises in pitch into the next section',
  },
];

export const INSTRUMENT_IDS = /** @type {[string, ...string[]]} */ (INSTRUMENTS.map((instrument) => instrument.id));

const BY_ID = new Map(INSTRUMENTS.map((instrument) => [instrument.id, instrument]));

/**
 * @param {string} id
 * @returns {Instrument} the instrument, or the lead for an unknown id
 */
export function instrumentOf(id) {
  return BY_ID.get(id) ?? /** @type {Instrument} */ (BY_ID.get('lead'));
}

/**
 * @param {string} id
 * @returns {boolean} true for a one-sound drum track
 */
export function isDrum(id) {
  return instrumentOf(id).kind === 'drum';
}
