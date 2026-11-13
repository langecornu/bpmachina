// Unit tests for the edits made on the BPM Grid and the Arrangement.
import { describe, expect, it } from 'vitest';

import { createEmptySong, createStarterSong, LIMITS } from '../../shared/song.js';
import {
  addPattern,
  addSection,
  addTrack,
  clearTrack,
  cycleVelocity,
  moveSection,
  removePattern,
  removeSection,
  removeTrack,
  renamePattern,
  setPatternBars,
  toggleNote,
  updateSection,
  updateTrack,
} from '../../src/utils/songEdit.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

describe('notes', () => {
  it('adds a note on an empty cell and removes it with a click on its start or body', () => {
    const song = createEmptySong(makeId);
    const patternId = song.patterns[0].id;
    const trackId = song.tracks[4].id;
    const added = toggleNote(song, { patternId, trackId, step: 4, pitch: 52, length: 4 });
    expect(added.patterns[0].notes).toEqual([{ trackId, step: 4, length: 4, pitch: 52, velocity: 100 }]);
    expect(toggleNote(added, { patternId, trackId, step: 6, pitch: 52 }).patterns[0].notes).toEqual([]);
    expect(song.patterns[0].notes).toEqual([], 'the original song is not changed');
  });

  it('stops a new note before the next one and at the end of the pattern', () => {
    let song = createEmptySong(makeId);
    const patternId = song.patterns[0].id;
    const trackId = song.tracks[4].id;
    song = toggleNote(song, { patternId, trackId, step: 8, pitch: 52 });
    song = toggleNote(song, { patternId, trackId, step: 4, pitch: 52, length: 16 });
    expect(song.patterns[0].notes[0]).toMatchObject({ step: 4, length: 4 });
    song = toggleNote(song, { patternId, trackId, step: 30, pitch: 60, length: 16 });
    expect(song.patterns[0].notes.at(-1)).toMatchObject({ step: 30, length: 2 });
  });

  it('cycles a hit through loud, medium and soft', () => {
    let song = createEmptySong(makeId);
    const patternId = song.patterns[0].id;
    const trackId = song.tracks[0].id;
    song = toggleNote(song, { patternId, trackId, step: 0, pitch: 36, velocity: 120 });
    const levels = [];
    for (let index = 0; index < 3; index += 1) {
      song = cycleVelocity(song, { patternId, trackId, step: 0 });
      levels.push(song.patterns[0].notes[0].velocity);
    }
    expect(levels).toEqual([90, 60, 120]);
  });

  it('clears a track in one pattern', () => {
    const song = createStarterSong(makeId);
    const kick = song.tracks[0].id;
    const cleared = clearTrack(song, song.patterns[1].id, kick);
    expect(cleared.patterns[1].notes.some((note) => note.trackId === kick)).toBe(false);
    expect(cleared.patterns[0].notes.some((note) => note.trackId === kick)).toBe(true);
  });
});

describe('patterns', () => {
  it('shortens a pattern, dropping and trimming notes past the end', () => {
    const song = createStarterSong(makeId);
    const pad = song.tracks[5].id;
    const shorter = setPatternBars(song, song.patterns[0].id, 1);
    const notes = shorter.patterns[0].notes;
    expect(notes.every((note) => note.step + note.length <= 16)).toBe(true);
    expect(notes.filter((note) => note.trackId === pad).every((note) => note.length === 16)).toBe(true);
  });

  it('adds, copies, renames and removes patterns, never the last one', () => {
    let song = createEmptySong(makeId);
    const first = song.patterns[0].id;
    const added = addPattern(song);
    expect(added.song.patterns.at(-1).name).toBe('B');
    const copied = addPattern(added.song, first);
    expect(copied.song.patterns.at(-1).name).toBe('A copy');
    song = renamePattern(copied.song, first, 'Drop');
    expect(song.patterns[0].name).toBe('Drop');
    song = removePattern(song, first);
    expect(song.patterns.some((pattern) => pattern.id === first)).toBe(false);
    expect(song.sections).toHaveLength(0, 'sections playing a deleted pattern go too');
    const lonely = createEmptySong(makeId);
    expect(removePattern(lonely, lonely.patterns[0].id)).toBe(lonely);
  });

  it('stops adding patterns at the limit', () => {
    const song = createEmptySong(makeId);
    const full = { ...song, patterns: Array.from({ length: LIMITS.patterns }, () => song.patterns[0]) };
    expect(addPattern(full).patternId).toBeNull();
  });
});

describe('tracks and sections', () => {
  it('adds, changes and removes a track with its notes', () => {
    let song = createStarterSong(makeId);
    song = addTrack(song, 'fx');
    expect(song.tracks.at(-1)).toMatchObject({ instrument: 'fx', name: 'FX', volume: 80 });
    const kick = song.tracks[0].id;
    song = updateTrack(song, kick, { muted: true });
    expect(song.tracks[0].muted).toBe(true);
    song = removeTrack(song, kick);
    expect(song.patterns.every((pattern) => pattern.notes.every((note) => note.trackId !== kick))).toBe(true);
  });

  it('adds, changes, moves and removes sections', () => {
    let song = createStarterSong(makeId);
    song = addSection(song, song.patterns[2].id);
    expect(song.sections.at(-1).name).toBe('Breakdown');
    const last = song.sections.at(-1).id;
    song = updateSection(song, last, { cue: 'Outro', repeats: 3 });
    expect(song.sections.at(-1)).toMatchObject({ cue: 'Outro', repeats: 3 });
    song = moveSection(song, last, -1);
    expect(song.sections.at(-2).id).toBe(last);
    expect(moveSection(song, song.sections[0].id, -1)).toBe(song);
    song = removeSection(song, last);
    expect(song.sections.some((section) => section.id === last)).toBe(false);
  });
});
