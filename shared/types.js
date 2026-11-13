// Shared JSDoc types for the song document, checked by tsc (ADR 0002). The zod schema in server/schemas/songSchema.js is
// the runtime source of truth; these types describe the same shape for editors and the type checker.

/**
 * @typedef {{ root: string, scale: string }} Key
 *
 * @typedef {{ cutoff?: number, resonance?: number, envMod?: number, decay?: number, tune?: number, attack?: number,
 *   snappy?: number, waveform?: 'saw' | 'square' }} TrackSound the instrument's sound knobs, each 0 to 100; a knob left
 *   out plays at its default (shared/sound.js)
 *
 * @typedef {{ id: string, name: string, instrument: string, volume: number, muted: boolean, sound: TrackSound }} Track
 *   `volume` 0 to 100
 *
 * @typedef {{ trackId: string, step: number, length: number, pitch: number, velocity: number, accent?: boolean,
 *   slide?: boolean }} Note `step` from 0 at the start of the pattern, in sixteenth notes; `length` in steps; `pitch` a
 *   MIDI note number; `velocity` 1 to 127. `accent`: played harder (louder, and on the acid voice a brighter, shorter
 *   filter peak). `slide`: held into the track's next note, gliding to its pitch without a new attack (acid and bass).
 *   Both are left out when false.
 *
 * @typedef {{ id: string, name: string, bars: number, notes: Note[] }} Pattern
 *
 * @typedef {{ id: string, name: string, patternId: string, repeats: number, cue: string }} Section
 *   `cue`: the person's direction for this part of the song, which the AI composer follows
 *
 * @typedef {{
 *   schemaVersion: number,
 *   name: string,
 *   bpm: number,
 *   key: Key,
 *   tracks: Track[],
 *   patterns: Pattern[],
 *   sections: Section[],
 *   brief: string,
 * }} Song `brief`: the overall direction last given to the AI composer, kept so it can be refined
 */

export {};
