// Tests for what each Faust instrument is told for a note: pitch, level and accent, where its gate closes, the drift,
// the acid's 303-style knobs (the same defaults and mapping as the sound panel's), and how note length shapes the pad
// and the riser.
import { describe, expect, it } from 'vitest';

import { frequencyOf } from '../../shared/music.js';
import { ACCENT_GAIN, FAUST_INSTRUMENTS, acidFilter, controlsOf } from '../../src/audio/faust/noteParams.js';

const note = { time: 2, duration: 0.5, pitch: 57, gain: 0.8 };

describe('Faust note controls', () => {
  it('covers the synth instruments', () => {
    expect(FAUST_INSTRUMENTS.sort()).toEqual(['acid', 'bass', 'fx', 'keys', 'lead', 'pad', 'pluck']);
  });

  it('gives every note its pitch, level, a fresh start and a few cents of drift', () => {
    for (const instrument of FAUST_INSTRUMENTS) {
      const low = controlsOf(instrument, note, () => 0);
      const high = controlsOf(instrument, note, () => 1);
      expect(low.params.freq).toBeCloseTo(frequencyOf(57));
      expect(low.params.gain).toBeCloseTo(0.8);
      expect(low.params.glide).toBe(0);
      expect(low.params.detune).toBe(-3);
      expect(high.params.detune).toBe(3);
      expect(high.params.driftRate).toBeGreaterThan(low.params.driftRate);
      expect(low.end).toBeGreaterThan(note.time);
      expect(low.end).toBeLessThanOrEqual(note.time + note.duration);
      expect(low.tail).toBeGreaterThan(0);
    }
  });

  it('plays an accent louder, and on the bass and acid opens the filter further', () => {
    const accented = { ...note, accent: true };
    expect(controlsOf('lead', accented).params.gain).toBeCloseTo(0.8 * ACCENT_GAIN);
    expect(controlsOf('bass', accented).params.peak).toBeGreaterThan(controlsOf('bass', note).params.peak);
    expect(controlsOf('acid', accented).params.peak).toBeGreaterThan(controlsOf('acid', note).params.peak);
  });

  it('closes a short note’s gate early enough for its release, never before 10 ms', () => {
    expect(controlsOf('bass', { ...note, duration: 0.02 }).end).toBeCloseTo(2.01);
    expect(controlsOf('acid', note).end).toBeCloseTo(2.48);
    expect(controlsOf('keys', note).end).toBeCloseTo(2.5);
  });

  it('sets the acid filter from the 303-style knobs, with their defaults when a track has none', () => {
    const defaults = acidFilter(note);
    expect(defaults.cutoff).toBeCloseTo(70 * 2 ** (0.35 * 5.2));
    expect(defaults.peak).toBeCloseTo(defaults.cutoff * 2 ** (0.55 * 4.5));
    expect(defaults.resonance).toBeCloseTo(0.7);
    expect(defaults.waveform).toBe(0);
    const turned = acidFilter({
      ...note,
      sound: { cutoff: 100, resonance: 100, envMod: 100, decay: 0, waveform: 'square' },
    });
    expect(turned.peak).toBe(16000);
    expect(turned.resonance).toBe(1);
    expect(turned.waveform).toBe(1);
    expect(turned.filterDecay).toBeLessThan(defaults.filterDecay);
    // Out of range or not a number: clamped, or the default.
    expect(acidFilter({ ...note, sound: { resonance: 250, cutoff: 'high' } })).toMatchObject({
      resonance: 1,
      cutoff: defaults.cutoff,
    });
    // An accent closes fast whatever the decay knob says.
    const slow = { ...note, sound: { decay: 100 } };
    expect(acidFilter({ ...slow, accent: true }).filterDecay).toBeLessThan(acidFilter(slow).filterDecay);
  });

  it('makes a short pad note a stab and a long one a swell, and stretches the riser over the note', () => {
    const stab = controlsOf('pad', { ...note, duration: 0.2 });
    const swell = controlsOf('pad', { ...note, duration: 4 });
    expect(stab.params.attack).toBeLessThan(0.01);
    expect(stab.params.peak).toBeGreaterThan(stab.params.cutoff);
    expect(swell.params.attack).toBeCloseTo(0.6);
    expect(swell.tail).toBeGreaterThan(stab.tail);
    expect(controlsOf('fx', { ...note, duration: 8 }).params.rise).toBe(8);
  });
});
