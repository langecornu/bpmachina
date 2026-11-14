// Validation for everything that comes from outside: the saved song, a song sent by the browser, a request to the AI
// composer, and the API key. Strict objects, bounded strings, numbers and lists, and references checked (notes point
// at tracks, sections at patterns), so nothing malformed reaches the services or the saved file.
import { z } from 'zod';

import { AI_MODEL_IDS } from '../../shared/aiModels.js';
import { INSTRUMENT_IDS } from '../../shared/instruments.js';
import { DELAY_DIVISION_IDS, MIX_RANGES } from '../../shared/mix.js';
import { MAX_BPM, MIN_BPM, NOTE_NAMES, SCALE_NAMES, STEPS_PER_BAR } from '../../shared/music.js';
import { LIMITS, MIDI_CHANNELS, SONG_SCHEMA_VERSION } from '../../shared/song.js';
import { KIT_IDS, KNOB_IDS, WAVEFORMS } from '../../shared/sound.js';

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(LIMITS.nameLength);

export const keySchema = z.strictObject({
  root: z.enum(/** @type {[string, ...string[]]} */ (NOTE_NAMES)),
  scale: z.enum(SCALE_NAMES),
});

const knob = z.number().int().min(0).max(100).optional();

/** Every knob is optional (a missing one plays at its default); which ones an instrument uses is in shared/sound.js. */
const soundSchema = z.strictObject({
  ...Object.fromEntries(KNOB_IDS.map((knobId) => [knobId, knob])),
  waveform: z.enum(WAVEFORMS).optional(),
  kit: z.enum(KIT_IDS).optional(),
});

/**
 * @param {number[]} range
 * @returns {z.ZodNumber} a whole number within the range
 */
const ranged = ([low, high]) => z.number().int().min(low).max(high);

const mixSchema = z.strictObject({
  pan: ranged(MIX_RANGES.pan),
  reverb: ranged(MIX_RANGES.send),
  delay: ranged(MIX_RANGES.send),
  duck: z.boolean(),
});

const fxSchema = z.strictObject({
  reverb: z.strictObject({
    size: ranged(MIX_RANGES.reverbSize),
    decay: ranged(MIX_RANGES.reverbDecay),
    level: ranged(MIX_RANGES.level),
  }),
  delay: z.strictObject({
    division: z.enum(DELAY_DIVISION_IDS),
    feedback: ranged(MIX_RANGES.feedback),
    tone: ranged(MIX_RANGES.tone),
    level: ranged(MIX_RANGES.level),
  }),
  sidechain: z.strictObject({
    amount: ranged(MIX_RANGES.duckAmount),
    release: ranged(MIX_RANGES.duckRelease),
  }),
});

// Where a track sounds. A MIDI device is kept by name, because the browser's ids for it change between sessions.
const outputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('synth') }),
  z.strictObject({
    kind: z.literal('midi'),
    deviceName: z.string().trim().min(1).max(120),
    channel: z.number().int().min(1).max(MIDI_CHANNELS),
    note: z.number().int().min(0).max(127).optional(),
  }),
]);

const trackSchema = z.strictObject({
  id,
  name,
  instrument: z.enum(INSTRUMENT_IDS),
  volume: z.number().int().min(0).max(100),
  muted: z.boolean(),
  sound: soundSchema,
  mix: mixSchema,
  output: outputSchema,
});

const noteSchema = z.strictObject({
  trackId: id,
  step: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.barsPerPattern * STEPS_PER_BAR - 1),
  length: z
    .number()
    .int()
    .min(1)
    .max(LIMITS.barsPerPattern * STEPS_PER_BAR),
  pitch: z.number().int().min(0).max(127),
  velocity: z.number().int().min(1).max(127),
  accent: z.boolean().optional(),
  slide: z.boolean().optional(),
});

const patternSchema = z
  .strictObject({
    id,
    name,
    bars: z.number().int().min(1).max(LIMITS.barsPerPattern),
    notes: z.array(noteSchema).max(LIMITS.notesPerPattern),
  })
  .superRefine((pattern, context) => {
    const steps = pattern.bars * STEPS_PER_BAR;
    pattern.notes.forEach((note, index) => {
      if (note.step + note.length > steps) {
        context.addIssue({
          code: 'custom',
          path: ['notes', index],
          message: 'A note runs past the end of its pattern',
        });
      }
    });
  });

const sectionSchema = z.strictObject({
  id,
  name,
  patternId: id,
  repeats: z.number().int().min(1).max(LIMITS.repeats),
  cue: z.string().max(LIMITS.cueLength),
});

/**
 * @param {{ id: string }[]} items
 * @returns {boolean}
 */
const hasUniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length;

export const songSchema = z
  .strictObject({
    schemaVersion: z.literal(SONG_SCHEMA_VERSION),
    name: z.string().trim().min(1).max(80),
    bpm: z.number().int().min(MIN_BPM).max(MAX_BPM),
    key: keySchema,
    tracks: z.array(trackSchema).max(LIMITS.tracks),
    patterns: z.array(patternSchema).min(1).max(LIMITS.patterns),
    sections: z.array(sectionSchema).max(LIMITS.sections),
    brief: z.string().max(LIMITS.briefLength),
    fx: fxSchema,
  })
  .superRefine((song, context) => {
    if (!hasUniqueIds(song.tracks) || !hasUniqueIds(song.patterns) || !hasUniqueIds(song.sections)) {
      context.addIssue({ code: 'custom', message: 'Tracks, patterns and sections each need unique ids' });
    }
    const trackIds = new Set(song.tracks.map((track) => track.id));
    const patternIds = new Set(song.patterns.map((pattern) => pattern.id));
    song.patterns.forEach((pattern, index) => {
      if (pattern.notes.some((note) => !trackIds.has(note.trackId))) {
        context.addIssue({ code: 'custom', path: ['patterns', index], message: 'A note belongs to no track' });
      }
    });
    song.sections.forEach((section, index) => {
      if (!patternIds.has(section.patternId)) {
        context.addIssue({ code: 'custom', path: ['sections', index], message: 'A section plays no pattern' });
      }
    });
  });

/** What the person asks the AI composer for. The song itself is the saved one, never sent with the request. */
export const composeRequestSchema = z
  .strictObject({
    mode: z.enum(['new', 'revise']),
    brief: z.string().trim().max(LIMITS.briefLength),
    // The structure the person wants for a new song, each part with its own direction. Empty: the AI decides.
    sections: z
      .array(
        z.strictObject({
          name,
          bars: z.number().int().min(1).max(64),
          cue: z.string().trim().max(LIMITS.cueLength),
        }),
      )
      .max(16),
    // Null: the AI chooses.
    bpm: z.number().int().min(MIN_BPM).max(MAX_BPM).nullable(),
    key: keySchema.nullable(),
    instruments: z.array(z.enum(INSTRUMENT_IDS)).max(LIMITS.tracks),
    lengthBars: z.number().int().min(4).max(256),
    // A revision: the whole song (null) or one pattern, and the tracks it must leave alone.
    patternId: id.nullable(),
    lockedTrackIds: z.array(id).max(LIMITS.tracks),
    model: z.enum(AI_MODEL_IDS),
    // Compose to the saved taste profile (ADR 0010). Left out: no.
    useTaste: z.boolean().optional(),
  })
  .refine((request) => request.mode === 'revise' || request.brief.length > 0 || request.sections.length > 0, {
    message: 'Describe the song, or list its sections with a direction for each',
  });

export const aiKeySchema = z.strictObject({
  apiKey: z.string().trim().min(20).max(400),
});

export const newSongSchema = z.strictObject({
  starter: z.boolean(),
});
