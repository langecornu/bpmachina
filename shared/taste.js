// Taste profiles: what the person likes, learnt from tracks they love, in the terms the Machina already speaks (tempo,
// key, the sixteenth-note grid, instruments, accents and slides, sections in bars). The person keeps a library of them,
// one small JSON file each, labelled by style, moods and intensity, and picks one when composing (docs/TASTE.md, ADR
// 0012). These are their limits and vocabulary, the compact form sent to the Machina, and the library's filters. Pure,
// for browser and server; the zod schema is server/schemas/tasteSchema.js.

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
  moods: 8,
  library: 200,
};

/** A taste's id is its file name: lower-case letters, digits and dashes. */
export const TASTE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Moods offered as suggestions; any short word or phrase is allowed. */
export const SUGGESTED_MOODS = [
  'dark',
  'euphoric',
  'hypnotic',
  'driving',
  'twisted',
  'uplifting',
  'melancholic',
  'aggressive',
  'groovy',
  'trippy',
];

/** Intensity, 0 to 100, in three bands for filtering and display. */
export const INTENSITY_BANDS = [
  { id: 'low', label: 'Low', min: 0, max: 33 },
  { id: 'medium', label: 'Medium', min: 34, max: 66 },
  { id: 'high', label: 'High', min: 67, max: 100 },
];

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
 * @param {number | undefined} intensity 0 to 100
 * @returns {string} Low, Medium or High, or an empty string when it is not set
 */
export function intensityLabel(intensity) {
  return (
    INTENSITY_BANDS.find((band) => intensity !== undefined && intensity >= band.min && intensity <= band.max)?.label ??
    ''
  );
}

/**
 * @typedef {{ id: string, name: string, style: string, moods: string[], intensity?: number, updated?: string,
 *   tracks?: number }} TasteEntry one taste in the library list
 */

/**
 * The tastes that match every filter given: words in the name, style or moods; a style; a mood; an intensity band.
 * @param {TasteEntry[]} tastes
 * @param {{ query?: string, style?: string, mood?: string, intensity?: string }} filters empty values match all
 * @returns {TasteEntry[]} sorted by style, then name
 */
export function filterTastes(tastes, { query = '', style = '', mood = '', intensity = '' } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const band = INTENSITY_BANDS.find((candidate) => candidate.id === intensity);
  return tastes
    .filter((taste) => {
      const text = `${taste.name} ${taste.style} ${taste.moods.join(' ')}`.toLowerCase();
      return (
        words.every((word) => text.includes(word)) &&
        (!style || taste.style === style) &&
        (!mood || taste.moods.includes(mood)) &&
        (!band || (taste.intensity !== undefined && taste.intensity >= band.min && taste.intensity <= band.max))
      );
    })
    .sort((a, b) => a.style.localeCompare(b.style) || a.name.localeCompare(b.name));
}

/**
 * @param {TasteEntry[]} tastes
 * @returns {{ styles: string[], moods: string[] }} every style and mood used in the library, sorted
 */
export function tasteLabels(tastes) {
  const sorted = (/** @type {Iterable<string>} */ values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return { styles: sorted(tastes.map((taste) => taste.style)), moods: sorted(tastes.flatMap((taste) => taste.moods)) };
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
