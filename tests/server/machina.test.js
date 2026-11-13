// Integration tests for the Machina Engine and its API key, with a stand-in for Anthropic's client: the key is
// write-only, the request carries the person's direction, the answer is checked and turned into a song, locked tracks
// are kept, and every failure reaches the person as a plain message.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { AuthenticationError, RateLimitError } from '@anthropic-ai/sdk';

import { buildRequest } from '../../server/services/machinaEngine.js';
import { createMockAnthropic, startApp } from './helpers.js';

const KEY = 'sk-ant-api03-test-key-0123456789abcdef';

/** A small composition with the faults the app must clean up: a repeated track name, a duplicate hit, a bass note out
 * of range, notes past the end or on unknown tracks, and a section playing an unknown pattern. */
const composition = {
  summary: 'A rolling groove.',
  title: 'Test Roller',
  bpm: 141,
  key: { root: 'F#', scale: 'minor' },
  tracks: [
    { name: 'Kick', instrument: 'kick' },
    { name: 'Bass', instrument: 'bass' },
    { name: 'Kick', instrument: 'kick' },
  ],
  patterns: [
    {
      name: 'Roll',
      bars: 1,
      notes: [
        { track: 'Kick', step: 0, length: 3, pitch: 99, velocity: 120 },
        { track: 'Kick', step: 0, length: 1, pitch: 36, velocity: 120 },
        { track: 'Bass', step: 1, length: 1, pitch: 90, velocity: 110 },
        { track: 'Nobody', step: 2, length: 1, pitch: 40, velocity: 100 },
        { track: 'Bass', step: 40, length: 1, pitch: 40, velocity: 100 },
      ],
    },
  ],
  sections: [
    { name: 'Intro', pattern: 'Roll', repeats: 2, cue: 'Start tight.' },
    { name: 'Ghost', pattern: 'Missing', repeats: 1, cue: '' },
  ],
};

const newRequest = {
  mode: 'new',
  brief: 'Dark psytrance roller',
  sections: [{ name: 'Intro', bars: 8, cue: 'Kick and bass only' }],
  bpm: 142,
  key: { root: 'E', scale: 'phrygian' },
  instruments: ['kick', 'bass'],
  lengthBars: 32,
  patternId: null,
  lockedTrackIds: [],
  model: 'claude-opus-5-5',
};

let app;
let mock;

beforeEach(async () => {
  mock = createMockAnthropic();
  mock.answer = composition;
  app = await startApp({ aiClient: mock.client });
});

afterEach(async () => {
  await app.close();
});

describe('Anthropic API key', () => {
  it('is checked, saved for the owner only, and never sent back', async () => {
    assert.deepEqual((await app.call('/settings/ai')).body, { hasKey: false, source: null });
    const saved = await app.call('/settings/ai', 'PUT', { apiKey: KEY });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body, { hasKey: true, source: 'saved' });
    assert.ok(!JSON.stringify(saved.body).includes(KEY), 'the key is never in an answer');
    const file = path.join(app.dataDir, 'secrets.json');
    assert.equal((await stat(file)).mode & 0o777, 0o600, 'only the owner can read the key file');
    assert.match(await readFile(file, 'utf8'), /sk-ant-api03/);
  });

  it('is refused when Anthropic refuses it', async () => {
    mock.error = new AuthenticationError(401, { type: 'error' }, 'bad key', new Headers());
    const { status, body } = await app.call('/settings/ai', 'PUT', { apiKey: KEY });
    assert.equal(status, 400);
    assert.match(body.error, /refused the API key/);
  });

  it('can be removed', async () => {
    await app.call('/settings/ai', 'PUT', { apiKey: KEY });
    assert.deepEqual((await app.call('/settings/ai', 'DELETE')).body, { hasKey: false, source: null });
  });

  it('comes from the environment when ANTHROPIC_API_KEY is set', async () => {
    const withEnv = await startApp({ aiClient: mock.client, env: { ANTHROPIC_API_KEY: KEY } });
    try {
      assert.deepEqual((await withEnv.call('/settings/ai')).body, { hasKey: true, source: 'environment' });
    } finally {
      await withEnv.close();
    }
  });
});

describe('composing', () => {
  beforeEach(async () => {
    await app.call('/settings/ai', 'PUT', { apiKey: KEY });
  });

  it('asks for a key before composing', async () => {
    await app.call('/settings/ai', 'DELETE');
    const { status, body } = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(status, 400);
    assert.match(body.error, /API key in Settings/);
  });

  it('sends the direction, a cached system prompt and the fallback on Opus', async () => {
    const { status } = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(status, 200);
    const [sent] = mock.requests;
    assert.equal(sent.model, 'claude-opus-5-5');
    assert.equal(sent.fallbacks, 'default', 'a declined request falls back on Opus');
    assert.deepEqual(sent.system[0].cache_control, { type: 'ephemeral' }, 'the system prompt is cached');
    assert.match(sent.system[0].text, /Machina Engine/);
    assert.match(sent.system[0].text, /Psytrance/);
    const text = sent.messages[0].content;
    assert.match(text, /Dark psytrance roller/);
    assert.match(text, /Tempo: 142/);
    assert.match(text, /E phrygian/);
    assert.match(text, /- Intro, 8 bars: Kick and bass only/);
    assert.equal(mock.keys[mock.keys.length - 1], KEY);
  });

  it('does not ask Haiku for a fallback it does not have', async () => {
    await app.call('/machina/compose', 'POST', { ...newRequest, model: 'claude-haiku-5-5' });
    assert.equal(mock.requests[0].fallbacks, undefined);
  });

  it('turns the answer into a valid song and does not save it', async () => {
    const { body } = await app.call('/machina/compose', 'POST', newRequest);
    const { song } = body;
    assert.equal(song.name, 'Test Roller');
    assert.equal(song.bpm, 141);
    assert.deepEqual(song.key, { root: 'F#', scale: 'minor' });
    assert.deepEqual(
      song.tracks.map((track) => track.instrument),
      ['kick', 'bass'],
      'a repeated track name is dropped',
    );
    const notes = song.patterns[0].notes;
    assert.equal(notes.length, 2, 'duplicates, notes past the end and notes on unknown tracks are dropped');
    assert.deepEqual(notes[0], { trackId: song.tracks[0].id, step: 0, length: 1, pitch: 36, velocity: 120 });
    assert.equal(notes[1].pitch, 54, 'a bass note too high is moved down by octaves into range');
    assert.deepEqual(
      song.sections.map((section) => section.name),
      ['Intro'],
      'a section playing an unknown pattern is dropped',
    );
    assert.equal(song.brief, 'Dark psytrance roller');
    assert.equal(body.summary, 'A rolling groove.');
    assert.deepEqual(body.usage, { inputTokens: 1500, outputTokens: 4200 });
    assert.equal(body.model, 'answered-by');
    assert.notEqual((await app.call('/song')).body.name, 'Test Roller', 'the browser keeps the result, not the server');
    assert.equal((await app.call('/song', 'PUT', song)).status, 200, 'the result passes the song schema');
  });

  it('revises one pattern and keeps the locked tracks exactly', async () => {
    const { body: song } = await app.call('/song');
    const roll = song.patterns.find((pattern) => pattern.name === 'Roll');
    const kick = song.tracks.find((track) => track.instrument === 'kick');
    const bass = song.tracks.find((track) => track.instrument === 'bass');
    mock.answer = {
      ...composition,
      tracks: song.tracks.map((track) => ({ name: track.name, instrument: track.instrument })),
      patterns: [
        {
          name: 'Roll',
          bars: 2,
          notes: [
            { track: 'Kick', step: 2, length: 1, pitch: 36, velocity: 50 },
            { track: 'Bass', step: 0, length: 4, pitch: 40, velocity: 100 },
          ],
        },
      ],
    };
    const { status, body } = await app.call('/machina/compose', 'POST', {
      ...newRequest,
      mode: 'revise',
      brief: 'Make the bass hold longer',
      sections: [],
      bpm: null,
      key: null,
      instruments: [],
      patternId: roll.id,
      lockedTrackIds: [kick.id],
    });
    assert.equal(status, 200);
    const revised = body.song.patterns.find((pattern) => pattern.id === roll.id);
    const kickNotes = (pattern) => pattern.notes.filter((note) => note.trackId === kick.id);
    assert.deepEqual(kickNotes(revised), kickNotes(roll), 'the locked kick is untouched');
    assert.deepEqual(
      revised.notes.filter((note) => note.trackId === bass.id),
      [{ trackId: bass.id, step: 0, length: 4, pitch: 40, velocity: 100 }],
      'the bass is rewritten',
    );
    assert.deepEqual(
      body.song.patterns.filter((pattern) => pattern.id !== roll.id),
      song.patterns.filter((pattern) => pattern.id !== roll.id),
      'other patterns are untouched',
    );
    assert.equal(body.song.bpm, song.bpm, 'a pattern revision keeps the tempo');
    const text = mock.requests[0].messages[0].content;
    assert.match(text, /Change only the pattern "Roll"/);
    assert.match(text, /Do not change the locked tracks \("Kick"\)/);
    assert.match(text, /The direction: Make the bass hold longer/);
  });

  it('revises the whole song, keeping locked notes in patterns that existed and the cues', async () => {
    const { body: song } = await app.call('/song');
    const kick = song.tracks.find((track) => track.instrument === 'kick');
    mock.answer = {
      ...composition,
      tracks: [
        { name: 'Kick', instrument: 'kick' },
        { name: 'Bass', instrument: 'bass' },
      ],
      patterns: [
        { name: 'Roll', bars: 2, notes: [{ track: 'Kick', step: 3, length: 1, pitch: 36, velocity: 99 }] },
        { name: 'Fresh', bars: 1, notes: [{ track: 'Kick', step: 5, length: 1, pitch: 36, velocity: 99 }] },
      ],
      sections: [
        { name: 'Roll', pattern: 'Roll', repeats: 2, cue: '' },
        { name: 'New part', pattern: 'Fresh', repeats: 1, cue: 'Something new' },
      ],
    };
    const { body } = await app.call('/machina/compose', 'POST', {
      ...newRequest,
      mode: 'revise',
      brief: 'Tighten it',
      sections: [],
      bpm: null,
      key: null,
      instruments: [],
      lockedTrackIds: [kick.id],
    });
    const oldRoll = song.patterns.find((pattern) => pattern.name === 'Roll');
    const roll = body.song.patterns.find((pattern) => pattern.name === 'Roll');
    const fresh = body.song.patterns.find((pattern) => pattern.name === 'Fresh');
    assert.equal(roll.id, oldRoll.id, 'a pattern that existed keeps its id');
    assert.deepEqual(
      roll.notes.filter((note) => note.trackId === kick.id),
      oldRoll.notes.filter((note) => note.trackId === kick.id),
      'in a pattern that existed, the locked kick keeps its notes',
    );
    assert.equal(fresh.notes.length, 1, 'a new pattern takes the locked track’s new notes');
    assert.equal(
      body.song.sections[0].cue,
      song.sections.find((s) => s.name === 'Roll').cue,
      'an empty cue keeps yours',
    );
    assert.equal(body.song.brief, song.brief, 'the brief is kept');
    assert.match(mock.requests[0].messages[0].content, /Answer with the whole revised song/);
  });

  it('refuses a revision of a pattern that is gone', async () => {
    const { status, body } = await app.call('/machina/compose', 'POST', {
      ...newRequest,
      mode: 'revise',
      patternId: 'gone',
    });
    assert.equal(status, 400);
    assert.match(body.error, /no longer in the song/);
  });

  it('refuses a new song with no direction at all', async () => {
    const { status } = await app.call('/machina/compose', 'POST', { ...newRequest, brief: '', sections: [] });
    assert.equal(status, 400);
  });

  it('explains a declined request, an answer cut short and an answer in the wrong shape', async () => {
    mock.stopReason = 'refusal';
    assert.equal((await app.call('/machina/compose', 'POST', newRequest)).status, 422);
    mock.stopReason = 'max_tokens';
    const cut = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(cut.status, 422);
    assert.match(cut.body.error, /too big/);
    mock.stopReason = 'end_turn';
    mock.answer = '{ "half": ';
    const malformed = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(malformed.status, 502);
    assert.match(malformed.body.error, /unexpected shape/);
  });

  it('explains an answer with no music in it', async () => {
    mock.answer = { ...composition, tracks: [] };
    const { status, body } = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(status, 502);
    assert.match(body.error, /without any music/);
  });

  it('passes on a rate limit as a plain message', async () => {
    mock.error = new RateLimitError(429, { type: 'error' }, 'slow down', new Headers());
    const { status, body } = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(status, 429);
    assert.match(body.error, /usage limit/);
  });

  it('writes one song at a time', async () => {
    let release;
    mock.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = app.call('/machina/compose', 'POST', newRequest);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await app.call('/machina/compose', 'POST', newRequest);
    assert.equal(second.status, 409);
    release();
    assert.equal((await first).status, 200);
  });
});

describe('the request the Machina reads', () => {
  it('leaves tempo, key, band and structure to the Machina when not given', () => {
    const text = buildRequest(/** @type {any} */ ({ patterns: [], tracks: [] }), {
      ...newRequest,
      bpm: null,
      key: null,
      instruments: [],
      sections: [],
      lengthBars: 48,
    });
    assert.match(text, /Choose the tempo/);
    assert.match(text, /Choose the key/);
    assert.match(text, /Choose the instruments/);
    assert.match(text, /about 48 bars long/);
  });
});
