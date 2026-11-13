// Tests for the synth voices and the mixer, against a stand-in audio graph that records every node and connection:
// each instrument builds its sound, connects it to the output, starts at the note's time and stops by itself, at the
// note's pitch. Then the 303-style acid line (ladder filter, accent, slide), the 909-style kit (tuning, the hat choke),
// wide voices spread left and right, and each track's strip routing to the right buses.
import { describe, expect, it } from 'vitest';

import { INSTRUMENTS } from '../../shared/instruments.js';
import { frequencyOf } from '../../shared/music.js';
import { createStarterSong } from '../../shared/song.js';
import { Mixer, impulseResponse, saturationCurve } from '../../src/audio/mixer.js';
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
      linearRampToValueAtTime: (target, time) => events.push(['linear', target, time]),
      setTargetAtTime: (target) => {
        events.push(['target', target]);
      },
      cancelScheduledValues: () => {},
      exponentialRampToValueAtTime: (target, time) => {
        expect(target, 'exponential ramps never reach zero').toBeGreaterThan(0);
        events.push(['ramp', target, time]);
      },
    };
  }

  node(extra = {}) {
    const node = {
      ...extra,
      outputs: [],
      connect: (target) => {
        this.connections += 1;
        node.outputs.push(target);
        return target;
      },
      disconnect: () => {
        node.disconnected = true;
      },
    };
    return node;
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
    const filter = this.node({ type: 'lowpass', frequency: this.param(350), Q: this.param(1), gain: this.param() });
    this.filters.push(filter);
    return filter;
  }

  createStereoPanner() {
    const panner = this.node({ kind: 'panner', pan: this.param() });
    this.panners = [...(this.panners ?? []), panner];
    return panner;
  }

  createWaveShaper() {
    return this.node({ kind: 'shaper', curve: null, oversample: 'none' });
  }

  createConvolver() {
    this.convolvers = (this.convolvers ?? 0) + 1;
    return this.node({ kind: 'convolver', buffer: null });
  }

  createDelay() {
    return this.node({ kind: 'delay', delayTime: this.param() });
  }

  createChannelMerger() {
    return this.node({ kind: 'merger' });
  }
}

/**
 * @param {any} from
 * @param {any} to
 * @returns {boolean} whether a signal entering `from` reaches `to`
 */
function reaches(from, to) {
  const seen = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === to) {
      return true;
    }
    if (!seen.has(node)) {
      seen.add(node);
      stack.push(...(node.outputs ?? []));
    }
  }
  return false;
}

/** The panners a voice built, by their pan. */
const pans = (context) => context.panners.map((panner) => panner.pan.value).sort((a, b) => a - b);

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

describe('stereo voices', () => {
  it('spreads the lead’s three saws left, centre and right', () => {
    const context = new RecordingContext();
    playNote(/** @type {any} */ (context), /** @type {any} */ (context.node()), 'lead', {
      time: 0,
      duration: 1,
      pitch: 72,
      gain: 1,
    });
    expect(pans(context)).toEqual([-0.55, 0, 0.55]);
  });

  it('builds the pad as a seven-saw supersaw, spread wide', () => {
    const context = new RecordingContext();
    playNote(/** @type {any} */ (context), /** @type {any} */ (context.node()), 'pad', {
      time: 0,
      duration: 2,
      pitch: 60,
      gain: 1,
    });
    const saws = context.sources.filter((source) => source.type === 'sawtooth');
    expect(saws).toHaveLength(7);
    expect(new Set(saws.map((saw) => saw.detune.value)).size).toBe(7);
    const spread = pans(context);
    expect(spread[0]).toBeCloseTo(-0.85);
    expect(spread[6]).toBeCloseTo(0.85);
  });
});

describe('mixer routing', () => {
  /** A mixer following the starter song, with the master it feeds. */
  function mixed() {
    const context = new RecordingContext();
    const master = context.node();
    const mixer = new Mixer(/** @type {any} */ (context), /** @type {any} */ (master));
    const song = createStarterSong(() => crypto.randomUUID());
    mixer.sync(song);
    const byInstrument = (instrument) => song.tracks.find((track) => track.instrument === instrument);
    return { context, master, mixer, song, byInstrument };
  }

  it('sends drums through the drum bus and synths straight to the master bus', () => {
    const { master, mixer, byInstrument } = mixed();
    const kick = mixer.strips.get(byInstrument('kick').id);
    const bass = mixer.strips.get(byInstrument('bass').id);
    expect(reaches(kick.input, master)).toBe(true);
    expect(reaches(kick.input, mixer.drums)).toBe(true);
    expect(reaches(bass.input, mixer.drums)).toBe(false);
    expect(reaches(bass.input, mixer.master)).toBe(true);
    // Through the low cut, saturation and presence, then out to the engine's master.
    expect(reaches(mixer.master, master)).toBe(true);
  });

  it('plays a track’s notes through its own strip, with its pan and sends', () => {
    const { context, mixer, byInstrument } = mixed();
    const hat = byInstrument('hat');
    const input = mixer.input(hat.id, 'hat');
    expect(input).toBe(mixer.strips.get(hat.id).input);
    playNote(/** @type {any} */ (context), /** @type {any} */ (input), 'hat', {
      time: 1,
      duration: 0.1,
      pitch: 42,
      gain: 1,
    });
    const hatSource = context.sources.at(-1);
    expect(reaches(hatSource, input)).toBe(true);
    const strip = mixer.strips.get(hat.id);
    expect(strip.panner.pan.events.at(-1)).toEqual(['target', hat.mix.pan / 100]);
    expect(strip.reverbSend.gain.events.at(-1)).toEqual(['target', hat.mix.reverb / 100]);
    expect(reaches(strip.input, mixer.convolver)).toBe(true);
    expect(reaches(strip.input, mixer.delayLeft)).toBe(true);
  });

  it('shares one reverb and one delay however many notes play, and makes the reverb again only when its shape changes', () => {
    const { context, mixer, song, byInstrument } = mixed();
    const lead = byInstrument('acid');
    for (let index = 0; index < 20; index += 1) {
      playNote(/** @type {any} */ (context), /** @type {any} */ (mixer.input(lead.id, 'acid')), 'acid', {
        time: index,
        duration: 0.1,
        pitch: 52,
        gain: 1,
      });
    }
    expect(context.convolvers).toBe(1);
    const buffer = mixer.convolver.buffer;
    mixer.sync({ ...song, fx: { ...song.fx, reverb: { ...song.fx.reverb, level: 10 } } });
    expect(mixer.convolver.buffer).toBe(buffer);
    mixer.sync({ ...song, fx: { ...song.fx, reverb: { ...song.fx.reverb, size: 90 } } });
    expect(mixer.convolver.buffer).not.toBe(buffer);
  });

  it('times the ping-pong delay to the tempo, the left repeat feeding the right', () => {
    const { mixer, song } = mixed();
    expect(mixer.delayLeft.delayTime.events.at(-1)).toEqual(['target', (0.75 * 60) / song.bpm]);
    mixer.sync({ ...song, bpm: 120, fx: { ...song.fx, delay: { ...song.fx.delay, division: '1/16' } } });
    expect(mixer.delayRight.delayTime.events.at(-1)).toEqual(['target', 0.125]);
    expect(mixer.delayLeft.outputs).toContain(mixer.delayRight);
    expect(reaches(mixer.delayRight, mixer.delayLeft)).toBe(true);
  });

  it('releases the strip of a removed track, and rebuilds one whose instrument changed', () => {
    const { mixer, song, byInstrument } = mixed();
    const kick = byInstrument('kick');
    const old = mixer.strips.get(kick.id);
    mixer.sync({ ...song, tracks: song.tracks.map((t) => (t.id === kick.id ? { ...t, instrument: 'tom' } : t)) });
    expect(old.input.disconnected).toBe(true);
    expect(mixer.strips.get(kick.id).instrument).toBe('tom');
    mixer.sync({ ...song, tracks: song.tracks.filter((track) => track.id !== kick.id) });
    expect(mixer.strips.has(kick.id)).toBe(false);
  });

  it('previews a note with no track through its instrument’s default strip, made once', () => {
    const { mixer } = mixed();
    const first = mixer.input(null, 'pluck');
    expect(mixer.input('unknown', 'pluck')).toBe(first);
    expect(mixer.input(null, 'kick')).not.toBe(first);
  });

  it('saturates gently, oversampled, and never past full scale', () => {
    const { context } = mixed();
    const curve = saturationCurve(2, 101);
    expect(curve[0]).toBeCloseTo(-1);
    expect(curve[100]).toBeCloseTo(1);
    expect(curve[50]).toBeCloseTo(0);
    expect(Math.max(...curve.map(Math.abs))).toBeLessThanOrEqual(1);
    const response = impulseResponse(/** @type {any} */ (context), 0, 0);
    expect(response.getChannelData(0).length).toBe(Math.round(8000 * 0.4));
  });
});
