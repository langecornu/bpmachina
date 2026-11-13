// The song as a cue sheet for Open DMX Stage, so the lights can follow a song composed here: tempo, length, and each
// section with where it starts (in bars of four beats from the first downbeat) and its energy from 0 to 1. The
// section fields match what DMX-Stage's AI shows read from a song (`bpm`, `durationSeconds`, `firstBeatSeconds`,
// `sections[].startBar/bars/energy`). Pure, for browser and server.
import { instrumentOf } from './instruments.js';
import { songSeconds, songTimeline } from './song.js';

export const CUE_FORMAT = 'bpmachina-song-cue';
export const CUE_VERSION = 1;

/** Drums carry more of a section's drive than held chords do. */
const DRUM_WEIGHT = 1;
const SYNTH_WEIGHT = 0.6;
/** An accented note is played harder, so it counts for a little more. */
const ACCENT_WEIGHT = 1.25;

/**
 * How busy and loud a pattern is per bar, and how many of the song's tracks play in it.
 * @param {import('./types.js').Pattern} pattern
 * @param {Map<string, import('./types.js').Track>} tracks
 * @returns {{ drive: number, activeTracks: number }}
 */
function measure(pattern, tracks) {
  let drive = 0;
  const active = new Set();
  for (const note of pattern.notes) {
    const track = tracks.get(note.trackId);
    if (!track || track.muted) {
      continue;
    }
    active.add(track.id);
    const weight = instrumentOf(track.instrument).kind === 'drum' ? DRUM_WEIGHT : SYNTH_WEIGHT;
    drive += (note.velocity / 127) * weight * (track.volume / 100) * (note.accent ? ACCENT_WEIGHT : 1);
  }
  return { drive: drive / pattern.bars, activeTracks: active.size };
}

/**
 * @param {import('./types.js').Song} song
 * @returns {{
 *   format: string, version: number, name: string, bpm: number, beatsPerBar: number, durationSeconds: number,
 *   firstBeatSeconds: number, sections: { name: string, startBar: number, bars: number, energy: number }[],
 * }}
 */
export function buildSongCue(song) {
  const tracks = new Map(song.tracks.map((track) => [track.id, track]));
  const timeline = songTimeline(song).map((entry) => ({ ...entry, ...measure(entry.pattern, tracks) }));
  const maxDrive = Math.max(0, ...timeline.map((entry) => entry.drive));
  const trackCount = Math.max(1, song.tracks.length);
  return {
    format: CUE_FORMAT,
    version: CUE_VERSION,
    name: song.name,
    bpm: song.bpm,
    beatsPerBar: 4,
    durationSeconds: Math.round(songSeconds(song) * 100) / 100,
    firstBeatSeconds: 0,
    sections: timeline.map((entry) => {
      const energy = maxDrive > 0 ? 0.6 * (entry.drive / maxDrive) + 0.4 * (entry.activeTracks / trackCount) : 0;
      return {
        name: entry.section.name,
        startBar: entry.startBar,
        bars: entry.bars,
        energy: Math.round(Math.min(1, energy) * 100) / 100,
      };
    }),
  };
}
