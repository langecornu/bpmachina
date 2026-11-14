// Tests of MIDI out: the bytes, what each track sends, and the scheduler sending notes and clock to the outputs with
// exact timestamps, falling back to the synth while a device is not connected, and silencing everything on stop.
import { describe, expect, it } from 'vitest';

import { createStarterSong } from '../../shared/song.js';
import {
  CLOCK,
  LEGATO_MS,
  MidiSink,
  START,
  STOP,
  allNotesOff,
  noteOff,
  noteOn,
  songPosition,
} from '../../src/audio/midiOut.js';
import { midiNoteFor } from '../../src/utils/playback.js';
import { PERFORMANCE_OFFSET_MS, createMockEngine } from './audioMocks.js';
import { MockMidiAccess } from './midiMocks.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

/** 150 BPM: a sixteenth is exactly 100 ms. */
const STEP_MS = 100;

/**
 * One bar at 150 BPM: a kick on a TR-8S (channel 10), an acid line on a TD-3 (channel 2) with a note that starts where
 * the one before it ends, and hats on the built-in synth.
 */
function midiSong() {
  const kick = { id: 'kick', name: 'Kick', instrument: 'kick', volume: 80, muted: false };
  const acid = { id: 'acid', name: 'Acid', instrument: 'acid', volume: 50, muted: false };
  const hat = { id: 'hat', name: 'Hat', instrument: 'hat', volume: 80, muted: false };
  return {
    schemaVersion: 2,
    name: 'MIDI test',
    bpm: 150,
    key: { root: 'A', scale: 'minor' },
    tracks: [
      { ...kick, output: { kind: 'midi', deviceName: 'TR-8S', channel: 10 } },
      { ...acid, output: { kind: 'midi', deviceName: 'TD-3', channel: 2 } },
      { ...hat, output: { kind: 'synth' } },
    ],
    patterns: [
      {
        id: 'p',
        name: 'A',
        bars: 1,
        notes: [
          { trackId: 'kick', step: 0, length: 1, pitch: 36, velocity: 120 },
          { trackId: 'acid', step: 0, length: 2, pitch: 45, velocity: 100 },
          { trackId: 'hat', step: 1, length: 1, pitch: 42, velocity: 80 },
          { trackId: 'acid', step: 2, length: 1, pitch: 45, velocity: 127 },
        ],
      },
    ],
    sections: [{ id: 's', name: 'Loop', patternId: 'p', repeats: 1, cue: '' }],
    brief: '',
  };
}

/** Rounds timestamps to a microsecond, so float sums compare exactly. */
const timed = (output) => output.sent.map(({ data, timestamp }) => ({ data, at: Math.round(timestamp * 1000) / 1000 }));

describe('MIDI bytes', () => {
  it('builds note-on, note-off, all-notes-off and song position for channels 1 to 16', () => {
    expect(noteOn(1, 60, 100)).toEqual([0x90, 60, 100]);
    expect(noteOn(10, 36, 127)).toEqual([0x99, 36, 127]);
    expect(noteOff(16, 48)).toEqual([0x8f, 48, 0]);
    expect(allNotesOff(2)).toEqual([0xb1, 123, 0]);
    expect(songPosition(4)).toEqual([0xf2, 4, 0]);
    expect(songPosition(300)).toEqual([0xf2, 300 & 0x7f, 2]);
  });
});

describe('what a track sends over MIDI', () => {
  const note = { pitch: 40, velocity: 99 };

  it('sends nothing for a track on the synth', () => {
    expect(midiNoteFor({ instrument: 'bass', output: { kind: 'synth' } }, note)).toBeNull();
  });

  it('sends a synth track’s pitch and the note’s velocity', () => {
    const output = { kind: 'midi', deviceName: 'TD-3', channel: 1 };
    expect(midiNoteFor({ instrument: 'acid', output }, note)).toEqual({
      deviceName: 'TD-3',
      channel: 1,
      pitch: 40,
      velocity: 99,
    });
  });

  it('sends a drum’s General MIDI note, or the note its track names', () => {
    const output = { kind: 'midi', deviceName: 'RD-9', channel: 10 };
    expect(midiNoteFor({ instrument: 'clap', output }, note).pitch).toBe(39);
    expect(midiNoteFor({ instrument: 'clap', output: { ...output, note: 50 } }, note).pitch).toBe(50);
  });
});

describe('MIDI scheduling', () => {
  async function setUp({ devices = ['TR-8S', 'TD-3'], clock = null } = {}) {
    const mock = await createMockEngine();
    const access = new MockMidiAccess(devices);
    mock.engine.setMidiAccess(access);
    mock.engine.setClockOutput(clock);
    return { ...mock, access };
  }

  it('sends note-on and note-off on each track’s channel, at the audio clock’s time in performance.now() time', async () => {
    const { engine, context, access, played } = await setUp();
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    const first = PERFORMANCE_OFFSET_MS + 60;
    expect(timed(access.output('TR-8S'))).toEqual([{ data: [0x99, 36, 120], at: first }]);
    expect(timed(access.output('TD-3'))).toEqual([{ data: [0x91, 45, 100], at: first }]);
    expect(played, 'nothing on a MIDI track plays on the synth').toEqual([]);

    context.currentTime = 0.2;
    engine.tick();
    expect(timed(access.output('TR-8S'))).toEqual([
      { data: [0x99, 36, 120], at: first },
      { data: [0x89, 36, 0], at: first + STEP_MS },
    ]);
    expect(timed(access.output('TD-3')), 'a note ending where the next starts is released first').toEqual([
      { data: [0x91, 45, 100], at: first },
      { data: [0x81, 45, 0], at: first + 2 * STEP_MS },
      { data: [0x91, 45, 127], at: first + 2 * STEP_MS },
    ]);
    expect(
      played.map((note) => note.instrument),
      'the synth track still plays on the synth',
    ).toEqual(['hat']);
  });

  it('plays a track on the synth while its device is not connected, and on the device once it is', async () => {
    const { engine, context, access, played } = await setUp({ devices: ['TR-8S'] });
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    expect(played).toEqual([expect.objectContaining({ instrument: 'acid', pitch: 45 })]);
    access.plugIn('TD-3');
    context.currentTime = 0.2;
    engine.tick();
    expect(access.output('TD-3').messages()).toEqual([[0x91, 45, 127]]);
    access.unplug('TR-8S');
    expect(engine.midi.has('TR-8S')).toBe(false);
  });

  it('plays everything on the synth while MIDI is off', async () => {
    const { engine, played } = await setUp();
    engine.setMidiAccess(null);
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    expect(played.map((note) => note.instrument).sort()).toEqual(['acid', 'kick']);
  });

  it('on stop, releases held notes and sends all-notes-off on every channel used, after what was sent ahead', async () => {
    const { engine, context, access } = await setUp();
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    context.currentTime = 0.2;
    engine.tick();
    const lastSent = PERFORMANCE_OFFSET_MS + 60 + 2 * STEP_MS;
    access.output('TR-8S').sent = [];
    access.output('TD-3').sent = [];
    engine.stop();
    expect(timed(access.output('TD-3'))).toEqual([
      { data: [0x81, 45, 0], at: lastSent },
      { data: [0xb1, 123, 0], at: lastSent },
    ]);
    expect(timed(access.output('TR-8S'))).toEqual([{ data: [0xb9, 123, 0], at: lastSent }]);
    engine.stop();
    expect(access.output('TD-3').sent, 'a second stop sends nothing more').toHaveLength(2);
  });

  it('sends MIDI clock, 6 pulses a step after start, and stop', async () => {
    const { engine, context, access } = await setUp({ clock: 'TR-8S' });
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    const first = PERFORMANCE_OFFSET_MS + 60;
    const clock = () => timed(access.output('TR-8S')).filter(({ data }) => data.length === 1);
    expect(clock()).toEqual([
      { data: [START], at: first },
      ...[0, 1, 2, 3, 4, 5].map((pulse) => ({
        data: [CLOCK],
        at: Math.round((first + (pulse * STEP_MS) / 6) * 1000) / 1000,
      })),
    ]);
    context.currentTime = 0.2;
    engine.tick();
    expect(clock().filter(({ data }) => data[0] === CLOCK)).toHaveLength(18);
    engine.stop();
    const lastPulse = Math.round((first + 2 * STEP_MS + (5 * STEP_MS) / 6) * 1000) / 1000;
    expect(clock().at(-1)).toEqual({ data: [STOP], at: lastPulse });
  });

  it('sends the song position and continue when starting past the top', async () => {
    const { engine, access } = await setUp({ clock: 'TR-8S' });
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' }, 4);
    expect(access.output('TR-8S').messages().slice(0, 2)).toEqual([[0xf2, 4, 0], [0xfb]]);
  });

  it('sends an accent at the top velocity, and a slide as overlapping notes, a tie as one held note', async () => {
    const { engine, context, access } = await setUp();
    const song = midiSong();
    song.patterns[0].notes = [
      { trackId: 'acid', step: 0, length: 1, pitch: 45, velocity: 90, accent: true, slide: true },
      { trackId: 'acid', step: 1, length: 1, pitch: 48, velocity: 90, slide: true },
      { trackId: 'acid', step: 2, length: 1, pitch: 48, velocity: 90 },
    ];
    engine.start(song, { mode: 'pattern', patternId: 'p' });
    context.currentTime = 0.35;
    engine.tick();
    const first = PERFORMANCE_OFFSET_MS + 60;
    expect(timed(access.output('TD-3'))).toEqual([
      { data: [0x91, 45, 127], at: first },
      { data: [0x91, 48, 90], at: first + STEP_MS },
      { data: [0x81, 45, 0], at: first + STEP_MS + LEGATO_MS },
      { data: [0x81, 48, 0], at: first + 3 * STEP_MS },
    ]);
  });

  it('sends no clock without a clock output, or when it is not connected', async () => {
    const { engine, access } = await setUp({ clock: 'Missing' });
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    engine.stop();
    expect(
      access
        .output('TR-8S')
        .messages()
        .filter((data) => data.length === 1),
    ).toEqual([]);
  });

  it('times MIDI by the moment being heard when the browser reports it', async () => {
    const { engine, context, access } = await setUp();
    context.getOutputTimestamp = () => ({ contextTime: 0.05, performanceTime: 9000 });
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    expect(access.output('TR-8S').sent[0].timestamp).toBeCloseTo(9000 + 10, 6);
  });

  it('previews a drawn note on the track’s device, on and off', async () => {
    const { engine, access, played } = await setUp();
    const song = midiSong();
    engine.setSong(song);
    engine.preview('acid', 50, 0.5, 'acid');
    expect(timed(access.output('TD-3'))).toEqual([
      { data: [0x91, 50, 64], at: PERFORMANCE_OFFSET_MS + 10 },
      { data: [0x81, 50, 0], at: PERFORMANCE_OFFSET_MS + 260 },
    ]);
    engine.setSong({
      ...song,
      tracks: song.tracks.map((track) =>
        track.id === 'acid' ? { ...track, output: { kind: 'midi', deviceName: 'Gone', channel: 3 } } : track,
      ),
    });
    engine.preview('acid', 50, 0.5, 'acid');
    engine.preview('hat', 42, 0.5, 'hat');
    engine.preview('kick', 36);
    expect(
      played.map((note) => note.instrument),
      'a device not connected, a synth track and a preview with no track all play on the synth',
    ).toEqual(['acid', 'hat', 'kick']);
  });

  it('releases what the old access was sounding when MIDI is turned off while playing', async () => {
    const { engine, access } = await setUp();
    engine.start(midiSong(), { mode: 'pattern', patternId: 'p' });
    engine.setMidiAccess(null);
    expect(access.output('TD-3').messages()).toEqual([
      [0x91, 45, 100],
      [0x81, 45, 0],
      [0xb1, 123, 0],
    ]);
  });

  it('plays the starter song, all on the synth, as before', async () => {
    const { engine, played, access } = await setUp();
    const song = createStarterSong(makeId);
    engine.start(song, { mode: 'pattern', patternId: song.patterns[1].id });
    expect(played.length).toBeGreaterThan(0);
    expect(access.output('TR-8S').sent).toEqual([]);
  });
});

describe('MIDI sink on its own', () => {
  it('finds outputs by name only while connected, and nothing without access', () => {
    const sink = new MidiSink();
    expect(sink.has('TR-8S')).toBe(false);
    const access = new MockMidiAccess(['TR-8S']);
    sink.setAccess(access);
    expect(sink.has('TR-8S')).toBe(true);
    expect(sink.outputNamed('')).toBeNull();
    access.unplug('TR-8S');
    expect(sink.noteOn({ deviceName: 'TR-8S', channel: 1, pitch: 36, velocity: 1 }, 0, 1)).toBe(false);
  });
});
