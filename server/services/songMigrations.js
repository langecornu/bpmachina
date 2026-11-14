// Brings a saved song written by an older version of BPMachina up to the current format, one version at a time, before
// it is validated. Each step is a pure function from one version to the next, so an old file opens as it sounded and
// the steps are tested on their own. Anything that is not an older song (unreadable, from a newer version, or already
// current) is returned untouched for the schema to judge.
import { defaultFx, defaultMix } from '../../shared/mix.js';
import { SONG_SCHEMA_VERSION } from '../../shared/song.js';

/** @typedef {Record<string, any>} RawSong a parsed file, not validated yet */

/** @type {Record<number, (song: RawSong) => RawSong>} the step from each version to the next */
export const MIGRATIONS = {
  // 1 to 2: tracks gain their sound knobs (empty: every knob at its default, which is how a version 1 song sounded
  // the closest), and notes may now carry accent and slide, which a version 1 song has none of.
  1: (song) => ({
    ...song,
    schemaVersion: 2,
    tracks: Array.isArray(song.tracks)
      ? song.tracks.map((/** @type {unknown} */ track) =>
          track && typeof track === 'object' && !('sound' in track) ? { ...track, sound: {} } : track,
        )
      : song.tracks,
  }),
  // 2 to 3: the mix. Every track gets the place in the mix a new track of its instrument gets, and the song gets the
  // default effects. Older songs played dry and centred; these defaults are what they were always meant to sound like,
  // so they are not kept dry. Only what is missing is added, so a song that already has a mix keeps it.
  2: (song) => ({
    ...song,
    schemaVersion: 3,
    tracks: Array.isArray(song.tracks)
      ? song.tracks.map((/** @type {unknown} */ track) =>
          track && typeof track === 'object' && !('mix' in track)
            ? { ...track, mix: defaultMix(String(/** @type {RawSong} */ (track).instrument)) }
            : track,
        )
      : song.tracks,
    fx: song.fx ?? defaultFx(),
  }),
  // 3 to 4: a drum track's sound may name its kit, a recorded sample or the 909-style synth. Older songs have none, so
  // their drums play the default samples: the reason the samples were added is that they sound better than the synth,
  // so an older song is not kept on it. Choosing 909 synth in the track's sound brings that back.
  3: (song) => ({ ...song, schemaVersion: 4 }),
  // 4 to 5: tracks gain an output. Every track plays on the built-in synth, as every track did before.
  4: (song) => ({
    ...song,
    schemaVersion: 5,
    tracks: Array.isArray(song.tracks)
      ? song.tracks.map((/** @type {unknown} */ track) =>
          track && typeof track === 'object' && !('output' in track) ? { ...track, output: { kind: 'synth' } } : track,
        )
      : song.tracks,
  }),
};

/**
 * @param {unknown} raw a parsed saved song
 * @returns {{ song: unknown, fromVersion: number | null }} the song in the current format, and the version it was
 *   migrated from (null when nothing was done)
 */
export function migrateSong(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { song: raw, fromVersion: null };
  }
  const start = /** @type {RawSong} */ (raw).schemaVersion;
  if (!Number.isInteger(start) || start >= SONG_SCHEMA_VERSION || !MIGRATIONS[start]) {
    return { song: raw, fromVersion: null };
  }
  let song = /** @type {RawSong} */ (raw);
  while (song.schemaVersion < SONG_SCHEMA_VERSION && MIGRATIONS[song.schemaVersion]) {
    song = MIGRATIONS[song.schemaVersion](song);
  }
  return { song, fromVersion: start };
}
