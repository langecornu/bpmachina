// Tests for the synth voices, against a stand-in audio graph that records every node: each instrument builds its
// sound, connects it to the output, starts at the note's time and stops by itself, at the note's pitch.
import { describe, expect, it } from 'vitest';

import { INSTRUMENTS } from '../../shared/instruments.js';
import { frequencyOf } from '../../shared/music.js';
import { VOICE_IDS, playNote } from '../../src/audio/voices.js';

/** A recording audio context: nodes, parameters with their automation, and sources with start and stop times. */
class RecordingContext {
  constructor() {
    this.sampleRate = 8000;
    this.sources = [];
    this.connections = 0;
    this.buffers = 0;
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
    return this.node({ gain: this.param(1) });
  }

  createBiquadFilter() {
    return this.node({ type: 'lowpass', frequency: this.param(350), Q: this.param(1) });
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
