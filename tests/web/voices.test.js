// Tests for the synth voices, against a stand-in audio graph that records every node: each instrument builds its
// sound, connects it to the output, starts at the note's time and stops by itself, at the note's pitch. Then the
// 303-style acid line (ladder filter, accent, slide) and the 909-style kit (tuning, the hat choke).
import { describe, expect, it } from 'vitest';

import { INSTRUMENTS } from '../../shared/instruments.js';
import { frequencyOf } from '../../shared/music.js';
import { GLIDE_SECONDS, VOICE_IDS, playNote, useLadderFilter } from '../../src/audio/voices.js';

/** A recording audio context: nodes, parameters with their automation, and sources with start and stop times. */
class RecordingContext {
  constructor() {
    this.sampleRate = 8000;
    this.sources = [];
    this.connections = 0;
    this.buffers = 0;
    this.gains = [];
    this.filters = [];
  }

  param(value = 0) {
    const events = [];
    return {
      value,
      events,
      setValueAtTime: (target, time) => events.push(['set', target, time]),
      exponentialRampToValueAtTime: (target, time) => {
        expect(target, 'exponential ramps never reach zero').toBeGreaterThan(0);
        events.push(['ramp', target, time]);
      },
    };
  }

  node(extra = {}) {
    return {
      ...extra,
      connect: (target) => {
        this.connections += 1;
        return target;
      },
    };
  }

  source(extra) {
    const source = this.node({
      ...extra,
      start: (time) => (source.startedAt = time),
      stop: (time) => (source.stoppedAt = time),
    });
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    return this.source({ type: 'sine', frequency: this.param(440), detune: this.param() });
  }

  createBufferSource() {
    return this.source({ buffer: null, loop: false });
  }

  createBuffer(_channels, length) {
    this.buffers += 1;
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  createGain() {
    const gain = this.node({ gain: this.param(1) });
    this.gains.push(gain);
    return gain;
  }

  createBiquadFilter() {
    const filter = this.node({ type: 'lowpass', frequency: this.param(350), Q: this.param(1) });
    this.filters.push(filter);
    return filter;
  }
}

describe('synth voices', () => {
  it('has a voice for every instrument the app offers', () => {
    expect(VOICE_IDS.sort()).toEqual(INSTRUMENTS.map((instrument) => instrument.id).sort());
  });

  for (const instrument of INSTRUMENTS) {
    it(`plays ${instrument.name}: starts on time, stops by itself`, () => {
      const context = new RecordingContext();
      const out = context.node();
      playNote(/** @type {any} */ (context), /** @type {any} */ (out), instrument.id, {
        time: 2,
        duration: 0.5,
        pitch: instrument.defaultPitch,
        gain: 0.8,
      });
      expect(context.sources.length).toBeGreaterThan(0);
      expect(context.connections).toBeGreaterThan(1);
      for (const source of context.sources) {
        expect(source.startedAt).toBeGreaterThanOrEqual(2);
        expect(source.stoppedAt).toBeGreaterThan(source.startedAt);
        expect(source.stoppedAt).toBeLessThan(4);
      }
      if (instrument.kind === 'synth') {
        const pitched = context.sources.filter((source) => source.frequency);
        expect(
          pitched.some((source) => Math.abs(source.frequency.value - frequencyOf(instrument.defaultPitch)) < 0.01),
        ).toBe(true);
      }
    });
  }

  it('makes the noise only once per context, and plays an unknown instrument as the lead', () => {
    const context = new RecordingContext();
    const out = context.node();
    for (let index = 0; index < 3; index += 1) {
      playNote(/** @type {any} */ (context), /** @type {any} */ (out), 'hat', {
        time: index,
        duration: 0.1,
        pitch: 42,
        gain: 1,
      });
    }
    expect(context.buffers).toBe(1);
    const lead = new RecordingContext();
    playNote(/** @type {any} */ (lead), /** @type {any} */ (lead.node()), 'theremin', {
      time: 0,
      duration: 1,
      pitch: 72,
      gain: 1,
    });
    expect(lead.sources).toHaveLength(3);
  });
});

/** @param {RecordingContext} context @param {string} instrument @param {object} note */
const play = (context, instrument, note) =>
  playNote(/** @type {any} */ (context), /** @type {any} */ (context.node()), instrument, {
    time: 1,
    duration: 0.2,
    pitch: 52,
    gain: 0.8,
    ...note,
  });

/** The highest level a gain is ramped to. */
const peakOf = (gain) => Math.max(...gain.gain.events.map((event) => event[1]));

describe('303-style acid line', () => {
  it('runs through the ladder filter once it is loaded, with the track’s knobs', () => {
    const context = new RecordingContext();
    const made = [];
    useLadderFilter(/** @type {any} */ (context), (_context, options) => {
      const parameters = new Map([
        ['cutoff', context.param(1000)],
        ['until', context.param(0)],
      ]);
      const node = context.node({ parameters, options });
      made.push(node);
      return node;
    });
    expect(play(context, 'acid', { sound: { resonance: 90, cutoff: 0, envMod: 0, waveform: 'square' } })).toBe(
      undefined,
    );
    expect(made).toHaveLength(1);
    expect(made[0].options.parameterData.resonance).toBeCloseTo(0.9);
    const cutoff = made[0].parameters.get('cutoff').events;
    // Cutoff 0 and no env mod: the filter sits at its lowest, about 70 Hz.
    expect(cutoff[0][1]).toBeCloseTo(70, 0);
    expect(made[0].parameters.get('until').value).toBeGreaterThan(1.2);
    expect(context.sources[0].type).toBe('square');
  });

  it('accents louder, with a higher filter peak that closes faster', () => {
    const plain = new RecordingContext();
    const accented = new RecordingContext();
    play(plain, 'acid', { sound: { decay: 100 } });
    play(accented, 'acid', { sound: { decay: 100 }, accent: true });
    expect(peakOf(accented.gains.at(-1))).toBeGreaterThan(peakOf(plain.gains.at(-1)) * 1.3);
    // Before the worklet loads, two biquads in a row stand in for the ladder: [set peak, ramp to the cutoff].
    const [plainPeak, plainClose] = plain.filters[0].frequency.events;
    const [accentPeak, accentClose] = accented.filters[0].frequency.events;
    expect(accented.filters).toHaveLength(2);
    expect(accentPeak[1]).toBeGreaterThan(plainPeak[1]);
    expect(accentClose[2] - 1).toBeLessThan((plainClose[2] - 1) / 5);
  });

  it('holds a slide open and glides into the next note without a new attack, then ends it', () => {
    const context = new RecordingContext();
    const held = play(context, 'acid', { slide: true });
    expect(held).toBeDefined();
    const [source] = context.sources;
    expect(source.stoppedAt).toBeUndefined();
    held.glide({ time: 1.2, duration: 0.2, pitch: 64, gain: 0.8, slide: true });
    held.glide({ time: 1.4, duration: 0.2, pitch: 59, gain: 0.8 });
    expect(context.sources).toHaveLength(1);
    expect(source.frequency.events).toContainEqual(['ramp', frequencyOf(64), 1.2 + GLIDE_SECONDS]);
    expect(source.frequency.events).toContainEqual(['set', frequencyOf(64), 1.4]);
    expect(source.frequency.events).toContainEqual(['ramp', frequencyOf(59), 1.4 + GLIDE_SECONDS]);
    expect(source.stoppedAt).toBeGreaterThan(1.5);
    held.glide({ time: 2, duration: 0.2, pitch: 40, gain: 0.8 });
    held.release(3);
    expect(source.frequency.events).not.toContainEqual(['ramp', frequencyOf(40), 2 + GLIDE_SECONDS]);
  });

  it('ends a held note where it is released, and lets the bass slide too', () => {
    const context = new RecordingContext();
    const held = play(context, 'bass', { slide: true });
    held.release(1.5);
    held.release(2);
    for (const source of context.sources) {
      expect(source.stoppedAt).toBeCloseTo(1.58);
    }
  });
});

describe('909-style kit', () => {
  it('tunes the kick and its click with the knobs', () => {
    const low = new RecordingContext();
    const high = new RecordingContext();
    play(low, 'kick', { sound: { tune: 0, attack: 0 } });
    play(high, 'kick', { sound: { tune: 100, attack: 100 } });
    const settle = (context) => context.sources[0].frequency.events.at(-1)[1];
    expect(settle(high)).toBeCloseTo(settle(low) * 2);
    expect(low.sources).toHaveLength(1);
    expect(high.sources.length).toBeGreaterThan(1);
  });

  it('chokes a ringing open hat with the next hat, but not one that starts with it', () => {
    const context = new RecordingContext();
    play(context, 'openhat', { time: 1 });
    const choke = context.gains.find((gain) => gain.gain.events.length === 0);
    play(context, 'hat', { time: 1 });
    expect(choke.gain.events).toEqual([]);
    play(context, 'hat', { time: 1.1 });
    expect(choke.gain.events).toEqual([
      ['set', 1, 1.1],
      ['ramp', 0.0001, 1.108],
    ]);
    play(context, 'hat', { time: 1.2 });
    expect(choke.gain.events).toHaveLength(2);
  });

  it('lets an open hat ring out when no hat follows in time', () => {
    const context = new RecordingContext();
    play(context, 'openhat', { time: 1, sound: { decay: 0 } });
    const choke = context.gains.find((gain) => gain.gain.events.length === 0);
    play(context, 'openhat', { time: 3 });
    expect(choke.gain.events).toEqual([]);
  });
});
