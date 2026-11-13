// Shared JSDoc types for the song document, checked by tsc (ADR 0002). The zod schema in server/schemas/songSchema.js is
// the runtime source of truth; these types describe the same shape for editors and the type checker.

/**
 * @typedef {{ root: string, scale: string }} Key
 *
 * @typedef {{ pan: number, reverb: number, delay: number, duck: boolean }} TrackMix where the track sits in the mix:
 *   `pan` -100 (left) to 100 (right); `reverb` and `delay` how much it sends to each, 0 to 100; `duck` true to dip
 *   under every kick (sidechain)
 *
 * @typedef {{ id: string, name: string, instrument: string, volume: number, muted: boolean, mix: TrackMix }} Track
 *   `volume` 0 to 100
 *
 * @typedef {{
 *   reverb: { size: number, decay: number, level: number },
 *   delay: { division: string, feedback: number, tone: number, level: number },
 *   sidechain: { amount: number, release: number },
 * }} SongFx the effects every track shares. 0 to 100 except: `delay.division` one of 1/16, 1/8, 1/8d (dotted) and 1/4;
 *   `delay.feedback` 0 to 90; `sidechain.amount` 0 to 95 (how deep the duck goes); `sidechain.release` 5 to 100 (how
 *   long it takes to come back, in hundredths of a beat)
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
 *   fx: SongFx,
 * }} Song `brief`: the overall direction last given to the AI composer, kept so it can be refined
 */

export {};
