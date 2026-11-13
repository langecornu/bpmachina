// Brings a saved song written by an older version of BPMachina up to the current format, one version at a time, before
// it is validated. Each step is a pure function from one version to the next, so an old file opens as it sounded and
// the steps are tested on their own. Anything that is not an older song (unreadable, from a newer version, or already
// current) is returned untouched for the schema to judge.
import { defaultFx, defaultMix } from '../../shared/mix.js';
import { SONG_SCHEMA_VERSION } from '../../shared/song.js';

/** @typedef {Record<string, any>} RawSong a parsed file, not validated yet */

/** @type {Record<number, (song: RawSong) => RawSong>} the step from each version to the next */
export const MIGRATIONS = {
  // 1 to 2: the mix. Every track gets the place in the mix a new track of its instrument gets, and the song gets the
  // default effects. A version 1 song played dry and centred; these defaults are what it was always meant to sound
  // like, so it is not kept dry. Only what is missing is added, so a song that already has a mix keeps it.
  1: (song) => ({
    ...song,
    schemaVersion: 2,
    tracks: Array.isArray(song.tracks)
      ? song.tracks.map((/** @type {unknown} */ track) =>
          track && typeof track === 'object' && !('mix' in track)
            ? { ...track, mix: defaultMix(String(/** @type {RawSong} */ (track).instrument)) }
            : track,
        )
      : song.tracks,
    fx: song.fx ?? defaultFx(),
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
