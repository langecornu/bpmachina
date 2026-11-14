// How many voices each Faust instrument's pool holds: enough for the chords and overlapping releases a track plays,
// few enough that a pool costs little to create. Voices that are silent cost nothing to run (see synthCore.js), so this
// is a ceiling, not a cost. A note past the ceiling takes over the voice that has been fading longest.

/** @type {Record<string, number>} */
export const POLYPHONY = { bass: 3, acid: 3, lead: 6, pluck: 8, keys: 10, pad: 12, fx: 2 };
