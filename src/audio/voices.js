// The built-in instruments, synthesised with Web Audio, so the app makes sound the moment it opens. The drums play
// recorded samples instead once those have loaded (src/audio/samples.js); these voices are their fallback. Each voice builds its nodes for one note, schedules them at an exact time on the audio clock, and lets them
// stop by themselves. Tuned for driving electronic music: the acid line is modelled on a 303-style bassline (one
// oscillator into a resonant four-pole ladder filter, with accent and slide), and the drums on a 909-style machine (a
// pitch-swept kick with an attack click, a two-tone snare with snappy noise, metallic hats where the closed hat chokes
// the open one). A note that slides is held open and returned as a handle, which the scheduler uses to glide it into the
// track's next note. The synths (bass, acid, lead, pluck, keys, pad, fx) play on the voices written in Faust once
// those have loaded (faustSynths.js); the Web Audio versions below play until then, and wherever those cannot run.
import { frequencyOf } from '../../shared/music.js';
import { soundOf } from '../../shared/sound.js';
import { faustSynthFor } from './faustSynths.js';
import { playSample } from './samples.js';

/**
 * @typedef {{ time: number, duration: number, pitch: number, gain: number, accent?: boolean, slide?: boolean,
 *   sound?: import('../../shared/types.js').TrackSound }} NoteTiming `time` and `duration` in seconds on the audio
 *   clock; `gain` 0 to 1; `slide`: hold the note open and return a HeldVoice; `sound`: the track's knobs
 * @typedef {{ glide: (next: NoteTiming) => void, release: (time: number) => void }} HeldVoice a note held open by a
 *   slide: `glide` moves it to the next note's pitch without a new attack, `release` ends it
 * @typedef {(context: BaseAudioContext, options: AudioWorkletNodeOptions) => AudioNode & { parameters: AudioParamMap }}
 *   LadderFactory
 */

/** An accent plays a note this much louder (and the acid voice also opens its filter further and closes it faster). */
const ACCENT_GAIN = 1.35;
/** How long a slide takes to reach the next note's pitch. */
export const GLIDE_SECONDS = 0.06;
/** Far in the future on the audio clock: a held note's filter waits for its release. */
const HELD_UNTIL = 1e9;

/** @type {WeakMap<BaseAudioContext, LadderFactory>} contexts whose ladder filter worklet is loaded */
const ladders = new WeakMap();

/**
 * Lets the acid voice use the ladder filter worklet on a context once its module has loaded. Until then (and where
 * there is no AudioWorklet) it uses two biquad filters in a row: the same slope, a softer resonance.
 * @param {BaseAudioContext} context
 * @param {LadderFactory} create
 */
export function useLadderFilter(context, create) {
  ladders.set(context, create);
}

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
 * @param {number} tune a knob, 0 to 100
 * @returns {number} a pitch ratio: half an octave down to half an octave up, 1 at 50
 */
const tuneRatio = (tune) => 2 ** ((tune - 50) / 100);

/**
 * @param {number} decay a knob, 0 to 100
 * @returns {number} a length ratio: about a third to nearly three times, 1 at 50
 */
const decayRatio = (decay) => 2 ** ((decay - 50) / 35);

/**
 * A resonant low-pass for the acid voice: the ladder worklet when it is loaded, else two biquads in a row.
 * @param {BaseAudioContext} context
 * @param {number} resonance 0 to 1
 * @param {number} until the time on the audio clock the note needs the filter until
 * @returns {{ input: AudioNode, output: AudioNode, cutoffs: AudioParam[], setUntil: (time: number) => void }}
 */
function resonantLowpass(context, resonance, until) {
  const create = ladders.get(context);
  if (create) {
    const node = create(context, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: { resonance, until },
    });
    const untilParam = /** @type {AudioParam} */ (node.parameters.get('until'));
    return {
      input: node,
      output: node,
      cutoffs: [/** @type {AudioParam} */ (node.parameters.get('cutoff'))],
      setUntil: (time) => {
        untilParam.value = time;
      },
    };
  }
  const first = filter(context, 'lowpass', 1000, 0.6);
  const second = filter(context, 'lowpass', 1000, 0.8 + resonance * 16);
  first.connect(second);
  return { input: first, output: second, cutoffs: [first.frequency, second.frequency], setUntil: () => {} };
}

/**
 * Ends a pitched note when its gate closes, or, for a slide, keeps it sounding and returns the handle that glides it
 * into the next note. The amplitude stays at `level` while the gate is open, so a glide has no new attack.
 * @param {{ sources: OscillatorNode[], amp: GainNode, level: number, end: number, release: number, note: NoteTiming,
 *   onEnd?: (time: number) => void }} options `end`: when the gate closes; `onEnd`: told when the note will finish
 * @returns {HeldVoice | undefined}
 */
function gate({ sources, amp, level, end, release, note, onEnd }) {
  const finish = (/** @type {number} */ at) => {
    amp.gain.setValueAtTime(level, at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + release);
    for (const source of sources) {
      source.stop(at + release + 0.02);
    }
    onEnd?.(at + release + 0.05);
  };
  if (!note.slide) {
    finish(end);
    return undefined;
  }
  let isOpen = true;
  let frequency = frequencyOf(note.pitch);
  return {
    glide(next) {
      if (!isOpen) {
        return;
      }
      const target = frequencyOf(next.pitch);
      for (const source of sources) {
        source.frequency.setValueAtTime(frequency, next.time);
        source.frequency.exponentialRampToValueAtTime(target, next.time + GLIDE_SECONDS);
      }
      frequency = target;
      if (!next.slide) {
        isOpen = false;
        finish(next.time + Math.max(0.02, next.duration - release));
      }
    },
    release(at) {
      if (isOpen) {
        isOpen = false;
        finish(at);
      }
    },
  };
}

/**
 * The amplitude of a pitched note: a quick attack to `level`, held until the gate closes (see gate).
 * @param {BaseAudioContext} context
 * @param {number} time
 * @param {number} level
 * @param {number} [attack]
 */
function attackOnly(context, time, level, attack = 0.003) {
  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + attack);
  return amp;
}

/** The 909-style hat's metal: six square waves at clashing, unrelated pitches (Hz), filtered high. */
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** @type {WeakMap<BaseAudioContext, { choke: GainNode, start: number, until: number }>} the open hat ringing now */
const ringingOpenHats = new WeakMap();

/**
 * Cuts off an open hat that started before `time` and is still ringing: on the machine, closing the hat silences it.
 * @param {BaseAudioContext} context
 * @param {number} time
 */
function chokeOpenHat(context, time) {
  const ringing = ringingOpenHats.get(context);
  if (ringing && time > ringing.start && time < ringing.until) {
    ringing.choke.gain.setValueAtTime(1, time);
    ringing.choke.gain.exponentialRampToValueAtTime(0.0001, time + 0.008);
    ringingOpenHats.delete(context);
  }
}

/**
 * A metallic hat hit.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {{ time: number, gain: number, tune: number, release: number }} options
 */
function metalHit(context, out, { time, gain, tune, release }) {
  const ratio = tuneRatio(tune);
  const mix = context.createGain();
  mix.gain.value = 0.35;
  const sources = METAL.map((frequency) => {
    const source = oscillator(context, 'square', frequency * ratio * 1.6);
    source.connect(mix);
    return source;
  });
  // A little noise under the metal, as the sampled hats of the machine have.
  const air = noise(context);
  const airLevel = context.createGain();
  airLevel.gain.value = 0.25;
  air.connect(airLevel).connect(mix);
  const band = filter(context, 'bandpass', 10000 * ratio, 0.8);
  const high = filter(context, 'highpass', 7000 * ratio, 0.7);
  const amp = envelope(context, time, gain, 0.001, release);
  mix.connect(band).connect(high).connect(amp).connect(out);
  run([...sources, air], time, time + 0.001 + release);
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

/**
 * Detuned voices spread across the stereo field: the first on the left, the last on the right, evenly between. This is
 * what makes a lead or a pad wide instead of a thin line in the middle.
 * @param {BaseAudioContext} context
 * @param {AudioNode[]} sources
 * @param {AudioNode} destination
 * @param {number} width 0 (all centred) to 1 (the outer voices hard left and right)
 */
function spread(context, sources, destination, width) {
  sources.forEach((source, index) => {
    const panner = context.createStereoPanner();
    panner.pan.value = sources.length > 1 ? width * ((index / (sources.length - 1)) * 2 - 1) : 0;
    source.connect(panner).connect(destination);
  });
}

/** A supersaw's seven detunes in cents, wider at the edges, the way the classic trance pads are built. */
const SUPERSAW_CENTS = [-26, -15, -6, 0, 7, 16, 25];

/** @type {Record<string, (context: BaseAudioContext, out: AudioNode, note: NoteTiming) => HeldVoice | void>} */
const VOICES = {
  kick(context, out, { time, gain, sound }) {
    // A sine swept down fast from about five times its pitch: the sweep is the punch, the settled sine the boom.
    const knobs = soundOf('kick', sound);
    const base = 48 * tuneRatio(knobs.tune);
    const decay = 0.42 * decayRatio(knobs.decay);
    const body = oscillator(context, 'sine', base * 5);
    body.frequency.setValueAtTime(base * 5, time);
    body.frequency.exponentialRampToValueAtTime(base * 1.7, time + 0.014);
    body.frequency.exponentialRampToValueAtTime(base, time + 0.1);
    const amp = envelope(context, time, gain * 1.1, 0.0015, decay);
    body.connect(amp).connect(out);
    run([body], time, time + 0.0015 + decay);
    // The attack: a click of filtered noise and a very short high blip on top of the sweep.
    const click = knobs.attack / 100;
    if (click > 0) {
      noiseHit(context, out, { time, type: 'highpass', frequency: 2500, peak: gain * 0.45 * click, release: 0.006 });
      const blip = oscillator(context, 'square', base * 24);
      const blipAmp = envelope(context, time, gain * 0.18 * click, 0.0005, 0.004);
      blip.connect(blipAmp).connect(out);
      run([blip], time, time + 0.006);
    }
  },
  snare(context, out, { time, gain, sound }) {
    // Two tuned tones, each dropping slightly in pitch, under a burst of noise: snappy sets how much noise.
    const knobs = soundOf('snare', sound);
    const ratio = tuneRatio(knobs.tune);
    const length = decayRatio(knobs.decay);
    for (const [frequency, level, release] of [
      [180, 0.5, 0.11],
      [330, 0.32, 0.07],
    ]) {
      const tone = oscillator(context, 'triangle', frequency * ratio * 1.3);
      tone.frequency.setValueAtTime(frequency * ratio * 1.3, time);
      tone.frequency.exponentialRampToValueAtTime(frequency * ratio, time + 0.02);
      const amp = envelope(context, time, gain * level, 0.001, release * length);
      tone.connect(amp).connect(out);
      run([tone], time, time + 0.001 + release * length);
    }
    noiseHit(context, out, {
      time,
      type: 'highpass',
      frequency: 1800 * ratio,
      peak: gain * (0.12 + 0.7 * (knobs.snappy / 100)),
      release: 0.19 * length,
    });
  },
  clap(context, out, { time, gain, sound }) {
    // Three quick slaps, then the tail: the shape of hands clapping together.
    const knobs = soundOf('clap', sound);
    const ratio = tuneRatio(knobs.tune);
    for (const offset of [0, 0.011, 0.022]) {
      noiseHit(context, out, {
        time: time + offset,
        type: 'bandpass',
        frequency: 1300 * ratio,
        q: 1.4,
        peak: gain * 0.7,
        release: 0.01,
      });
    }
    noiseHit(context, out, {
      time: time + 0.03,
      type: 'bandpass',
      frequency: 1200 * ratio,
      q: 1.1,
      peak: gain * 0.55,
      release: 0.16 * decayRatio(knobs.decay),
    });
  },
  hat(context, out, { time, gain, sound }) {
    const knobs = soundOf('hat', sound);
    chokeOpenHat(context, time);
    metalHit(context, out, { time, gain: gain * 0.32, tune: knobs.tune, release: 0.05 * decayRatio(knobs.decay) });
  },
  openhat(context, out, { time, gain, sound }) {
    const knobs = soundOf('openhat', sound);
    chokeOpenHat(context, time);
    const release = 0.38 * decayRatio(knobs.decay);
    // Through its own gain, which the next closed hat closes.
    const choke = context.createGain();
    choke.connect(out);
    metalHit(context, choke, { time, gain: gain * 0.28, tune: knobs.tune, release });
    ringingOpenHats.set(context, { choke, start: time, until: time + release });
  },
  tom(context, out, { time, gain, sound }) {
    const knobs = soundOf('tom', sound);
    const ratio = tuneRatio(knobs.tune);
    const release = 0.3 * decayRatio(knobs.decay);
    const body = oscillator(context, 'sine', 160 * ratio);
    body.frequency.setValueAtTime(160 * ratio, time);
    body.frequency.exponentialRampToValueAtTime(85 * ratio, time + release * 0.8);
    const amp = envelope(context, time, gain * 0.8, 0.002, release);
    body.connect(amp).connect(out);
    run([body], time, time + 0.002 + release);
    noiseHit(context, out, { time, type: 'lowpass', frequency: 3000, peak: gain * 0.12, release: 0.03 });
  },
  perc(context, out, { time, gain }) {
    const blip = oscillator(context, 'square', 820);
    const shape = filter(context, 'bandpass', 1600, 3);
    const amp = envelope(context, time, gain * 0.35, 0.001, 0.06);
    blip.connect(shape).connect(amp).connect(out);
    run([blip], time, time + 0.08);
  },
  bass(context, out, note) {
    // Short and tight: rolling basslines need every note to end before the next, unless it slides into it.
    const { time, duration, pitch, gain, accent } = note;
    const saw = oscillator(context, 'sawtooth', frequencyOf(pitch));
    const sub = oscillator(context, 'sine', frequencyOf(pitch));
    const shape = filter(context, 'lowpass', 900, 3);
    shape.frequency.setValueAtTime(accent ? 2200 : 1400, time);
    shape.frequency.exponentialRampToValueAtTime(260, time + Math.min(0.12, duration));
    const level = gain * 0.55;
    const amp = attackOnly(context, time, level);
    saw.connect(shape);
    sub.connect(shape);
    shape.connect(amp).connect(out);
    saw.start(time);
    sub.start(time);
    return gate({ sources: [saw, sub], amp, level, end: time + Math.max(0.01, duration - 0.07), release: 0.06, note });
  },
  acid(context, out, note) {
    // One oscillator into the resonant ladder. Each note snaps the filter open by the env mod and lets it close over
    // the decay; the squelch is the resonance ringing as it sweeps.
    const { time, duration, pitch, gain, accent } = note;
    const knobs = soundOf('acid', note.sound);
    const base = 70 * 2 ** ((knobs.cutoff / 100) * 5.2);
    const peak = Math.min(base * 2 ** ((knobs.envMod / 100) * 4.5 + (accent ? 1.2 : 0)), 16000);
    // A 303-style accent ignores the decay knob: the filter shuts fast from a higher peak, which is what makes it bark.
    const decay = accent ? 0.15 : 0.08 * 30 ** (knobs.decay / 100);
    const release = 0.02;
    const end = time + Math.max(0.02, duration - release);
    const source = oscillator(context, knobs.waveform === 'square' ? 'square' : 'sawtooth', frequencyOf(pitch));
    // A held note does not know its end yet: the filter stays until the slide is released.
    const shape = resonantLowpass(context, knobs.resonance / 100, note.slide ? HELD_UNTIL : end + release + 0.05);
    for (const cutoff of shape.cutoffs) {
      cutoff.setValueAtTime(peak, time);
      cutoff.exponentialRampToValueAtTime(base, time + decay);
    }
    const level = gain * 0.3;
    const amp = attackOnly(context, time, level);
    source.connect(shape.input);
    shape.output.connect(amp).connect(out);
    source.start(time);
    return gate({ sources: [source], amp, level, end, release, note, onEnd: shape.setUntil });
  },
  lead(context, out, { time, duration, pitch, gain }) {
    const sources = [-9, 0, 9].map((cents) => oscillator(context, 'sawtooth', frequencyOf(pitch), cents));
    const shape = filter(context, 'lowpass', 3800, 1.2);
    const amp = envelope(context, time, gain * 0.16, 0.01, 0.18, Math.max(0, duration - 0.02));
    spread(context, sources, shape, 0.55);
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
    // A supersaw: seven detuned saws spread wide. Seven saws are louder than three, so each plays quieter.
    const sources = SUPERSAW_CENTS.map((cents) => oscillator(context, 'sawtooth', frequencyOf(pitch), cents));
    const shape = filter(context, 'lowpass', 1800, 0.8);
    const attack = Math.min(0.4, duration / 2);
    const amp = envelope(context, time, gain * 0.055, attack, 0.6, Math.max(0, duration - attack));
    spread(context, sources, shape, 0.85);
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
 * Plays one note of an instrument: a drum from its sample when one is ready, else the synthesised voice. An unknown
 * instrument plays as the lead. An accent plays it louder.
 * @param {BaseAudioContext} context
 * @param {AudioNode} out
 * @param {string} instrument
 * @param {NoteTiming} note
 * @returns {HeldVoice | undefined} for a note that slides on an instrument that glides, the handle that continues it
 */
export function playNote(context, out, instrument, note) {
  const synth = faustSynthFor(context, out, VOICES[instrument] ? instrument : 'lead');
  if (synth) {
    return synth.play(note);
  }
  const played = note.accent ? { ...note, gain: note.gain * ACCENT_GAIN } : note;
  if (playSample(context, out, instrument, played)) {
    return undefined;
  }
  return (VOICES[instrument] ?? VOICES.lead)(context, out, played) ?? undefined;
}

export const VOICE_IDS = Object.keys(VOICES);
