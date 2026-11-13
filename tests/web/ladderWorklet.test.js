// Tests for the acid voice's ladder filter, its maths run without audio: it passes the lows, falls away steeply above
// the cutoff, rings at the cutoff when resonant, never runs away, and lets the browser drop it once a note is over.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LADDER_PARAMETERS,
  LADDER_PROCESSOR,
  LadderFilter,
  MAX_FEEDBACK,
  feedbackOf,
  processBlock,
  stageGain,
} from '../../src/audio/ladderWorklet.js';

const RATE = 48000;

/**
 * The steady level of a sine through the filter, after it has settled.
 * @param {number} frequency
 * @param {number} cutoff
 * @param {number} resonance
 * @param {number} [amplitude] small, so the soft clip stays out of the way
 */
function levelThrough(frequency, cutoff, resonance, amplitude = 0.01) {
  const ladder = new LadderFilter();
  const gain = stageGain(cutoff, RATE);
  const feedback = feedbackOf(resonance);
  let peak = 0;
  for (let index = 0; index < RATE / 2; index += 1) {
    const out = ladder.process(amplitude * Math.sin((2 * Math.PI * frequency * index) / RATE), gain, feedback);
    if (index > RATE / 4) {
      peak = Math.max(peak, Math.abs(out));
    }
  }
  return peak / amplitude;
}

describe('ladder filter maths', () => {
  it('maps resonance to feedback just short of self-oscillation, clamped', () => {
    expect(feedbackOf(0)).toBe(0);
    expect(feedbackOf(1)).toBe(MAX_FEEDBACK);
    expect(feedbackOf(2)).toBe(MAX_FEEDBACK);
    expect(feedbackOf(-1)).toBe(0);
    expect(MAX_FEEDBACK).toBeLessThan(4);
  });

  it('keeps the stage coefficient between 0 and 1 for any cutoff', () => {
    for (const cutoff of [0, 10, 1000, 20000, 1e9]) {
      const gain = stageGain(cutoff, RATE);
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(1);
    }
    expect(stageGain(1000, RATE)).toBeLessThan(stageGain(4000, RATE));
  });

  it('passes the lows and falls away at four poles above the cutoff', () => {
    expect(levelThrough(50, 1000, 0)).toBeCloseTo(1, 1);
    // Three octaves above, a four-pole filter is down by about 72 dB; a two-pole one only by 36 dB.
    expect(levelThrough(8000, 1000, 0)).toBeLessThan(10 ** (-60 / 20));
  });

  it('rings at the cutoff when resonant', () => {
    expect(levelThrough(1000, 1000, 0.9)).toBeGreaterThan(3 * levelThrough(1000, 1000, 0));
  });

  it('stays bounded on loud input at full resonance', () => {
    const ladder = new LadderFilter();
    const gain = stageGain(800, RATE);
    let peak = 0;
    for (let index = 0; index < RATE; index += 1) {
      const out = ladder.process(index % 200 < 100 ? 1 : -1, gain, MAX_FEEDBACK);
      expect(Number.isFinite(out)).toBe(true);
      peak = Math.max(peak, Math.abs(out));
    }
    expect(peak).toBeLessThan(10);
  });

  it('filters a block, follows a swept cutoff, and stops once the note is over and the ringing dies', () => {
    const ladder = new LadderFilter();
    const output = new Float32Array(128);
    const input = new Float32Array(128).fill(0.5);
    const sweep = Float32Array.from({ length: 128 }, (_, index) => 200 + index * 50);
    expect(processBlock(ladder, input, output, sweep, 0.5, RATE, true)).toBe(true);
    expect(output[127]).not.toBe(0);
    expect(processBlock(ladder, undefined, output, new Float32Array([1000]), 0.5, RATE, false)).toBe(true);
    let isRunning = true;
    for (let block = 0; block < 2000 && isRunning; block += 1) {
      isRunning = processBlock(ladder, undefined, output, new Float32Array([1000]), 0.5, RATE, false);
    }
    expect(isRunning).toBe(false);
  });
});

describe('ladder filter processor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('registers on the audio thread with its parameters and filters what it is given', async () => {
    const registered = {};
    vi.stubGlobal('AudioWorkletProcessor', class {});
    vi.stubGlobal('registerProcessor', (name, processor) => (registered[name] = processor));
    vi.stubGlobal('sampleRate', RATE);
    vi.stubGlobal('currentTime', 1);
    await import('../../src/audio/ladderWorklet.js?processor');
    const Processor = registered[LADDER_PROCESSOR];
    expect(Processor.parameterDescriptors).toEqual(LADDER_PARAMETERS);
    const processor = new Processor();
    const output = [[new Float32Array(128)]];
    const parameters = {
      cutoff: new Float32Array([1200]),
      resonance: new Float32Array([0.7]),
      until: new Float32Array([2]),
    };
    expect(processor.process([[new Float32Array(128).fill(0.3)]], output, parameters)).toBe(true);
    expect(output[0][0].some((sample) => sample !== 0)).toBe(true);
    expect(processor.process([[]], output, { ...parameters, until: new Float32Array([0]) })).toBe(true);
  });
});
