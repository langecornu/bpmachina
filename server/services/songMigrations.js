// Brings a saved song written by an older version of BPMachina up to the current format, one version at a time, before
// it is validated. Each step is a pure function from one version to the next, so an old file opens as it sounded and
// the steps are tested on their own. Anything that is not an older song (unreadable, from a newer version, or already
// current) is returned untouched for the schema to judge.
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
