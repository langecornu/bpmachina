// Tests for the Faust synth's core on the audio thread, with recording voices instead of WebAssembly: events take
// effect at their exact sample, voices are picked and freed as notes start and end, and silent voices cost nothing.
import { describe, expect, it } from 'vitest';

import { SynthCore } from '../../src/audio/faust/synthCore.js';

const RATE = 1000; // one frame per millisecond keeps the arithmetic readable

/** A voice that records its controls and every stretch it was asked to compute, and plays a constant 1. */
class MockVoice {
  constructor() {
    this.values = {};
    this.history = [];
    this.calls = [];
  }

  set(name, value) {
    this.values[name] = value;
    this.history.push([name, value]);
  }

  addTo(left, right, offset, frames) {
    this.calls.push([offset, frames]);
    for (let index = offset; index < offset + frames; index += 1) {
      left[index] += 1;
      right[index] += 0.5;
    }
  }
}

/** @param {number} count */
function setup(count) {
  const voices = Array.from({ length: count }, () => new MockVoice());
  return { voices, core: new SynthCore(voices, RATE) };
}

/** @param {SynthCore} core @param {number} start @param {number} [frames] */
function render(core, start, frames = 128) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  core.render(start, left, right);
  return { left, right };
}

describe('synth core', () => {
  it('starts a note at its exact sample inside a quantum, with its controls set before the gate', () => {
    const { voices, core } = setup(2);
    core.receive({ type: 'on', id: 1, time: 0.05, params: { freq: 220, gain: 0.5 }, tail: 0.01 });
    const { left, right } = render(core, 0);
    expect(left[49]).toBe(0);
    expect(left[50]).toBe(1);
    expect(right[127]).toBe(0.5);
    expect(voices[0].calls).toEqual([[50, 78]]);
    expect(voices[0].history).toEqual([
      ['freq', 220],
      ['gain', 0.5],
      ['note', 1],
      ['gate', 1],
    ]);
    expect(voices[1].calls).toEqual([]);
    expect(core.activeVoices).toBe(1);
  });

  it('ends a note at its sample and stops computing the voice once its tail has passed', () => {
    const { voices, core } = setup(1);
    core.receive({ type: 'on', id: 7, time: 0, params: {}, tail: 0.1 });
    core.receive({ type: 'off', id: 7, time: 0.2 });
    render(core, 0, 128);
    render(core, 128, 128);
    expect(voices[0].values.gate).toBe(0);
    // Off at frame 200 with a 100-frame tail: still computed up to frame 300, not after.
    render(core, 256, 128);
    expect(voices[0].calls.at(-1)).toEqual([0, 128]);
    const { left } = render(core, 384, 128);
    expect(left.every((sample) => sample === 0)).toBe(true);
    expect(voices[0].calls).toHaveLength(4);
    expect(core.activeVoices).toBe(0);
  });

  it('plays events in time order whatever order they arrive in, and plays a late one at once', () => {
    const { voices, core } = setup(2);
    core.receive({ type: 'on', id: 2, time: 0.09, params: { freq: 2 }, tail: 0 });
    core.receive({ type: 'on', id: 1, time: 0.03, params: { freq: 1 }, tail: 0 });
    render(core, 0);
    expect(voices[0].values.freq).toBe(1);
    expect(voices[0].calls).toEqual([
      [30, 60],
      [90, 38],
    ]);
    expect(voices[1].calls).toEqual([[90, 38]]);
    core.receive({ type: 'off', id: 1, time: 0.05 }); // already past: applied at the start of the next quantum
    render(core, 128);
    expect(voices[0].values.gate).toBe(0);
  });

  it('changes a sounding note without a new attack, and ignores events for notes it no longer has', () => {
    const { voices, core } = setup(1);
    core.receive({ type: 'on', id: 1, time: 0, params: { freq: 100 }, tail: 0 });
    core.receive({ type: 'set', id: 1, time: 0.01, params: { freq: 200, glide: 0.06 } });
    core.receive({ type: 'set', id: 9, time: 0.02, params: { freq: 999 } });
    core.receive({ type: 'off', id: 9, time: 0.02 });
    render(core, 0);
    expect(voices[0].values).toMatchObject({ freq: 200, glide: 0.06, gate: 1, note: 1 });
  });

  it('takes a silent voice first, then the one fading longest, then the oldest held', () => {
    const { voices, core } = setup(2);
    core.receive({ type: 'on', id: 1, time: 0, params: {}, tail: 1 });
    core.receive({ type: 'on', id: 2, time: 0.001, params: {}, tail: 1 });
    core.receive({ type: 'off', id: 2, time: 0.002 });
    core.receive({ type: 'off', id: 1, time: 0.003 });
    // Both are fading: the second ended first, so it is taken.
    core.receive({ type: 'on', id: 3, time: 0.004, params: { freq: 3 }, tail: 1 });
    // Now one is fading (the first) and one is held (the third): the fading one goes.
    core.receive({ type: 'on', id: 4, time: 0.005, params: { freq: 4 }, tail: 1 });
    // Both held: the oldest, the third, is taken over, and attacks again with a new note count.
    core.receive({ type: 'on', id: 5, time: 0.006, params: { freq: 5 }, tail: 1 });
    render(core, 0, 16);
    expect(voices[1].values.freq).toBe(5);
    expect(voices[1].values.note).toBe(3);
    expect(voices[0].values.freq).toBe(4);
    // The note that lost its voice can no longer end the newer one.
    core.receive({ type: 'off', id: 3, time: 0.02 });
    render(core, 16, 16);
    expect(voices[1].values.gate).toBe(1);
  });
});
