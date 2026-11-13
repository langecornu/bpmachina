// Integration tests for the song API and its storage: the starter song on a first start, saving with validation,
// starting over, and a saved file that is unreadable or from a newer version.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { SongService } from '../../server/services/songService.js';
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

  it('migrates a song saved by version 1 and keeps it', async () => {
    const service = new SongService({ dataDir: app.dataDir });
    const current = service.get();
    const versionOne = {
      ...current,
      schemaVersion: 1,
      name: 'From version 1',
      tracks: current.tracks.map(({ output: _output, ...track }) => track),
    };
    const file = path.join(app.dataDir, 'song.json');
    await writeFile(file, JSON.stringify(versionOne), 'utf8');
    const song = await new SongService({ dataDir: app.dataDir }).load();
    assert.equal(song.name, 'From version 1', 'the old song opens instead of the starter song');
    assert.equal(song.schemaVersion, 2);
    assert.ok(song.tracks.every((track) => track.output.kind === 'synth'));
    const files = await readdir(app.dataDir);
    assert.ok(!files.some((name) => name.includes('unreadable')), 'nothing is moved aside');
  });

  it('loads a valid saved song', async () => {
    const service = new SongService({ dataDir: app.dataDir });
    const saved = { ...service.get(), name: 'Saved before' };
    await service.save(saved);
    const reloaded = new SongService({ dataDir: app.dataDir });
    assert.equal((await reloaded.load()).name, 'Saved before');
  });
});
