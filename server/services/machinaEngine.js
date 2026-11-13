// The Machina Engine, BPMachina's AI composer: asks Claude to write a song, or to revise the one being worked on,
// following the person's direction (a brief, a structure with a cue for each section, tempo, key and instruments) and
// leaving the tracks they locked alone. The person sets the pulse; the Machina does the heavy lifting. The answer comes back as JSON in a fixed shape (structured outputs), then shared/composition.js checks
// it and turns it into a song. The API key stays on the server.
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import { DEFAULT_AI_MODEL, aiModel } from '../../shared/aiModels.js';
import { buildSong, revisePattern, reviseSong } from '../../shared/composition.js';
import { INSTRUMENTS, INSTRUMENT_IDS, instrumentOf } from '../../shared/instruments.js';
import { NOTE_NAMES, SCALE_NAMES, keyLabel } from '../../shared/music.js';
import { LIMITS } from '../../shared/song.js';
import { logger } from '../logger.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'machina' });

/** @typedef {import('../../shared/types.js').Song} Song */

/** What Claude answers: the shape is enforced by the API, the values are checked in shared/composition.js. */
export const compositionSchema = z.object({
  summary: z
    .string()
    .describe('Two or three sentences for the person: the musical idea and how it follows their direction'),
  title: z.string().describe('A short song title, at most 40 characters'),
  bpm: z.number().describe('Tempo in beats per minute'),
  key: z.object({
    root: z.enum(/** @type {[string, ...string[]]} */ (NOTE_NAMES)),
    scale: z.enum(SCALE_NAMES),
  }),
  tracks: z.array(
    z.object({
      name: z.string().describe('Unique, for example "Kick" or "Bass"'),
      instrument: z.enum(INSTRUMENT_IDS),
    }),
  ),
  patterns: z.array(
    z.object({
      name: z.string().describe('Unique, for example "Verse A" or "Drop"'),
      bars: z.number().describe(`1 to ${LIMITS.barsPerPattern}`),
      notes: z.array(
        z.object({
          track: z.string().describe('The name of one of the tracks above'),
          step: z.number().describe('Start, in sixteenth notes from the start of the pattern, from 0'),
          length: z.number().describe('In sixteenth notes; 1 for drums'),
          pitch: z.number().describe('MIDI note number, 60 is middle C; drums: any'),
          velocity: z.number().describe('1 to 127'),
          accent: z.boolean().optional().describe('true to accent the note; leave out otherwise'),
          slide: z
            .boolean()
            .optional()
            .describe(
              'true to slide from this note into the next note of the track (acid and bass); leave out otherwise',
            ),
        }),
      ),
    }),
  ),
  sections: z.array(
    z.object({
      name: z.string(),
      pattern: z.string().describe('The name of one of the patterns above'),
      repeats: z.number().describe(`How many times the pattern plays in a row, 1 to ${LIMITS.repeats}`),
      cue: z.string().describe('The direction for this section: the one you were given, or a short note of your own'),
    }),
  ),
});

const instrumentLines = INSTRUMENTS.map(
  (instrument) =>
    `- ${instrument.id}: ${instrument.name}, ${instrument.kind === 'drum' ? 'one drum sound' : `pitches ${instrument.low} to ${instrument.high}`}; ${instrument.role}`,
).join('\n');

// Stable, so it is cached between compositions.
const SYSTEM_PROMPT = `You are the Machina Engine, the composer inside BPMachina, a pattern-based music app for driving electronic music. You write songs as data: tracks, patterns of notes, and sections that arrange the patterns in time. A person directs you and sets the pulse: follow their brief, their structure and their cue for each section closely, and do the heavy lifting on everything they leave open with good musical judgement.

Your home ground is high-energy electronic music, and you know its conventions well (any genre the person asks for is welcome):
- Psytrance (about 138 to 148 BPM, often in E or F# minor or phrygian): a four-on-the-floor kick with a rolling bass on the three sixteenths after each kick, short and tight; offbeat hats and a clap or snare on beats 2 and 4; acid lines and hypnotic arpeggios that mutate slowly; long builds, breakdowns with atmosphere, and a drop that brings the full roll back.
- Hard trance (about 140 to 150 BPM): a hard kick, an offbeat bass on the "and" of each beat, big supersaw-style chord stabs and an anthemic lead in minor, rising builds into the peak.
- NRG and hi-NRG (about 140 to 160 BPM): driving octave-bouncing offbeat bass, bright synth riffs, relentless energy.

How the app works:
- Time is a grid of sixteenth notes: 4 steps to a beat, 16 steps to a bar of 4/4. A pattern is 1 to ${LIMITS.barsPerPattern} bars long, so its steps run from 0 to bars × 16 − 1. A note starts on a step and lasts a number of steps; it must end within its pattern.
- Each track plays one instrument. Drum instruments are one sound per track (a kick track, a snare track): their notes only say when (step) and how hard (velocity, 1 to 127); write length 1. Synth instruments play pitches as MIDI note numbers (60 is middle C), within their range; play chords as several notes on the same step.
- The instruments:
${instrumentLines}
- Accent and slide, the two marks of an acid line (as on the 303-style bassline the acid instrument is modelled on). A note with accent: true is played harder: louder, and on the acid instrument the filter opens brighter and snaps shut faster, so it barks. Drums take accents too (louder hits). A note with slide: true is held into the track's next note and glides to its pitch in about 60 ms with no new attack: the rubbery, talking sound of acid. Slides work on the acid and bass instruments only, and only into a later note of the same track in the same pattern; let the sliding note run up to the next one. Leave both out of notes that have neither.
- Sections play in order. Each plays one pattern, repeated a number of times, so a section lasts the pattern's bars × repeats. Reuse a pattern in several sections where the music repeats; write a new pattern where it changes.

Write well:
- Stay in the key: every pitched note in the scale, except a deliberate passing or blue note.
- Groove first: a steady pulse, a clear backbeat where the style has one, hats or percussion that give the feel, and velocity dynamics (strong beats louder, ghost notes quieter).
- Acid lines live on accents and slides: on every acid track, accent about one note in three or four (often the ones on or just before the beat, never all of them) and slide two or three notes per bar, mostly between nearby pitches or up and down an octave, so the line squelches and talks. A bass line can slide too, sparingly, into a fill or a change of root.
- Give the bass the roots of the harmony, locked with the kick. Voice chords smoothly from one to the next. Give the lead or pluck a memorable motif, then vary it rather than repeating it unchanged.
- Shape the whole song: build and release energy across sections, thin out before a peak, bring parts in and out, and end in a way that resolves.
- Match the genre's conventions for tempo, swing, density and sound unless the direction says otherwise.
- Keep each pattern under ${LIMITS.notesPerPattern} notes and use at most ${LIMITS.tracks} tracks and ${LIMITS.patterns} patterns.`;

/**
 * @param {import('../../shared/types.js').Note} note
 * @returns {(number | string)[]} [step, length, pitch, velocity], and "A", "S" or "AS" when it is accented or slides
 */
function compactNote(note) {
  const marks = `${note.accent ? 'A' : ''}${note.slide ? 'S' : ''}`;
  const values = [note.step, note.length, note.pitch, note.velocity];
  return marks ? [...values, marks] : values;
}

/**
 * The song as compact JSON for a revision: notes per track as [step, length, pitch, velocity, marks?].
 * @param {Song} song
 * @param {Set<string>} lockedIds
 */
function describeSong(song, lockedIds) {
  const trackNames = new Map(song.tracks.map((track) => [track.id, track.name]));
  return {
    title: song.name,
    bpm: song.bpm,
    key: song.key,
    tracks: song.tracks.map((track) => ({
      name: track.name,
      instrument: track.instrument,
      ...(lockedIds.has(track.id) ? { locked: true } : {}),
    })),
    patterns: song.patterns.map((pattern) => {
      /** @type {Record<string, (number | string)[][]>} */
      const notes = {};
      for (const note of pattern.notes) {
        const name = trackNames.get(note.trackId) ?? '?';
        (notes[name] ??= []).push(compactNote(note));
      }
      return { name: pattern.name, bars: pattern.bars, notes };
    }),
    sections: song.sections.map((section) => ({
      name: section.name,
      pattern: song.patterns.find((pattern) => pattern.id === section.patternId)?.name ?? '?',
      repeats: section.repeats,
      cue: section.cue,
    })),
  };
}

/**
 * The request as the AI reads it.
 * @param {Song} song the saved song, which a revision changes
 * @param {any} request validated by composeRequestSchema
 * @returns {string}
 */
export function buildRequest(song, request) {
  const parts = [];
  if (request.mode === 'new') {
    parts.push('Compose a new song.');
  } else {
    const lockedIds = new Set(request.lockedTrackIds);
    const target = song.patterns.find((pattern) => pattern.id === request.patternId);
    parts.push(
      'Revise this song. Notes are listed per track as [step, length, pitch, velocity], with a fifth value "A" for an accent, "S" for a slide or "AS" for both:',
      JSON.stringify(describeSong(song, lockedIds)),
      target
        ? `Change only the pattern "${target.name}". Answer with that one pattern (same name), the song's tracks, its tempo and key unchanged, and its sections unchanged.`
        : 'Answer with the whole revised song: every track, pattern and section, including the parts you keep as they are. Keep the names of patterns and sections you keep.',
      lockedIds.size > 0
        ? `Do not change the locked tracks (${song.tracks
            .filter((track) => lockedIds.has(track.id))
            .map((track) => `"${track.name}"`)
            .join(
              ', ',
            )}): keep them in the tracks list, leave their notes out of patterns that already exist, and write around them.`
        : '',
    );
  }
  if (request.brief) {
    parts.push(`${request.mode === 'new' ? 'The brief' : 'The direction'}: ${request.brief}`);
  }
  if (request.mode === 'new') {
    parts.push(
      request.bpm === null ? 'Choose the tempo.' : `Tempo: ${request.bpm} beats a minute.`,
      request.key === null ? 'Choose the key.' : `Key: ${keyLabel(request.key)}.`,
      request.instruments.length > 0
        ? `Use these instruments, one track each unless the music needs two: ${request.instruments.map((/** @type {string} */ id) => instrumentOf(id).name).join(', ')}.`
        : 'Choose the instruments: usually 4 to 8 tracks.',
    );
    if (request.sections.length > 0) {
      parts.push(
        'The structure, in order. Write one section for each, with the same name and the same length in bars (pattern bars × repeats), following its cue:',
        request.sections
          .map(
            (/** @type {{ name: string, bars: number, cue: string }} */ section) =>
              `- ${section.name}, ${section.bars} bars${section.cue ? `: ${section.cue}` : ''}`,
          )
          .join('\n'),
      );
    } else {
      parts.push(`Make the song about ${request.lengthBars} bars long in all, with a structure that suits the brief.`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Turns an API failure into a message for the person, without internals.
 * @param {unknown} error
 * @returns {Error & { status: number }}
 */
export function explainAiError(error) {
  if (error instanceof AuthenticationError) {
    return httpError(400, 'Anthropic refused the API key. Paste a valid key in Settings.');
  }
  if (error instanceof PermissionDeniedError || error instanceof NotFoundError) {
    return httpError(
      400,
      'This API key cannot use the AI model. Check the key and its workspace in the Anthropic Console.',
    );
  }
  if (error instanceof RateLimitError) {
    return httpError(
      429,
      'The API key has reached its usage limit for now. Try again in a minute, or check its limits.',
    );
  }
  if (error instanceof BadRequestError) {
    return httpError(400, `Anthropic could not take the request: ${error.message}`);
  }
  if (error instanceof APIConnectionError) {
    return httpError(503, 'Could not reach Anthropic. Check the internet connection.', { expose: true });
  }
  return httpError(503, 'Anthropic did not answer as expected. Try again in a moment.', { expose: true });
}

/**
 * Checks a key by asking about the model it will use.
 * @param {string} apiKey
 * @param {(apiKey: string) => Anthropic} [createClient]
 */
export async function checkApiKey(apiKey, createClient = (key) => new Anthropic({ apiKey: key })) {
  try {
    await createClient(apiKey).models.retrieve(DEFAULT_AI_MODEL);
  } catch (error) {
    log.warn({ status: error instanceof Anthropic.APIError ? error.status : undefined }, 'API key check failed');
    throw explainAiError(error);
  }
}

/**
 * @param {{
 *   apiKey: string,
 *   song: Song,
 *   request: any,
 *   makeId: () => string,
 *   createClient?: (apiKey: string) => Anthropic,
 * }} options `request` validated by composeRequestSchema
 * @returns {Promise<{ song: Song, summary: string, model: string,
 *   usage: { inputTokens: number, outputTokens: number } }>}
 */
export async function compose({
  apiKey,
  song,
  request,
  makeId,
  createClient = (key) => new Anthropic({ apiKey: key }),
}) {
  if (request.mode === 'revise' && request.patternId && !song.patterns.some((p) => p.id === request.patternId)) {
    throw httpError(400, 'That pattern is no longer in the song. Pick another one.');
  }
  let message;
  try {
    // Streamed, so a long answer does not hit an HTTP timeout. On models that have one, a request the model declines
    // is retried on a fallback model.
    const model = aiModel(request.model ?? DEFAULT_AI_MODEL);
    const stream = createClient(apiKey).beta.messages.stream({
      model: model.id,
      max_tokens: 64000,
      ...(model.hasFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      output_config: { effort: 'medium', format: zodOutputFormat(compositionSchema) },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildRequest(song, request) }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, 'Composition failed');
    throw explainAiError(error);
  }
  if (message.stop_reason === 'refusal') {
    throw httpError(422, 'The AI declined this request. Try describing the music differently.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw httpError(
      422,
      'The song was too big to finish. Ask for a shorter song, fewer tracks, or revise one pattern.',
    );
  }
  const textBlock = message.content.find((block) => block.type === 'text');
  let composition;
  try {
    composition = compositionSchema.parse(JSON.parse(textBlock && 'text' in textBlock ? textBlock.text : ''));
  } catch {
    throw httpError(502, 'The AI answered in an unexpected shape. Try again.', { expose: true });
  }
  const options = { makeId, lockedTrackIds: request.lockedTrackIds };
  let result;
  if (request.mode === 'new') {
    result = { ...buildSong(composition, { makeId, existingTracks: song.tracks }), brief: request.brief };
  } else if (request.patternId) {
    result = revisePattern(song, composition, { ...options, patternId: request.patternId });
  } else {
    result = reviseSong(song, composition, options);
  }
  if (result.tracks.length === 0 || result.patterns.length === 0) {
    throw httpError(502, 'The AI answered without any music the app can play. Try again.', { expose: true });
  }
  log.info(
    {
      model: message.model,
      mode: request.mode,
      patterns: result.patterns.length,
      notes: result.patterns.reduce((total, pattern) => total + pattern.notes.length, 0),
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
    'Composed',
  );
  return {
    song: result,
    summary: composition.summary.slice(0, 600),
    // The model that answered, which a fallback may have changed, so the cost shown is at its prices.
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
  };
}
