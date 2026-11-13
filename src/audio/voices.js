// The built-in instruments, synthesised with Web Audio: no samples to download, so the app makes sound the moment it
// opens. Each voice builds its nodes for one note, schedules them at an exact time on the audio clock, and lets them
// stop by themselves. Tuned for driving electronic music: a punchy kick, a tight rolling bass, a resonant acid line.
import { frequencyOf } from '../../shared/music.js';

/**
 * @typedef {{ time: number, duration: number, pitch: number, gain: number }} NoteTiming `time` and `duration` in
 *   seconds on the audio clock; `gain` 0 to 1
 */

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} one second of white noise per context */
const noiseBuffers = new WeakMap();

/** @param {BaseAudioContext} context */
function noise(context) {
  let buffer = noiseBuffers.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    noiseBuffers.set(context, buffer);
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

/**
 * A gain node with an attack and a decay to silence, which ends the voice.
 * @param {BaseAudioContext} context
 * @param {number} time
 * @param {number} peak
 * @param {number} attack seconds
 * @param {number} release seconds after `hold`
 * @param {number} [hold] seconds at the peak before the release
 */
function envelope(context, time, peak, attack, release, hold = 0) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  gain.gain.setValueAtTime(Math.max(0.0002, peak), time + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + hold + release);
  return gain;
}

/**
 * @param {AudioScheduledSourceNode[]} sources
 * @param {number} start
 * @param {number} end
 */
function run(sources, start, end) {
  for (const source of sources) {
    source.start(start);
    source.stop(end + 0.05);
  }
}

/**
 * @param {BaseAudioContext} context
 * @param {OscillatorType} type
 * @param {number} frequency
 * @param {number} [detuneCents]
 */
function oscillator(context, type, frequency, detuneCents = 0) {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detuneCents;
  return osc;
}

/**
 * @param {BaseAudioContext} context
 * @param {BiquadFilterType} type
 * @param {number} frequency
 * @param {number} [q]
 */
function filter(context, type, frequency, q = 0.7) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/**
 * A noise burst through a filter: hats, claps, snares and risers are built on this.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {{ time: number, type: BiquadFilterType, frequency: number, q?: number, peak: number, release: number,
 *   attack?: number }} options
 */
function noiseHit(context, out, { time, type, frequency, q = 0.7, peak, release, attack = 0.001 }) {
  const source = noise(context);
  const shape = filter(context, type, frequency, q);
  const amp = envelope(context, time, peak, attack, release);
  source.connect(shape).connect(amp).connect(out);
  run([source], time, time + attack + release);
}

/** @type {Record<string, (context: BaseAudioContext, out: AudioNode, note: NoteTiming) => void>} */
const VOICES = {
  kick(context, out, { time, gain }) {
    const body = oscillator(context, 'sine', 150);
    body.frequency.setValueAtTime(150, time);
    body.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    const amp = envelope(context, time, gain * 1.1, 0.002, 0.34);
    body.connect(amp).connect(out);
    run([body], time, time + 0.4);
    noiseHit(context, out, { time, type: 'highpass', frequency: 3000, peak: gain * 0.25, release: 0.012 });
  },
  snare(context, out, { time, gain }) {
    const tone = oscillator(context, 'triangle', 185);
    const amp = envelope(context, time, gain * 0.5, 0.001, 0.09);
    tone.connect(amp).connect(out);
    run([tone], time, time + 0.12);
    noiseHit(context, out, { time, type: 'highpass', frequency: 1400, peak: gain * 0.6, release: 0.17 });
  },
  clap(context, out, { time, gain }) {
    // Three quick slaps, then the tail: the shape of hands clapping together.
    for (const offset of [0, 0.011, 0.022]) {
      noiseHit(context, out, {
        time: time + offset,
        type: 'bandpass',
        frequency: 1300,
        q: 1.4,
        peak: gain * 0.7,
        release: 0.01,
      });
    }
    noiseHit(context, out, {
      time: time + 0.03,
      type: 'bandpass',
      frequency: 1200,
      q: 1.1,
      peak: gain * 0.55,
      release: 0.16,
    });
  },
  hat(context, out, { time, gain }) {
    noiseHit(context, out, { time, type: 'highpass', frequency: 7500, peak: gain * 0.35, release: 0.045 });
  },
  openhat(context, out, { time, gain }) {
    noiseHit(context, out, { time, type: 'highpass', frequency: 6800, peak: gain * 0.3, release: 0.32 });
  },
  tom(context, out, { time, gain }) {
    const body = oscillator(context, 'sine', 140);
    body.frequency.setValueAtTime(140, time);
    body.frequency.exponentialRampToValueAtTime(75, time + 0.25);
    const amp = envelope(context, time, gain * 0.8, 0.002, 0.3);
    body.connect(amp).connect(out);
    run([body], time, time + 0.32);
  },
  perc(context, out, { time, gain }) {
    const blip = oscillator(context, 'square', 820);
    const shape = filter(context, 'bandpass', 1600, 3);
    const amp = envelope(context, time, gain * 0.35, 0.001, 0.06);
    blip.connect(shape).connect(amp).connect(out);
    run([blip], time, time + 0.08);
  },
  bass(context, out, { time, duration, pitch, gain }) {
    // Short and tight: rolling basslines need every note to end before the next.
    const saw = oscillator(context, 'sawtooth', frequencyOf(pitch));
    const sub = oscillator(context, 'sine', frequencyOf(pitch));
    const shape = filter(context, 'lowpass', 900, 3);
    shape.frequency.setValueAtTime(1400, time);
    shape.frequency.exponentialRampToValueAtTime(260, time + Math.min(0.12, duration));
    const amp = envelope(context, time, gain * 0.55, 0.003, 0.06, Math.max(0, duration - 0.07));
    saw.connect(shape);
    sub.connect(shape);
    shape.connect(amp).connect(out);
    run([saw, sub], time, time + duration + 0.06);
  },
  acid(context, out, { time, duration, pitch, gain }) {
    const saw = oscillator(context, 'sawtooth', frequencyOf(pitch));
    const shape = filter(context, 'lowpass', 400, 13);
    // The squelch: a resonant filter sweeping down fast, deeper on louder notes.
    shape.frequency.setValueAtTime(500 + gain * 3200, time);
    shape.frequency.exponentialRampToValueAtTime(320, time + 0.16);
    const amp = envelope(context, time, gain * 0.32, 0.003, 0.08, Math.max(0, duration - 0.06));
    saw.connect(shape).connect(amp).connect(out);
    run([saw], time, time + duration + 0.1);
  },
  lead(context, out, { time, duration, pitch, gain }) {
    const sources = [-9, 0, 9].map((cents) => oscillator(context, 'sawtooth', frequencyOf(pitch), cents));
    const shape = filter(context, 'lowpass', 3800, 1.2);
    const amp = envelope(context, time, gain * 0.16, 0.01, 0.18, Math.max(0, duration - 0.02));
    for (const source of sources) {
      source.connect(shape);
    }
    shape.connect(amp).connect(out);
    run(sources, time, time + duration + 0.2);
  },
  pluck(context, out, { time, duration, pitch, gain }) {
    const source = oscillator(context, 'square', frequencyOf(pitch));
    const shape = filter(context, 'lowpass', 600, 4);
    shape.frequency.setValueAtTime(4200, time);
    shape.frequency.exponentialRampToValueAtTime(500, time + 0.18);
    const amp = envelope(context, time, gain * 0.2, 0.002, Math.min(0.35, duration + 0.15));
    source.connect(shape).connect(amp).connect(out);
    run([source], time, time + 0.4);
  },
  keys(context, out, { time, duration, pitch, gain }) {
    const tone = oscillator(context, 'triangle', frequencyOf(pitch));
    const bell = oscillator(context, 'sine', frequencyOf(pitch) * 2);
    const amp = envelope(context, time, gain * 0.22, 0.004, 0.35, Math.max(0, duration - 0.05));
    tone.connect(amp);
    bell.connect(amp);
    amp.connect(out);
    run([tone, bell], time, time + duration + 0.4);
  },
  pad(context, out, { time, duration, pitch, gain }) {
    const sources = [-12, 0, 12].map((cents) => oscillator(context, 'sawtooth', frequencyOf(pitch), cents));
    const shape = filter(context, 'lowpass', 1500, 0.8);
    const attack = Math.min(0.4, duration / 2);
    const amp = envelope(context, time, gain * 0.08, attack, 0.6, Math.max(0, duration - attack));
    for (const source of sources) {
      source.connect(shape);
    }
    shape.connect(amp).connect(out);
    run(sources, time, time + duration + 0.65);
  },
  fx(context, out, { time, duration, pitch, gain }) {
    // A riser: noise and a saw both climbing an octave across the note, the filter opening with them.
    const source = noise(context);
    const saw = oscillator(context, 'sawtooth', frequencyOf(pitch));
    saw.frequency.setValueAtTime(frequencyOf(pitch), time);
    saw.frequency.exponentialRampToValueAtTime(frequencyOf(pitch + 12), time + duration);
    const shape = filter(context, 'bandpass', 400, 2);
    shape.frequency.setValueAtTime(400, time);
    shape.frequency.exponentialRampToValueAtTime(6000, time + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.25), time + duration);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.08);
    source.connect(shape);
    saw.connect(shape);
    shape.connect(amp).connect(out);
    run([source, saw], time, time + duration + 0.1);
  },
};

/**
 * Plays one note of an instrument. An unknown instrument plays as the lead.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {string} instrument
 * @param {NoteTiming} note
 */
export function playNote(context, out, instrument, note) {
  (VOICES[instrument] ?? VOICES.lead)(context, out, note);
}

export const VOICE_IDS = Object.keys(VOICES);
