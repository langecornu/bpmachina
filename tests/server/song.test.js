// Integration tests for the song API and its storage: the starter song on a first start, saving with validation,
// starting over, and a saved file that is unreadable or from a newer version.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { MIGRATIONS, migrateSong } from '../../server/services/songMigrations.js';
import { SongService } from '../../server/services/songService.js';
import { SONG_SCHEMA_VERSION, createStarterSong } from '../../shared/song.js';
import { startApp } from './helpers.js';

let app;

beforeEach(async () => {
  app = await startApp();
});

afterEach(async () => {
  await app.close();
});

describe('song API', () => {
  it('serves the starter song on a first start', async () => {
    const { status, body } = await app.call('/song');
    assert.equal(status, 200);
    assert.equal(body.name, 'Machina Awakens', 'a first start opens the starter song');
    assert.ok(
      body.patterns.every((pattern) => pattern.notes.length > 0),
      'every starter pattern has notes',
    );
  });

  it('saves a valid song to disk and keeps the previous save as a backup', async () => {
    const { body: song } = await app.call('/song');
    const first = await app.call('/song', 'PUT', { ...song, name: 'First' });
    assert.equal(first.status, 200);
    await app.call('/song', 'PUT', { ...song, name: 'Second' });
    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'song.json'), 'utf8'));
    const backup = JSON.parse(await readFile(path.join(app.dataDir, 'song.json.bak'), 'utf8'));
    assert.equal(saved.name, 'Second');
    assert.equal(backup.name, 'First', 'the save before is kept as the backup');
  });

  it('refuses a note that belongs to no track', async () => {
    const { body: song } = await app.call('/song');
    const broken = structuredClone(song);
    broken.patterns[0].notes.push({ trackId: 'missing', step: 0, length: 1, pitch: 60, velocity: 100 });
    const { status, body } = await app.call('/song', 'PUT', broken);
    assert.equal(status, 400);
    assert.match(body.error, /no track/);
  });

  it('refuses a note that runs past the end of its pattern', async () => {
    const { body: song } = await app.call('/song');
    const broken = structuredClone(song);
    broken.patterns[0].notes[0] = { ...broken.patterns[0].notes[0], step: 31, length: 4 };
    const { status, body } = await app.call('/song', 'PUT', broken);
    assert.equal(status, 400);
    assert.match(body.error, /past the end/);
  });

  it('refuses a section that plays a pattern that does not exist', async () => {
    const { body: song } = await app.call('/song');
    const broken = { ...song, sections: [{ ...song.sections[0], patternId: 'gone' }] };
    assert.equal((await app.call('/song', 'PUT', broken)).status, 400);
  });

  it('refuses a mix or effects out of range', async () => {
    const { body: song } = await app.call('/song');
    const panned = { ...song, tracks: [{ ...song.tracks[0], mix: { ...song.tracks[0].mix, pan: 150 } }] };
    assert.equal((await app.call('/song', 'PUT', panned)).status, 400);
    const division = { ...song, fx: { ...song.fx, delay: { ...song.fx.delay, division: '1/3' } } };
    assert.equal((await app.call('/song', 'PUT', division)).status, 400);
    const noFx = { ...song };
    delete noFx.fx;
    assert.equal((await app.call('/song', 'PUT', noFx)).status, 400, 'the effects are required');
  });

  it('saves a drum track’s kit and refuses one that does not exist', async () => {
    const { body: song } = await app.call('/song');
    const kick = song.tracks.findIndex((/** @type {any} */ track) => track.instrument === 'kick');
    const withKit = (/** @type {string} */ kit) => ({
      ...song,
      tracks: song.tracks.map((/** @type {any} */ track, /** @type {number} */ index) =>
        index === kick ? { ...track, sound: { ...track.sound, kit } } : track,
      ),
    });
    assert.equal((await app.call('/song', 'PUT', withKit('909'))).status, 200);
    const { body: saved } = await app.call('/song');
    assert.equal(saved.tracks[kick].sound.kit, '909');
    assert.equal((await app.call('/song', 'PUT', withKit('cowbell'))).status, 400);
  });

  it('refuses unknown fields, an unknown instrument and an out-of-range tempo', async () => {
    const { body: song } = await app.call('/song');
    assert.equal((await app.call('/song', 'PUT', { ...song, extra: true })).status, 400);
    assert.equal((await app.call('/song', 'PUT', { ...song, bpm: 400 })).status, 400);
    const strange = { ...song, tracks: [{ ...song.tracks[0], instrument: 'theremin' }, ...song.tracks.slice(1)] };
    assert.equal((await app.call('/song', 'PUT', strange)).status, 400);
  });

  it('saves a track sent to a MIDI output, and refuses a channel or device that cannot be', async () => {
    const { body: song } = await app.call('/song');
    const midi = structuredClone(song);
    midi.tracks[0].output = { kind: 'midi', deviceName: 'TR-8S', channel: 10, note: 36 };
    const saved = await app.call('/song', 'PUT', midi);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.tracks[0].output, { kind: 'midi', deviceName: 'TR-8S', channel: 10, note: 36 });
    for (const output of [
      { kind: 'midi', deviceName: 'TR-8S', channel: 17 },
      { kind: 'midi', deviceName: 'TR-8S', channel: 0 },
      { kind: 'midi', deviceName: '', channel: 1 },
      { kind: 'midi', deviceName: 'TR-8S', channel: 1, note: 128 },
      { kind: 'synth', deviceName: 'TR-8S' },
      { kind: 'cv' },
    ]) {
      const broken = structuredClone(song);
      broken.tracks[0].output = output;
      assert.equal((await app.call('/song', 'PUT', broken)).status, 400, `${JSON.stringify(output)} is refused`);
    }
    const missing = structuredClone(song);
    delete missing.tracks[0].output;
    assert.equal((await app.call('/song', 'PUT', missing)).status, 400, 'every track says where it sounds');
  });

  it('starts a new empty song, or the starter song again', async () => {
    const empty = await app.call('/song/new', 'POST', { starter: false });
    assert.equal(empty.status, 200);
    assert.equal(empty.body.patterns.length, 1);
    assert.equal(empty.body.patterns[0].notes.length, 0, 'a new song starts empty');
    const starter = await app.call('/song/new', 'POST', { starter: true });
    assert.equal(starter.body.name, 'Machina Awakens');
  });

  it('refuses a change sent from another site', async () => {
    const { body: song } = await app.call('/song');
    const { status } = await app.call('/song', 'PUT', song, { origin: 'https://evil.example' });
    assert.equal(status, 403);
  });

  it('answers health checks and unknown routes', async () => {
    assert.equal((await fetch(`${app.baseUrl}/healthz`)).status, 200);
    assert.equal((await app.call('/nothing-here')).status, 404);
  });

  it('lets the page compile the synth voices’ WebAssembly, and nothing else that eval would allow', async () => {
    const policy = (await fetch(`${app.baseUrl}/healthz`)).headers.get('content-security-policy') ?? '';
    const scripts = policy.split(';').find((directive) => directive.trim().startsWith('script-src'));
    assert.equal(scripts?.trim(), "script-src 'self' 'wasm-unsafe-eval'");
  });
});

describe('song storage', () => {
  it('moves an unreadable saved song aside instead of overwriting it', async () => {
    await writeFile(path.join(app.dataDir, 'song.json'), '{ not json', 'utf8');
    const service = new SongService({ dataDir: app.dataDir });
    const song = await service.load();
    assert.equal(song.name, 'Machina Awakens', 'it starts with the starter song');
    const files = await readdir(app.dataDir);
    assert.ok(
      files.some((file) => file.startsWith('song.json.unreadable-')),
      'the unreadable file is kept',
    );
  });

  it('leaves a song from a newer version alone and refuses to save over it', async () => {
    const file = path.join(app.dataDir, 'song.json');
    await writeFile(file, JSON.stringify({ schemaVersion: 99, name: 'From the future' }), 'utf8');
    const service = new SongService({ dataDir: app.dataDir });
    const song = await service.load();
    await assert.rejects(service.save(song), (error) => error.status === 409);
    assert.match(await readFile(file, 'utf8'), /From the future/, 'the newer file is untouched');
  });

  it('loads a valid saved song', async () => {
    const service = new SongService({ dataDir: app.dataDir });
    const saved = { ...service.get(), name: 'Saved before' };
    await service.save(saved);
    const reloaded = new SongService({ dataDir: app.dataDir });
    assert.equal((await reloaded.load()).name, 'Saved before');
  });
});

/** A song as version 1 saved it: no mix on its tracks and no effects. */
function versionOneSong() {
  let counter = 0;
  const song = createStarterSong(() => `v1-${(counter += 1)}`);
  const old = { ...song, schemaVersion: 1, tracks: song.tracks.map((track) => ({ ...track })) };
  delete old.fx;
  for (const track of old.tracks) {
    delete track.mix;
  }
  return old;
}

describe('song migrations', () => {
  it('has a step from every older version to the current one', () => {
    for (let version = 1; version < SONG_SCHEMA_VERSION; version += 1) {
      assert.equal(typeof MIGRATIONS[version], 'function', `a step from version ${version}`);
    }
  });

  it('gives a version 1 song the default mix for each instrument and the default effects', () => {
    const { song, fromVersion } = migrateSong(versionOneSong());
    assert.equal(fromVersion, 1);
    assert.equal(song.schemaVersion, SONG_SCHEMA_VERSION);
    const byInstrument = new Map(song.tracks.map((track) => [track.instrument, track.mix]));
    assert.deepEqual(byInstrument.get('kick'), { pan: 0, reverb: 0, delay: 0, duck: false }, 'the kick dry, centred');
    assert.equal(byInstrument.get('bass').duck, true, 'the bass ducks under the kick');
    assert.equal(byInstrument.get('pad').duck, true);
    assert.ok(byInstrument.get('hat').pan !== 0, 'hats sit a little off centre');
    assert.equal(song.fx.delay.division, '1/8d');
  });

  it('keeps a mix that is already there, and leaves what it does not know to the schema', () => {
    const old = versionOneSong();
    old.tracks[0] = { ...old.tracks[0], mix: { pan: -40, reverb: 5, delay: 5, duck: false } };
    assert.equal(migrateSong(old).song.tracks[0].mix.pan, -40);
    assert.deepEqual(migrateSong(null), { song: null, fromVersion: null });
    assert.deepEqual(migrateSong([1]), { song: [1], fromVersion: null });
    const current = { schemaVersion: SONG_SCHEMA_VERSION };
    assert.equal(migrateSong(current).song, current, 'a current song is untouched');
    assert.equal(migrateSong({ schemaVersion: 0 }).fromVersion, null, 'no step from an unknown version');
    const strangeTracks = migrateSong({ schemaVersion: 1, tracks: 'none', fx: 'kept' }).song;
    assert.equal(strangeTracks.tracks, 'none');
    assert.equal(strangeTracks.fx, 'kept');
  });

  it('opens a version 1 file as it sounded, and keeps the original beside it', async () => {
    const file = path.join(app.dataDir, 'song.json');
    await writeFile(file, JSON.stringify(versionOneSong()), 'utf8');
    const service = new SongService({ dataDir: app.dataDir });
    const song = await service.load();
    assert.equal(song.name, 'Machina Awakens');
    assert.equal(song.schemaVersion, SONG_SCHEMA_VERSION);
    assert.ok(song.tracks.every((track) => track.mix));
    const original = JSON.parse(await readFile(path.join(app.dataDir, 'song.v1.json'), 'utf8'));
    assert.equal(original.schemaVersion, 1, 'the file as version 1 wrote it is kept');
    // Loading again does not replace the kept original.
    await new SongService({ dataDir: app.dataDir }).load();
    assert.equal(JSON.parse(await readFile(path.join(app.dataDir, 'song.v1.json'), 'utf8')).schemaVersion, 1);
  });
});
