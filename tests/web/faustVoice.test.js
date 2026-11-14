// Tests for the compiled Faust voices themselves: every instrument's WebAssembly, as committed, is instantiated and
// played through the same core the audio thread runs. A note sounds while held, stays finite and below clipping, is
// silent again once its tail has passed (so the core may stop computing it without a click), and attacks again when
// its voice is reused. Also the maths the voices import, and what a voice does with a control it lacks.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FaustVoice, MAX_FRAMES, mathsFor } from '../../src/audio/faust/faustVoice.js';
import { DSP_LAYOUTS } from '../../src/audio/faust/generated/layout.js';
import { FAUST_INSTRUMENTS, controlsOf } from '../../src/audio/faust/noteParams.js';
import { SynthCore } from '../../src/audio/faust/synthCore.js';

const RATE = 48000;

/** @param {string} instrument */
function moduleOf(instrument) {
  // Relative to the project, where the tests run from.
  return new WebAssembly.Module(readFileSync(path.resolve('src/audio/faust/generated', `${instrument}.wasm`)));
}

/**
 * Renders from `from` to `to` seconds and returns the loudest sample.
 * @param {SynthCore} core
 * @param {number} from
 * @param {number} to
 */
function peakBetween(core, from, to) {
  let peak = 0;
  const left = new Float32Array(MAX_FRAMES);
  const right = new Float32Array(MAX_FRAMES);
  for (let frame = Math.round(from * RATE); frame < to * RATE; frame += MAX_FRAMES) {
    core.render(frame, left, right);
    for (let index = 0; index < MAX_FRAMES; index += 1) {
      expect(Number.isFinite(left[index]) && Number.isFinite(right[index])).toBe(true);
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    }
  }
  return peak;
}

describe('Faust voices', () => {
  it('has a compiled stereo voice for every Faust instrument, with the controls a note sets', () => {
    for (const instrument of FAUST_INSTRUMENTS) {
      const layout = DSP_LAYOUTS[instrument];
      expect(layout.outputs).toBe(2);
      const { params } = controlsOf(instrument, { time: 0, duration: 1, pitch: 60, gain: 1 });
      for (const name of [...Object.keys(params), 'gate', 'note']) {
        expect(layout.params, `${instrument} has ${name}`).toHaveProperty(name);
      }
    }
  });

  for (const instrument of FAUST_INSTRUMENTS) {
    it(`plays ${instrument}: sounds while held, never clips, and is silent once its tail has passed`, () => {
      const module = moduleOf(instrument);
      const core = new SynthCore([new FaustVoice(module, DSP_LAYOUTS[instrument], RATE)], RATE);
      // On a quantum's first sample, so nothing is heard in the quanta before.
      const note = { time: (8 * MAX_FRAMES) / RATE, duration: 0.3, pitch: 57, gain: 1 };
      const { params, end, tail } = controlsOf(instrument, note, () => 0.5);
      core.receive({ type: 'on', id: 1, time: note.time, params, tail });
      core.receive({ type: 'off', id: 1, time: end });
      expect(peakBetween(core, 0, note.time)).toBe(0);
      const held = peakBetween(core, note.time, end);
      expect(held).toBeGreaterThan(0.01);
      expect(held).toBeLessThan(1);
      peakBetween(core, end, end + tail);
      expect(core.activeVoices).toBe(0);
      // What the voice would still play if it were computed past its tail.
      const voice = /** @type {FaustVoice} */ (core.slots[0].voice);
      const left = new Float32Array(MAX_FRAMES);
      const right = new Float32Array(MAX_FRAMES);
      voice.addTo(left, right, 0, MAX_FRAMES);
      expect(Math.max(...left.map(Math.abs), ...right.map(Math.abs))).toBeLessThan(held / 100);
    });
  }

  it('attacks again when a sounding voice is taken for a new note', () => {
    const core = new SynthCore([new FaustVoice(moduleOf('pluck'), DSP_LAYOUTS.pluck, RATE)], RATE);
    const first = controlsOf('pluck', { time: 0, duration: 2, pitch: 60, gain: 1 }, () => 0.5);
    core.receive({ type: 'on', id: 1, time: 0, params: first.params, tail: first.tail });
    const attack = peakBetween(core, 0, 0.05);
    // The pluck decays to nothing while held; a new note on the same voice must be as loud as the first.
    peakBetween(core, 0.05, 0.8);
    expect(peakBetween(core, 0.8, 1)).toBeLessThan(attack / 5);
    core.receive({ type: 'on', id: 2, time: 1, params: first.params, tail: first.tail });
    expect(peakBetween(core, 1, 1.05)).toBeGreaterThan(attack / 2);
  });

  it('provides the maths a voice imports, refuses what it cannot provide, and ignores unknown controls', () => {
    const { env } = mathsFor(['_tanhf', '_powf', '_fmodf', '_remainderf', '_rintf']);
    expect(env._tanhf(0)).toBe(0);
    expect(env._powf(2, 3)).toBe(8);
    expect(env._fmodf(7, 3)).toBe(1);
    expect(env._remainderf(7, 4)).toBe(-1);
    expect(env._rintf(2.4)).toBe(2);
    expect(() => mathsFor(['_besself'])).toThrow(/_besself/);
    const voice = new FaustVoice(moduleOf('keys'), DSP_LAYOUTS.keys, RATE);
    expect(() => voice.set('resonance', 1)).not.toThrow();
  });
});
