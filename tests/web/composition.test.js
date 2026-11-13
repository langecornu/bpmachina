// Unit tests for turning the Machina's answer into a song: everything is cleaned and capped, and revisions keep what
// the person locked.
import { describe, expect, it } from 'vitest';

import { buildSong, cleanKey, cleanNotes, foldIntoRange, revisePattern } from '../../shared/composition.js';
import { createStarterSong } from '../../shared/song.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

const base = {
  summary: '',
  title: '  A   title  ',
  bpm: 400,
  key: { root: 'bb', scale: 'Weird' },
  tracks: [
    { name: 'Kick', instrument: 'kick' },
    { name: 'Odd', instrument: 'spoons' },
    { name: 'Acid', instrument: 'acid' },
  ],
  patterns: [
    {
      name: 'A',
      bars: 20,
      notes: [{ track: 'acid', step: 0, length: 999, pitch: 100, velocity: 300 }],
    },
    { name: 'a', bars: 1, notes: [] },
  ],
  sections: [],
};

describe('cleaning an answer', () => {
  it('spells flats as sharps and falls back to A minor', () => {
    expect(cleanKey({ root: 'Bb', scale: 'dorian' })).toEqual({ root: 'A#', scale: 'dorian' });
    expect(cleanKey({ root: 'H', scale: 'lydian' })).toEqual({ root: 'A', scale: 'minor' });
  });

  it('moves pitches by octaves into range', () => {
    expect(foldIntoRange(100, 36, 72)).toBe(64);
    expect(foldIntoRange(10, 36, 72)).toBe(46);
    expect(foldIntoRange(50, 60, 61)).toBe(60);
  });

  it('drops unknown instruments, clamps every number and plays each pattern once without sections', () => {
    const song = buildSong(base, { makeId });
    expect(song.name).toBe('A title');
    expect(song.bpm).toBe(220);
    expect(song.key).toEqual({ root: 'A#', scale: 'minor' });
    expect(song.tracks.map((track) => track.instrument)).toEqual(['kick', 'acid']);
    expect(song.patterns).toHaveLength(1);
    expect(song.patterns[0].bars).toBe(8);
    expect(song.patterns[0].notes[0]).toMatchObject({ step: 0, length: 128, pitch: 64, velocity: 127 });
    expect(song.sections.map((section) => section.patternId)).toEqual([song.patterns[0].id]);
  });

  it('keeps a person’s track id and settings when the name matches', () => {
    const existing = [{ id: 'mine', name: 'Kick', instrument: 'kick', volume: 33, muted: true }];
    const song = buildSong(base, { makeId, existingTracks: existing });
    expect(song.tracks[0]).toEqual(existing[0]);
  });

  it('caps the notes of a pattern', () => {
    const track = { id: 't', name: 'Hat', instrument: 'hat', volume: 80, muted: false };
    const many = Array.from({ length: 3000 }, (_, index) => ({
      track: 'hat',
      step: index % 128,
      length: 1,
      pitch: 42 + Math.floor(index / 128),
      velocity: 90,
    }));
    // Drums collapse to one pitch, so only one hit per step survives.
    expect(cleanNotes(many, new Map([['hat', track]]), 8)).toHaveLength(128);
  });
});

describe('revising one pattern', () => {
  it('returns the song unchanged when the pattern is gone', () => {
    const song = createStarterSong(makeId);
    expect(revisePattern(song, base, { makeId, patternId: 'gone' })).toBe(song);
  });

  it('adds a track the Machina asked for and writes its notes', () => {
    const song = createStarterSong(makeId);
    const target = song.patterns[0];
    const answer = {
      ...base,
      tracks: [{ name: 'Riser', instrument: 'fx' }],
      patterns: [
        { name: target.name, bars: 2, notes: [{ track: 'Riser', step: 16, length: 16, pitch: 60, velocity: 90 }] },
      ],
    };
    const revised = revisePattern(song, answer, { makeId, patternId: target.id });
    const riser = revised.tracks.find((track) => track.name === 'Riser');
    expect(riser.instrument).toBe('fx');
    expect(revised.patterns[0].notes).toEqual([{ trackId: riser.id, step: 16, length: 16, pitch: 60, velocity: 90 }]);
  });
});
