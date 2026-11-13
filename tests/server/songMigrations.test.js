// Tests for bringing an older saved song up to the current format: every step, and the cases left for the schema.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { songSchema } from '../../server/schemas/songSchema.js';
import { migrateSong } from '../../server/services/songMigrations.js';
import { SONG_SCHEMA_VERSION, createStarterSong } from '../../shared/song.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

/** The starter song as version 1 wrote it: tracks with no output. */
function versionOneSong() {
  const song = createStarterSong(makeId);
  return {
    ...song,
    schemaVersion: 1,
    tracks: song.tracks.map(({ output: _output, ...track }) => track),
  };
}

describe('song migrations', () => {
  it('gives every track of a version 1 song the built-in synth as its output', () => {
    const migrated = /** @type {any} */ (migrateSong(versionOneSong()));
    assert.equal(migrated.schemaVersion, SONG_SCHEMA_VERSION, 'the song reaches the current version');
    assert.ok(
      migrated.tracks.every((track) => track.output.kind === 'synth'),
      'every track plays on the synth, as before',
    );
    assert.equal(songSchema.safeParse(migrated).success, true, 'the migrated song is valid');
  });

  it('keeps everything else in the song as it was', () => {
    const before = versionOneSong();
    const migrated = /** @type {any} */ (migrateSong(before));
    assert.deepEqual(migrated.patterns, before.patterns);
    assert.deepEqual(migrated.sections, before.sections);
    assert.deepEqual(
      migrated.tracks.map(({ output: _output, ...track }) => track),
      before.tracks,
      'the tracks keep their names, instruments and mixer settings',
    );
  });

  it('leaves a current song, a newer one and anything that is not a song unchanged', () => {
    const current = createStarterSong(makeId);
    assert.equal(migrateSong(current), current);
    const newer = { schemaVersion: 99 };
    assert.equal(migrateSong(newer), newer);
    for (const raw of [null, 'text', [1, 2], { name: 'no version' }, { schemaVersion: 0 }]) {
      assert.deepEqual(migrateSong(raw), raw, `${JSON.stringify(raw)} is left for the schema to judge`);
    }
  });

  it('passes over tracks that are not objects, for the schema to refuse', () => {
    const migrated = /** @type {any} */ (migrateSong({ schemaVersion: 1, tracks: [null, 'kick'] }));
    assert.deepEqual(migrated.tracks, [null, 'kick']);
    assert.deepEqual(/** @type {any} */ (migrateSong({ schemaVersion: 1, tracks: 'none' })).tracks, 'none');
  });
});
