// Shared JSDoc types for the song document, checked by tsc (ADR 0002). The zod schema in server/schemas/songSchema.js is
// the runtime source of truth; these types describe the same shape for editors and the type checker.

/**
 * @typedef {{ root: string, scale: string }} Key
 *
 * @typedef {{ kind: 'synth' } | { kind: 'midi', deviceName: string, channel: number, note?: number }} TrackOutput
 *   Where a track sounds: the built-in synth, or a MIDI output found by its name (ids change between sessions) on a
 *   channel from 1 to 16. `note`: for a drum track, the note to send instead of the instrument's General MIDI note
 *
 * @typedef {{ id: string, name: string, instrument: string, volume: number, muted: boolean, output: TrackOutput }}
 *   Track `volume` 0 to 100
 *
 * @typedef {{ trackId: string, step: number, length: number, pitch: number, velocity: number }} Note
 *   `step` from 0 at the start of the pattern, in sixteenth notes; `length` in steps; `pitch` a MIDI note number;
 *   `velocity` 1 to 127
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
