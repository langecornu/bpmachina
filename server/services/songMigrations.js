// Brings a saved song written by an older version of BPMachina up to the current format, one version at a time, before
// it is validated. Each step is a pure function of the raw document, so it is tested on its own; anything it does not
// recognise is passed on unchanged for the schema to judge.
import { SONG_SCHEMA_VERSION } from '../../shared/song.js';

/**
 * Each entry turns a song of version `from` into one of version `from + 1`.
 * @type {{ from: number, migrate: (song: Record<string, any>) => Record<string, any> }[]}
 */
const STEPS = [
  {
    // Version 2 gives every track an output: the built-in synth, as every track played before.
    from: 1,
    migrate: (song) => ({
      ...song,
      schemaVersion: 2,
      tracks: Array.isArray(song.tracks)
        ? song.tracks.map((track) =>
            track && typeof track === 'object' ? { ...track, output: { kind: 'synth' } } : track,
          )
        : song.tracks,
    }),
  },
];

/**
 * @param {unknown} raw the parsed saved file
 * @returns {unknown} the song at the current version, or `raw` unchanged when it is not a song this app can migrate
 *   (no version, an unknown one, or a newer one)
 */
export function migrateSong(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  let song = /** @type {Record<string, any>} */ (raw);
  while (Number.isInteger(song.schemaVersion) && song.schemaVersion < SONG_SCHEMA_VERSION) {
    const step = STEPS.find((candidate) => candidate.from === song.schemaVersion);
    if (!step) {
      return song;
    }
    song = step.migrate(song);
  }
  return song;
}
