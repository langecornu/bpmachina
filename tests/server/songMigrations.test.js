// Tests for bringing an older saved song up to the current format: each step on its own, the whole chain, what is left
// alone, and a version 1 file opened by the song service.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { songSchema } from '../../server/schemas/songSchema.js';
import { MIGRATIONS, migrateSong } from '../../server/services/songMigrations.js';
import { SongService } from '../../server/services/songService.js';
import { SONG_SCHEMA_VERSION, createStarterSong } from '../../shared/song.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

/** The starter song as version 1 wrote it: no sound on tracks, no accent or slide on notes. */
function versionOneSong() {
  const song = createStarterSong(makeId);
  return {
    ...song,
    schemaVersion: 1,
    tracks: song.tracks.map(({ sound: _sound, ...track }) => track),
    patterns: song.patterns.map((pattern) => ({
      ...pattern,
      notes: pattern.notes.map(({ accent: _accent, slide: _slide, ...note }) => note),
    })),
  };
}

describe('song migrations', () => {
  it('has a step from every older version to the current one', () => {
    for (let version = 1; version < SONG_SCHEMA_VERSION; version += 1) {
      assert.equal(typeof MIGRATIONS[version], 'function', `a migration from version ${version}`);
    }
  });

  it('turns a version 1 song into a valid current song, every track with empty sound knobs', () => {
    const old = versionOneSong();
    const { song, fromVersion } = migrateSong(old);
    assert.equal(fromVersion, 1, 'it reports the version it migrated from');
    assert.equal(/** @type {any} */ (song).schemaVersion, SONG_SCHEMA_VERSION);
    assert.ok(
      /** @type {any} */ (song).tracks.every((/** @type {any} */ track) => Object.keys(track.sound).length === 0),
      'every track plays at its default sound',
    );
    assert.equal(songSchema.safeParse(song).success, true, 'the migrated song passes the schema');
    assert.equal(old.schemaVersion, 1, 'the original is not changed');
  });

  it('keeps a sound a track already has and leaves odd tracks for the schema to judge', () => {
    const { song } = migrateSong({ schemaVersion: 1, tracks: [{ id: 'a', sound: { tune: 10 } }, null, 'x'] });
    assert.deepEqual(/** @type {any} */ (song).tracks, [{ id: 'a', sound: { tune: 10 } }, null, 'x']);
    const noTracks = migrateSong({ schemaVersion: 1, tracks: 'none' });
    assert.equal(/** @type {any} */ (noTracks.song).tracks, 'none');
  });

  it('leaves current, newer, unknown and unreadable songs untouched', () => {
    const current = createStarterSong(makeId);
    for (const raw of [current, { schemaVersion: 99 }, { schemaVersion: 0 }, { schemaVersion: '1' }, null, [], 'x']) {
      const result = migrateSong(raw);
      assert.equal(result.song, raw, 'the same value comes back');
      assert.equal(result.fromVersion, null, 'nothing was migrated');
    }
  });
});

describe('opening an older saved song', () => {
  /** @type {string} */
  let dataDir;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'bpmachina-migrate-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('migrates a version 1 file on load and keeps the original beside it, once', async () => {
    const old = { ...versionOneSong(), name: 'From version one' };
    await writeFile(path.join(dataDir, 'song.json'), JSON.stringify(old), 'utf8');
    const service = new SongService({ dataDir, makeId });
    const song = await service.load();
    assert.equal(song.name, 'From version one', 'the old song opens instead of the starter song');
    assert.equal(song.schemaVersion, SONG_SCHEMA_VERSION);
    const kept = JSON.parse(await readFile(path.join(dataDir, 'song.v1.json'), 'utf8'));
    assert.equal(kept.schemaVersion, 1, 'the file as version 1 wrote it is kept');
    await service.save(song);
    await new SongService({ dataDir, makeId }).load();
    const stillKept = JSON.parse(await readFile(path.join(dataDir, 'song.v1.json'), 'utf8'));
    assert.equal(stillKept.schemaVersion, 1, 'a later load does not overwrite the kept original');
  });
});
