// What each Faust instrument is told for one note: its pitch in Hz, its level, its envelope and filter settings, and the
// small random offsets that keep it alive. The voices themselves (dsp/*.dsp) are fixed sounds with controls; this is
// where a note's length and loudness shape them, which is why a short pad note is a hard trance stab and a long one a
// swelling chord. The acid voice reads the track's 303-style sound knobs (cutoff, resonance, env mod, decay, waveform;
// shared/sound.js) with the same mapping as the built-in acid voice, so a track sounds the same shape on either. Pure:
// the randomness is injected.
import { frequencyOf } from '../../../shared/music.js';
import { soundOf } from '../../../shared/sound.js';

/** An accent plays a note this much louder; on the acid voice it also opens the filter further and closes it fast. */
export const ACCENT_GAIN = 1.35;
/** How long a slide takes to reach the next note's pitch. */
export const GLIDE_SECONDS = 0.06;

/**
 * The voices' filter envelope falls exponentially, fast at first (see bpm.lib). Given as the time to fall 60 dB, three
 * times the time a filter is meant to close over puts the cutoff 90% of the way back down (in octaves) by then, which is
 * how a sweep that closes over that time sounds.
 * @param {number} seconds
 * @returns {number} the envelope's filterDecay control
 */
const closingOver = (seconds) => seconds * 3;

/**
 * @typedef {{ time: number, duration: number, pitch: number, gain: number, accent?: boolean, slide?: boolean,
 *   sound?: import('../../../shared/types.js').TrackSound }} SynthNote `time` and `duration` in seconds on the audio
 *   clock; `gain` 0 to 1; `sound`: the track's knobs
 * @typedef {{ params: Record<string, number>, end: number, tail: number }} NoteControls `end`: when the gate closes,
 *   on the audio clock; `tail`: how long the voice still sounds after that
 */

/**
 * The acid filter as the 303-style knobs set it: where it rests, how far each note opens it, how fast it closes.
 * @param {SynthNote} note
 * @returns {{ cutoff: number, peak: number, filterDecay: number, resonance: number, waveform: number }}
 */
export function acidFilter(note) {
  const knobs = soundOf('acid', note.sound);
  const cutoff = 70 * 2 ** ((knobs.cutoff / 100) * 5.2);
  const opening = (knobs.envMod / 100) * 4.5 + (note.accent ? 1.2 : 0);
  // An accent ignores the decay knob, as on the hardware: the filter shuts fast from higher up, which makes it bark.
  const filterDecay = note.accent ? 0.15 : 0.08 * 30 ** (knobs.decay / 100);
  return {
    cutoff,
    peak: Math.min(cutoff * 2 ** opening, 16000),
    filterDecay: closingOver(filterDecay),
    resonance: knobs.resonance / 100,
    waveform: knobs.waveform === 'square' ? 1 : 0,
  };
}

/**
 * @param {number} start
 * @param {number} length seconds
 * @param {number} [shortenBy] seconds taken off so the release ends near where the note does
 * @returns {number} when the gate closes, never before the note has had 10 ms
 */
const gateEnd = (start, length, shortenBy = 0) => start + Math.max(0.01, length - shortenBy);

/** @type {Record<string, (note: SynthNote, level: number) => NoteControls>} */
const SHAPES = {
  bass({ time, duration, accent }, level) {
    // Short and tight: rolling basslines need every note to end before the next.
    return {
      params: {
        attack: 0.002,
        decay: 0.25,
        sustain: 0.8,
        release: 0.04,
        cutoff: 260,
        peak: (accent ? 2200 : 1400) * (0.7 + 0.3 * level),
        filterDecay: closingOver(Math.min(0.12, duration)),
        resonance: 0.3,
      },
      end: gateEnd(time, duration, 0.04),
      tail: 0.06,
    };
  },
  acid(note) {
    return {
      params: { attack: 0.003, decay: 1, sustain: 1, release: 0.02, ...acidFilter(note) },
      end: gateEnd(note.time, note.duration, 0.02),
      tail: 0.05,
    };
  },
  lead({ time, duration }, level) {
    return {
      params: {
        attack: 0.008,
        decay: 0.5,
        sustain: 0.75,
        release: 0.2,
        cutoff: 2000,
        peak: 4500 + 3000 * level,
        filterDecay: closingOver(0.35),
        resonance: 0.25,
      },
      end: gateEnd(time, duration),
      tail: 0.25,
    };
  },
  pluck({ time, duration }, level) {
    const ring = Math.min(0.6, duration + 0.25);
    return {
      params: {
        attack: 0.002,
        decay: ring,
        sustain: 0,
        release: 0.12,
        cutoff: 500,
        peak: 2500 + 4500 * level,
        filterDecay: closingOver(0.18),
        resonance: 0.45,
      },
      end: gateEnd(time, duration),
      tail: ring + 0.15,
    };
  },
  keys({ time, duration }) {
    return {
      params: { attack: 0.003, decay: 1.6, sustain: 0.35, release: 0.35 },
      end: gateEnd(time, duration),
      tail: 0.4,
    };
  },
  pad({ time, duration }) {
    // A short note is a stab: instant, with a filter that snaps shut. A long one swells in and stays open.
    const isStab = duration < 0.5;
    return {
      params: isStab
        ? {
            attack: 0.004,
            decay: 0.3,
            sustain: 0.6,
            release: 0.18,
            cutoff: 1500,
            peak: 7500,
            filterDecay: closingOver(0.15),
          }
        : {
            attack: Math.min(0.6, duration / 2),
            decay: 1,
            sustain: 1,
            release: 0.6,
            cutoff: 2400,
            peak: 2400,
            filterDecay: 1,
          },
      end: gateEnd(time, duration),
      tail: isStab ? 0.22 : 0.7,
    };
  },
  fx({ time, duration }) {
    return {
      params: { attack: 0.01, decay: 1, sustain: 1, release: 0.08, rise: Math.max(0.05, duration) },
      end: gateEnd(time, duration),
      tail: 0.1,
    };
  },
};

/** Instruments with a Faust voice. */
export const FAUST_INSTRUMENTS = Object.keys(SHAPES);

/**
 * Everything a voice needs for one note.
 * @param {string} instrument one of FAUST_INSTRUMENTS
 * @param {SynthNote} note
 * @param {() => number} [random] 0 to 1, for the drift
 * @returns {NoteControls}
 */
export function controlsOf(instrument, note, random = Math.random) {
  const level = note.gain * (note.accent ? ACCENT_GAIN : 1);
  const shape = SHAPES[instrument](note, Math.min(1, level));
  return {
    ...shape,
    params: {
      freq: frequencyOf(note.pitch),
      gain: level,
      glide: 0,
      // A few cents off, wandering slowly: each note and each voice of a chord its own.
      detune: (random() * 2 - 1) * 3,
      driftRate: 0.1 + random() * 0.5,
      ...shape.params,
    },
  };
}
