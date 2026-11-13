// Unit tests for what plays when, and for the scheduler that plays it on the audio clock.
import { describe, expect, it } from 'vitest';

import { createStarterSong } from '../../shared/song.js';
import { buildPlayback, positionAt } from '../../src/utils/playback.js';
import { createMockEngine } from './audioMocks.js';

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
    engine.preview({ instrument: 'acid', output: { kind: 'synth' } }, 52);
    expect(played[0]).toMatchObject({ instrument: 'acid', pitch: 52 });
    engine.setMasterVolume(0.3);
    expect(context.lastGain).toBe(0.3);
  });
});
