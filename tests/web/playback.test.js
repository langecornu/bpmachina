// Unit tests for what plays when, and for the scheduler that plays it on the audio clock.
import { describe, expect, it, vi } from 'vitest';

import { createStarterSong } from '../../shared/song.js';
import { AudioEngine } from '../../src/audio/engine.js';
import { playNote } from '../../src/audio/voices.js';
import { buildPlayback, positionAt } from '../../src/utils/playback.js';
import { MockAudioContext, createMockEngine } from './audioMocks.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

describe('playback plan', () => {
  it('plays the song section by section, repeating each pattern', () => {
    const song = createStarterSong(makeId);
    const playback = buildPlayback(song, { mode: 'song' });
    expect(playback.totalSteps).toBe(24 * 16);
    const kick = song.tracks[0];
    const bass = song.tracks[3];
    // Step 0 of the Roll section (bar 5) and its repeat two bars later have the same notes.
    const rollStart = playback.eventsAt(4 * 16).map((event) => event.trackId);
    expect(rollStart).toContain(kick.id);
    expect(playback.eventsAt(6 * 16).map((event) => event.trackId)).toEqual(rollStart);
    expect(playback.eventsAt(4 * 16 + 1).some((event) => event.trackId === bass.id)).toBe(true);
    expect(playback.eventsAt(9999)).toEqual([]);
  });

  it('leaves out muted tracks, and plays only the soloed one', () => {
    const song = createStarterSong(makeId);
    const kick = song.tracks[0];
    const muted = {
      ...song,
      tracks: song.tracks.map((track) => (track.id === kick.id ? { ...track, muted: true } : track)),
    };
    expect(
      buildPlayback(muted, { mode: 'song' })
        .eventsAt(0)
        .some((event) => event.trackId === kick.id),
    ).toBe(false);
    const solo = buildPlayback(song, { mode: 'song', soloTrackId: kick.id });
    expect(solo.eventsAt(0).every((event) => event.trackId === kick.id)).toBe(true);
  });

  it('weights each note by its velocity and its track’s volume', () => {
    const song = createStarterSong(makeId);
    const quiet = { ...song, tracks: song.tracks.map((track) => ({ ...track, volume: 50 })) };
    const [event] = buildPlayback(quiet, { mode: 'pattern', patternId: song.patterns[0].id }).eventsAt(0);
    expect(event.gain).toBeCloseTo((110 / 127) * 0.5);
  });

  it('loops one pattern, the first when the id is unknown', () => {
    const song = createStarterSong(makeId);
    const playback = buildPlayback(song, { mode: 'pattern', patternId: 'gone' });
    expect(playback.totalSteps).toBe(32);
    expect(playback.segments[0].patternId).toBe(song.patterns[0].id);
  });

  it('says where a step falls', () => {
    const playback = buildPlayback(createStarterSong(makeId), { mode: 'song' });
    expect(positionAt(playback, 4 * 16 + 37)).toMatchObject({
      bar: 7,
      beat: 2,
      sectionName: 'Roll',
      patternStep: 5,
      totalBars: 24,
    });
  });
});

describe('scheduler', () => {
  it('schedules only the notes inside the look-ahead window, at exact times', async () => {
    const { engine, context, played } = await createMockEngine();
    const song = createStarterSong(makeId);
    expect(engine.start(song, { mode: 'pattern', patternId: song.patterns[1].id })).toBe(true);
    const seconds = 60 / 142 / 4;
    // A 0.06 s start delay inside 0.12 s of look-ahead: only the first sixteenth is scheduled yet.
    expect([...new Set(played.map((note) => note.time))]).toEqual([0.06]);
    expect(played.some((note) => note.instrument === 'kick')).toBe(true);
    context.currentTime = 0.1;
    engine.tick();
    const times = [...new Set(played.map((note) => note.time))];
    expect(times).toHaveLength(2);
    expect(times[1] - times[0]).toBeCloseTo(seconds);
    expect(played.filter((note) => note.time === times[1]).map((note) => note.instrument)).toContain('bass');
    expect(context.resumed).toBe(1);
    context.currentTime = 1;
    engine.tick();
    expect(Math.max(...played.map((note) => note.time))).toBeLessThan(1.12);
    expect(engine.heardStep()).toBeGreaterThan(0);
  });

  it('keeps its place when the song changes while it plays, and stops cleanly', async () => {
    const { engine, timers } = await createMockEngine();
    const song = createStarterSong(makeId);
    engine.start(song, { mode: 'song' });
    const before = engine.nextStep;
    engine.setSong({ ...song, bpm: 150 });
    expect(engine.nextStep).toBe(before);
    expect(engine.isPlaying).toBe(true);
    engine.stop();
    expect(engine.isPlaying).toBe(false);
    expect(timers.cleared).toBe(1);
  });

  it('refuses to play a song with nothing in it', async () => {
    const { engine } = await createMockEngine();
    const song = createStarterSong(makeId);
    expect(engine.start({ ...song, sections: [] }, { mode: 'song' })).toBe(false);
  });

  it('sets the master volume and previews a note', async () => {
    const { engine, context, played } = await createMockEngine();
    engine.preview('acid', 52);
    expect(played[0]).toMatchObject({ instrument: 'acid', pitch: 52 });
    engine.setMasterVolume(0.3);
    expect(context.lastGain).toBe(0.3);
  });
});

/** A song of one acid pattern with the notes given, looped as a pattern. */
function acidSong(notes, instrument = 'acid') {
  const song = createStarterSong(makeId);
  const track = { ...song.tracks[4], instrument, sound: { cutoff: 20 } };
  const pattern = {
    id: 'p',
    name: 'P',
    bars: 1,
    notes: notes.map((note) => ({ trackId: track.id, length: 1, velocity: 100, ...note })),
  };
  return { ...song, tracks: [track], patterns: [pattern], sections: [] };
}

describe('accent and slide in the playback plan', () => {
  it('holds a sliding note up to the next one, marks that one tied, and passes accents and the track’s sound', () => {
    const song = acidSong([
      { step: 0, pitch: 52, slide: true, accent: true },
      { step: 3, pitch: 55, slide: true },
      { step: 3, pitch: 64 },
      { step: 6, pitch: 57 },
      { step: 10, pitch: 52, slide: true },
    ]);
    const playback = buildPlayback(song, { mode: 'pattern', patternId: 'p' });
    expect(playback.eventsAt(0)[0]).toMatchObject({
      lengthSteps: 3,
      slide: true,
      tied: false,
      accent: true,
      sound: { cutoff: 20 },
    });
    const [low, high] = playback.eventsAt(3);
    expect(low).toMatchObject({ pitch: 55, tied: true, slide: true, lengthSteps: 3 });
    expect(high).toMatchObject({ pitch: 64, tied: false, slide: false });
    expect(playback.eventsAt(6)[0]).toMatchObject({ tied: true, slide: false, lengthSteps: 1, accent: false });
    // The last note has nothing to slide into in its pattern, so it plays as written.
    expect(playback.eventsAt(10)[0]).toMatchObject({ slide: false, lengthSteps: 1 });
  });

  it('ignores a slide on an instrument that does not glide', () => {
    const song = acidSong(
      [
        { step: 0, pitch: 60, slide: true },
        { step: 2, pitch: 62 },
      ],
      'lead',
    );
    const playback = buildPlayback(song, { mode: 'pattern', patternId: 'p' });
    expect(playback.eventsAt(0)[0]).toMatchObject({ slide: false, lengthSteps: 1 });
    expect(playback.eventsAt(2)[0].tied).toBe(false);
  });
});

describe('scheduler slides', () => {
  /** An engine whose sink records notes and hands back a held voice for every slide. */
  function slideEngine() {
    const context = new MockAudioContext();
    const played = [];
    const voices = [];
    const engine = new AudioEngine({
      createContext: () => /** @type {any} */ (context),
      setTimer: () => 1,
      clearTimer: () => {},
      play: (note) => {
        played.push(note);
        if (note.slide) {
          const voice = {
            glides: [],
            released: [],
            glide: (next) => voice.glides.push(next),
            release: (at) => voice.released.push(at),
          };
          voices.push(voice);
          return voice;
        }
        return undefined;
      },
    });
    return { engine, context, played, voices };
  }

  it('glides a held note into the tied one instead of playing it again', () => {
    const { engine, context, played, voices } = slideEngine();
    const song = acidSong([
      { step: 0, pitch: 52, slide: true },
      { step: 2, pitch: 59, slide: true },
      { step: 4, pitch: 57 },
    ]);
    engine.start(song, { mode: 'pattern', patternId: 'p' });
    expect(engine.held.size).toBe(1);
    context.currentTime = 1;
    engine.tick();
    expect(played.filter((note) => note.time < 0.5).map((note) => note.pitch)).toEqual([52]);
    expect(voices[0].glides.map((note) => note.pitch)).toEqual([59, 57]);
    expect(voices[0].released).toEqual([]);
    expect(engine.held.size).toBe(0);
    // Stopping while a note is held ends it.
    engine.start(song, { mode: 'pattern', patternId: 'p' });
    expect(engine.held.size).toBe(1);
    engine.stop();
    expect(engine.held.size).toBe(0);
    expect(voices.at(-1).released).toHaveLength(1);
  });

  it('ends a held note where it would have ended when its next note never comes', () => {
    const { engine, context, voices } = slideEngine();
    const song = acidSong([
      { step: 0, pitch: 52, slide: true },
      { step: 2, pitch: 59 },
    ]);
    engine.start(song, { mode: 'pattern', patternId: 'p' });
    // The tied note is taken out before it is scheduled.
    engine.setSong(acidSong([{ step: 0, pitch: 52, slide: true }]));
    context.currentTime = 0.5;
    engine.tick();
    expect(voices[0].glides).toEqual([]);
    expect(voices[0].released[0]).toBeCloseTo(0.06 + 2 * (60 / 142 / 4));
  });

  it('loads the ladder filter worklet and plays acid through it, or carries on without it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
    const node = () => ({
      connect: (target) => target,
      start: () => {},
      stop: () => {},
      frequency: param(),
      detune: param(),
      gain: param(),
      Q: param(),
    });
    const context = Object.assign(new MockAudioContext(), {
      audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
      createOscillator: node,
      createBiquadFilter: node,
      createGain: node,
    });
    const createLadder = vi.fn(() => ({
      ...node(),
      parameters: new Map([
        ['cutoff', param()],
        ['until', param()],
      ]),
    }));
    const engine = new AudioEngine({ createContext: () => /** @type {any} */ (context), createLadder });
    engine.ensureContext();
    expect(context.audioWorklet.addModule.mock.calls[0][0]).toMatch(/ladderWorklet/);
    await Promise.resolve();
    playNote(/** @type {any} */ (context), /** @type {any} */ (node()), 'acid', {
      time: 0,
      duration: 0.1,
      pitch: 52,
      gain: 1,
    });
    expect(createLadder).toHaveBeenCalledTimes(1);

    const failing = Object.assign(new MockAudioContext(), {
      audioWorklet: { addModule: () => Promise.reject(new Error('blocked')) },
    });
    new AudioEngine({ createContext: () => /** @type {any} */ (failing) }).ensureContext();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ladder filter'), expect.any(Error));
    warn.mockRestore();
  });
});
