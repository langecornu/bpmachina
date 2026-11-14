// The taste profile: what the person likes, learnt from tracks they love, in the terms the Machina already speaks
// (tempo, key, the sixteenth-note grid, instruments, accents and slides, sections in bars). It is one small JSON file a
// person can read and edit by hand (docs/TASTE.md, ADR 0012). These are its limits and vocabulary, and the compact
// form sent to the Machina. Pure, for browser and server; the zod schema is server/schemas/tasteSchema.js.

export const TASTE_SCHEMA_VERSION = 1;

/** Bounds on every list and string, so a hand-edited or generated file stays small. */
export const TASTE_LIMITS = {
  name: 80,
  text: 200,
  shortText: 60,
  genres: 6,
  roots: 12,
  scales: 6,
  steps: 16,
  instruments: 14,
  sections: 12,
  transitions: 10,
  notes: 12,
  tracks: 500,
};

/** How the bass line moves against the kick. */
export const BASS_STYLES = ['rolling', 'offbeat', 'octave', 'galloping', 'sustained', 'melodic', 'other'];

/** How one part of a song hands over to the next. */
export const TRANSITION_KINDS = ['riser', 'snare-roll', 'fill', 'kick-gap', 'filter-sweep', 'crash', 'drop', 'other'];

/** Section names the Machina knows. Any other name can still be written in `cue`. */
export const SECTION_KINDS = ['intro', 'build', 'drop', 'breakdown', 'bridge', 'peak', 'outro'];

/** How often something is heard: rarely, sometimes, often, always. */
export const FREQUENCIES = ['rarely', 'sometimes', 'often', 'always'];

/**
 * The profile as the Machina reads it: everything that describes the music, without the bookkeeping (version, when it
 * was made, from how many tracks). Key order is fixed, so the same profile always sends the same text.
 * @param {import('./types.js').TasteProfile} profile already validated
 * @returns {Omit<import('./types.js').TasteProfile, 'schemaVersion' | 'updated' | 'source'>}
 */
export function tasteForMachina(profile) {
  const music = /** @type {Partial<import('./types.js').TasteProfile>} */ ({ ...profile });
  delete music.schemaVersion;
  delete music.updated;
  delete music.source;
  return /** @type {Omit<import('./types.js').TasteProfile, 'schemaVersion' | 'updated' | 'source'>} */ (music);
}

/**
 * Steps of a 16-step bar as a picture, for people: x where something plays, . where it rests.
 * @param {number[]} steps 0 to 15
 * @returns {string} for example "x...x...x...x..."
 */
export function stepPicture(steps) {
  const set = new Set(steps);
  return Array.from({ length: 16 }, (_, step) => (set.has(step) ? 'x' : '.')).join('');
}
