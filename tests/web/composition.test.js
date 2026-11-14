// Unit tests for turning the Machina's answer into a song: everything is cleaned and capped, and revisions keep what
// the person locked.
import { describe, expect, it } from 'vitest';

import { buildSong, cleanKey, cleanNotes, foldIntoRange, revisePattern, reviseSong } from '../../shared/composition.js';
import { cleanFx, cleanMix, defaultFx, defaultMix, delaySeconds, duckReleaseSeconds } from '../../shared/mix.js';
import { createStarterSong } from '../../shared/song.js';
import {
  KIT_IDS,
  activeKnobsOf,
  cleanSound,
  hasWaveform,
  isSampled,
  kitOf,
  kitsOf,
  knobsOf,
  soundOf,
} from '../../shared/sound.js';

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
    const existing = [
      {
        id: 'mine',
        name: 'Kick',
        instrument: 'kick',
        volume: 33,
        muted: true,
        sound: { tune: 40 },
        mix: { pan: 0, reverb: 0, delay: 0, duck: false },
      },
    ];
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

describe('accents and slides from the Machina', () => {
  const tracks = new Map([
    ['acid', { id: 'a', name: 'Acid', instrument: 'acid', volume: 80, muted: false, sound: {} }],
    ['kick', { id: 'k', name: 'Kick', instrument: 'kick', volume: 80, muted: false, sound: {} }],
    ['lead', { id: 'l', name: 'Lead', instrument: 'lead', volume: 80, muted: false, sound: {} }],
  ]);
  const note = (track, step, extra) => ({ track, step, length: 2, pitch: 60, velocity: 100, ...extra });

  it('keeps an accent or a slide only when the answer says true', () => {
    const notes = cleanNotes(
      [
        note('acid', 0, { accent: true, slide: true }),
        note('acid', 2, { accent: 'true', slide: 1 }),
        note('acid', 4, { accent: false, slide: false }),
      ],
      tracks,
      1,
    );
    expect(notes[0]).toMatchObject({ accent: true, slide: true });
    for (const plain of notes.slice(1)) {
      expect(plain).not.toHaveProperty('accent');
      expect(plain).not.toHaveProperty('slide');
    }
  });

  it('keeps accents on drums but slides only on instruments that glide', () => {
    const [kick, lead] = cleanNotes(
      [note('kick', 0, { accent: true, slide: true }), note('lead', 1, { slide: true })],
      tracks,
      1,
    );
    expect(kick).toEqual({ trackId: 'k', step: 0, length: 1, pitch: 36, velocity: 100, accent: true });
    expect(lead).not.toHaveProperty('slide');
  });

  it('drops knobs a kept track no longer has when the Machina changes its instrument', () => {
    const existing = [
      {
        id: 'mine',
        name: 'Line',
        instrument: 'acid',
        volume: 50,
        muted: false,
        sound: { cutoff: 20, waveform: 'square' },
      },
    ];
    const song = buildSong(
      { ...base, tracks: [{ name: 'Line', instrument: 'kick' }] },
      { makeId, existingTracks: existing },
    );
    expect(song.tracks[0]).toMatchObject({ id: 'mine', instrument: 'kick', sound: {} });
  });
});

describe('sound knobs', () => {
  it('lists knobs for acid and the drums, none for the other synths', () => {
    expect(knobsOf('acid').map((knob) => knob.id)).toEqual(['cutoff', 'resonance', 'envMod', 'decay']);
    expect(knobsOf('snare').map((knob) => knob.id)).toEqual(['tune', 'snappy', 'decay']);
    expect(knobsOf('pad')).toEqual([]);
    expect(hasWaveform('acid')).toBe(true);
    expect(hasWaveform('bass')).toBe(false);
  });

  it('fills every knob with the track’s value or a default', () => {
    const acid = soundOf('acid', { cutoff: 140.4, decay: Number.NaN, waveform: 'square' });
    expect(acid).toMatchObject({ cutoff: 100, decay: 30, resonance: 70, tune: 50, waveform: 'square' });
    expect(soundOf('kick', undefined)).toMatchObject({ tune: 50, attack: 50, decay: 50, waveform: 'saw' });
  });

  it('keeps only the knobs an instrument has, as whole numbers in range', () => {
    expect(cleanSound('acid', { cutoff: '12.6', resonance: -5, tune: 20, waveform: 'sine', envMod: null })).toEqual({
      cutoff: 13,
      resonance: 0,
    });
    expect(cleanSound('acid', { waveform: 'square' })).toEqual({ waveform: 'square' });
    expect(cleanSound('kick', { tune: 70, waveform: 'square' })).toEqual({ tune: 70 });
    expect(cleanSound('lead', 'loud')).toEqual({});
  });
});

describe('drum kits', () => {
  it('offers sampled kits and the synth for every drum but the clap, the first by default', () => {
    expect(kitsOf('kick').map((kit) => kit.id)).toEqual(['tek', 'haus', 'zum', '909']);
    expect(kitsOf('clap')).toEqual([]);
    expect(kitsOf('acid')).toEqual([]);
    expect(KIT_IDS).toContain('909');
    expect(new Set(KIT_IDS).size).toBe(KIT_IDS.length);
    expect(kitOf('kick', {})).toBe('tek');
    expect(kitOf('kick', { kit: 'zum' })).toBe('zum');
    expect(kitOf('kick', { kit: 'cymbal' })).toBe('tek');
    expect(kitOf('clap', { kit: 'tek' })).toBeNull();
  });

  it('knows a sampled track from a synthesised one, and which knobs it follows', () => {
    expect(isSampled('hat', undefined)).toBe(true);
    expect(isSampled('hat', { kit: '909' })).toBe(false);
    expect(isSampled('clap', undefined)).toBe(false);
    expect(activeKnobsOf('kick', {}).map((knob) => knob.id)).toEqual(['tune', 'decay']);
    expect(activeKnobsOf('kick', { kit: '909' }).map((knob) => knob.id)).toEqual(['tune', 'attack', 'decay']);
    expect(activeKnobsOf('clap', {}).map((knob) => knob.id)).toEqual(['tune', 'decay']);
    expect(activeKnobsOf('acid', {})).toEqual(knobsOf('acid'));
  });

  it('keeps a kit only when the instrument has it', () => {
    expect(cleanSound('kick', { kit: 'haus', tune: 60 })).toEqual({ tune: 60, kit: 'haus' });
    expect(cleanSound('kick', { kit: 'cymbal' })).toEqual({});
    expect(cleanSound('clap', { kit: '909' })).toEqual({});
  });
});

describe('cleaning the mix and effects', () => {
  it('clamps a mix into range and fills what is missing', () => {
    const fallback = defaultMix('hat');
    expect(cleanMix({ pan: -500, reverb: 12.6, delay: 'loud', duck: 'yes' }, fallback)).toEqual({
      pan: -100,
      reverb: 13,
      delay: fallback.delay,
      duck: fallback.duck,
    });
    expect(cleanMix(null, fallback)).toEqual(fallback);
    expect(cleanMix([1, 2], fallback)).toEqual(fallback);
    expect(defaultMix('theremin')).toEqual(defaultMix('lead'));
  });

  it('cleans the effects, keeping a known delay division only', () => {
    const fx = cleanFx({
      reverb: { size: 200, decay: -1 },
      delay: { division: '1/3', feedback: 95, tone: 10, level: 20 },
      sidechain: { amount: 100, release: 0 },
    });
    expect(fx.reverb).toEqual({ size: 100, decay: 0, level: defaultFx().reverb.level });
    expect(fx.delay).toEqual({ division: '1/8d', feedback: 90, tone: 10, level: 20 });
    expect(fx.sidechain).toEqual({ amount: 95, release: 5 });
    expect(cleanFx(undefined)).toEqual(defaultFx());
  });

  it('turns divisions and release into seconds at the tempo', () => {
    expect(delaySeconds('1/8d', 120)).toBeCloseTo(0.375);
    expect(delaySeconds('1/16', 150)).toBeCloseTo(0.1);
    expect(delaySeconds('nonsense', 120)).toBeCloseTo(0.375);
    expect(duckReleaseSeconds(50, 120)).toBeCloseTo(0.25);
  });

  it('keeps a locked track’s mix and the song’s effects when the Machina leaves them out', () => {
    const song = createStarterSong(makeId);
    const kick = song.tracks[0];
    const panned = {
      ...song,
      tracks: song.tracks.map((track) =>
        track.id === kick.id ? { ...track, mix: { ...track.mix, pan: -30 } } : track,
      ),
      fx: { ...song.fx, reverb: { ...song.fx.reverb, size: 90 } },
    };
    const revised = reviseSong(
      panned,
      {
        ...base,
        tracks: [
          { name: 'Kick', instrument: 'kick', mix: { pan: 50, reverb: 0, delay: 0, duck: false } },
          { name: 'Bass', instrument: 'bass' },
        ],
      },
      { makeId, lockedTrackIds: [kick.id] },
    );
    expect(revised.tracks.find((track) => track.id === kick.id)?.mix.pan).toBe(-30);
    expect(revised.fx.reverb.size).toBe(90);
    const bass = revised.tracks.find((track) => track.instrument === 'bass');
    expect(bass?.mix).toEqual(song.tracks[3].mix);
    expect(buildSong(base, { makeId }).fx).toEqual(defaultFx());
  });
});
