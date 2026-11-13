// Unit tests for the shared music core: notes and keys, the song layout, the cue export for Open DMX Stage, and the
// cost estimates.
import { describe, expect, it } from 'vitest';

import { estimateCost, estimateTokens, formatPrice, formatPriceRange, aiModel } from '../../shared/aiModels.js';
import { INSTRUMENTS, instrumentOf, isDrum } from '../../shared/instruments.js';
import { frequencyOf, isInKey, keyLabel, noteName, stepSeconds } from '../../shared/music.js';
import { createEmptySong, createStarterSong, songBars, songSeconds, songTimeline } from '../../shared/song.js';
import { buildSongCue } from '../../shared/songCue.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

describe('music', () => {
  it('names notes and tunes them to A440', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(42)).toBe('F#2');
    expect(frequencyOf(69)).toBe(440);
    expect(frequencyOf(81)).toBeCloseTo(880);
  });

  it('knows which notes are in a key', () => {
    const eMinor = { root: 'E', scale: 'minor' };
    expect(isInKey(40, eMinor)).toBe(true);
    expect(isInKey(41, eMinor)).toBe(false);
    expect(isInKey(53, { root: 'E', scale: 'phrygian' })).toBe(true);
    expect(keyLabel(eMinor)).toBe('E minor');
  });

  it('times a sixteenth note from the tempo', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });
});

describe('instruments', () => {
  it('has drums with one pitch and synths with a range', () => {
    for (const instrument of INSTRUMENTS) {
      expect(instrument.low).toBeLessThanOrEqual(instrument.defaultPitch);
      expect(instrument.high).toBeGreaterThanOrEqual(instrument.defaultPitch);
      if (instrument.kind === 'drum') {
        expect(instrument.low).toBe(instrument.high);
      }
    }
    expect(isDrum('kick')).toBe(true);
    expect(isDrum('acid')).toBe(false);
    expect(instrumentOf('theremin').id).toBe('lead');
  });
});

describe('song', () => {
  it('lays the starter song out in time', () => {
    const song = createStarterSong(makeId);
    expect(songTimeline(song).map((entry) => [entry.section.name, entry.startBar, entry.bars])).toEqual([
      ['Intro', 0, 4],
      ['Roll', 4, 8],
      ['Breakdown', 12, 4],
      ['Drop', 16, 8],
    ]);
    expect(songBars(song)).toBe(24);
    expect(songSeconds(song)).toBeCloseTo((24 * 4 * 60) / 142);
  });

  it('keeps every starter note in its pattern and on a track', () => {
    const song = createStarterSong(makeId);
    const trackIds = new Set(song.tracks.map((track) => track.id));
    for (const pattern of song.patterns) {
      for (const note of pattern.notes) {
        expect(trackIds.has(note.trackId)).toBe(true);
        expect(note.step + note.length).toBeLessThanOrEqual(pattern.bars * 16);
      }
    }
  });

  it('skips a section whose pattern is gone', () => {
    const song = createEmptySong(makeId);
    song.sections.push({ id: 'x', name: 'Lost', patternId: 'missing', repeats: 1, cue: '' });
    expect(songTimeline(song)).toHaveLength(1);
  });
});

describe('song cue for Open DMX Stage', () => {
  it('lists each section with its start bar and an energy that follows the music', () => {
    const cue = buildSongCue(createStarterSong(makeId));
    expect(cue).toMatchObject({ format: 'bpmachina-song-cue', version: 1, bpm: 142, firstBeatSeconds: 0 });
    expect(cue.sections.map((section) => section.startBar)).toEqual([0, 4, 12, 16]);
    const energy = Object.fromEntries(cue.sections.map((section) => [section.name, section.energy]));
    expect(energy.Roll).toBeGreaterThan(energy.Intro);
    expect(energy.Roll).toBeGreaterThan(energy.Breakdown);
    expect(energy.Drop).toBe(energy.Roll);
    for (const section of cue.sections) {
      expect(section.energy).toBeGreaterThanOrEqual(0);
      expect(section.energy).toBeLessThanOrEqual(1);
    }
  });

  it('gives a silent song no energy, and muted tracks count for nothing', () => {
    const silent = createEmptySong(makeId);
    expect(buildSongCue(silent).sections[0].energy).toBe(0);
    const song = createStarterSong(makeId);
    const muted = { ...song, tracks: song.tracks.map((track) => ({ ...track, muted: true })) };
    expect(buildSongCue(muted).sections.every((section) => section.energy === 0)).toBe(true);
  });
});

describe('AI cost estimates', () => {
  it('grows with the music to write and the notes sent', () => {
    const small = estimateTokens({ tracks: 4, patternBars: 4 });
    const large = estimateTokens({ tracks: 8, patternBars: 16, existingNotes: 500 });
    expect(large.outputTokens[0]).toBeGreaterThan(small.outputTokens[1]);
    expect(large.inputTokens).toBeGreaterThan(small.inputTokens);
  });

  it('is cheapest on Haiku and dearest on Opus', () => {
    const request = { tracks: 6, patternBars: 8 };
    expect(estimateCost(request, 'claude-haiku-5-5')[1]).toBeLessThan(estimateCost(request, 'claude-opus-5-5')[0]);
    expect(aiModel('unknown').id).toBe('claude-opus-5-5');
  });

  it('prints prices for people', () => {
    expect(formatPrice(0.004)).toBe('under 1¢');
    expect(formatPrice(0.42)).toBe('42¢');
    expect(formatPrice(1.5)).toBe('$1.50');
    expect(formatPriceRange([0.2, 0.4])).toBe('about 20¢ to 40¢');
    expect(formatPriceRange([0.001, 0.4])).toBe('up to 40¢');
    expect(formatPriceRange([0.001, 0.002])).toBe('under 1¢');
  });
});
