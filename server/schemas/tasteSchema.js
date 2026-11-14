// Validation for the taste profile (ADR 0012), the person's preferences file in the data folder. It is written by hand
// or by Claude in a chat from measured tracks, so it is untrusted: strict objects, every string and list bounded, every
// number ranged. Almost everything is optional, so a short hand-written profile is valid.
import { z } from 'zod';

import { INSTRUMENT_IDS } from '../../shared/instruments.js';
import { DELAY_DIVISION_IDS } from '../../shared/mix.js';
import { MAX_BPM, MIN_BPM, NOTE_NAMES, SCALE_NAMES } from '../../shared/music.js';
import {
  BASS_STYLES,
  FREQUENCIES,
  SECTION_KINDS,
  TASTE_LIMITS,
  TASTE_SCHEMA_VERSION,
  TRANSITION_KINDS,
} from '../../shared/taste.js';

const text = z.string().trim().max(TASTE_LIMITS.text);
const shortText = z.string().trim().min(1).max(TASTE_LIMITS.shortText);
const percent = z.number().int().min(0).max(100);
const bpm = z.number().min(MIN_BPM).max(MAX_BPM);
const perBar = z.number().min(0).max(16);

/** Steps of one 16-step bar where something plays: unique, 0 to 15. */
const steps = z
  .array(z.number().int().min(0).max(15))
  .max(TASTE_LIMITS.steps)
  .refine((list) => new Set(list).size === list.length, { message: 'Each step once' });

const tempoSchema = z
  .strictObject({ min: bpm, max: bpm, typical: bpm.optional() })
  .refine((tempo) => tempo.min <= tempo.max, { message: 'min must not be above max' })
  .refine((tempo) => tempo.typical === undefined || (tempo.typical >= tempo.min && tempo.typical <= tempo.max), {
    message: 'typical must be between min and max',
  });

const keysSchema = z.strictObject({
  roots: z
    .array(z.enum(/** @type {[string, ...string[]]} */ (NOTE_NAMES)))
    .max(TASTE_LIMITS.roots)
    .optional(),
  scales: z.array(z.enum(SCALE_NAMES)).max(TASTE_LIMITS.scales).optional(),
  notes: text.optional(),
});

const grooveSchema = z.strictObject({
  swing: percent.optional(),
  kickSteps: steps.optional(),
  clapSteps: steps.optional(),
  hatSteps: steps.optional(),
  openHatSteps: steps.optional(),
  notes: text.optional(),
});

const bassSchema = z.strictObject({
  style: z.enum(BASS_STYLES).optional(),
  steps: steps.optional(),
  noteLength: z.number().int().min(1).max(16).optional(),
  rootShare: percent.optional(),
  octaveJumps: z.enum(FREQUENCIES).optional(),
  notes: text.optional(),
});

const acidSchema = z.strictObject({
  presence: z.enum(FREQUENCIES).optional(),
  accentsPerBar: perBar.optional(),
  slidesPerBar: perBar.optional(),
  notes: text.optional(),
});

const instrumentSchema = z.strictObject({
  instrument: z.enum(INSTRUMENT_IDS),
  presence: z.enum(FREQUENCIES),
  role: text.optional(),
});

const soundSchema = z.strictObject({
  subBass: percent.optional(),
  brightness: percent.optional(),
  density: percent.optional(),
  reverbSize: percent.optional(),
  delayDivision: z.enum(DELAY_DIVISION_IDS).optional(),
  duckAmount: z.number().int().min(0).max(95).optional(),
  notes: text.optional(),
});

const sectionSchema = z.strictObject({
  kind: z.enum(SECTION_KINDS),
  bars: z.number().int().min(1).max(256),
  energy: percent.optional(),
  kick: z.boolean().optional(),
  cue: text.optional(),
});

const structureSchema = z.strictObject({
  lengthBars: z
    .strictObject({ min: z.number().int().min(4).max(512), max: z.number().int().min(4).max(512) })
    .refine((length) => length.min <= length.max, { message: 'min must not be above max' })
    .optional(),
  phraseBars: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]).optional(),
  sections: z.array(sectionSchema).max(TASTE_LIMITS.sections).optional(),
  energyCurve: text.optional(),
});

const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  frequency: z.enum(FREQUENCIES),
  bars: z.number().int().min(1).max(32).optional(),
  notes: text.optional(),
});

const sourceSchema = z.strictObject({
  tracks: z.number().int().min(0).max(TASTE_LIMITS.tracks),
  method: z.enum(['chat', 'app', 'hand']),
  notes: text.optional(),
});

export const tasteProfileSchema = z.strictObject({
  schemaVersion: z.literal(TASTE_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(TASTE_LIMITS.name),
  updated: z.iso.date().optional(),
  source: sourceSchema.optional(),
  genres: z
    .array(z.strictObject({ name: shortText, share: percent }))
    .max(TASTE_LIMITS.genres)
    .optional(),
  tempo: tempoSchema.optional(),
  keys: keysSchema.optional(),
  groove: grooveSchema.optional(),
  bass: bassSchema.optional(),
  acid: acidSchema.optional(),
  instruments: z.array(instrumentSchema).max(TASTE_LIMITS.instruments).optional(),
  sound: soundSchema.optional(),
  structure: structureSchema.optional(),
  transitions: z.array(transitionSchema).max(TASTE_LIMITS.transitions).optional(),
  likes: z.array(text.min(1)).max(TASTE_LIMITS.notes).optional(),
  avoid: z.array(text.min(1)).max(TASTE_LIMITS.notes).optional(),
});
