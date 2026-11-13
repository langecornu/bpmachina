// The mixing desk between the voices and the master: a channel strip per track (a ducking gain, a stereo pan, and sends
// to the shared effects), two shared effect buses (a reverb whose impulse response is made in code, and a tempo-synced
// stereo ping-pong delay with a filter in its loop), a drum bus with gentle saturation, and a master bus with a low cut,
// saturation and a presence lift before the engine's limiter. Every bus is built once per audio context and reused, so
// a dense song costs one convolver, not one per note. Sidechain ducking is gain automation at each kick's exact time.
import { isDrum } from '../../shared/instruments.js';
import { defaultFx, defaultMix, delaySeconds, duckReleaseSeconds } from '../../shared/mix.js';

/** How fast a ducked track dips on the kick, in seconds: quick, but not a click. */
export const DUCK_ATTACK_SECONDS = 0.004;
/** The lowest a duck goes, so the exponential recovery never starts from zero. */
const DUCK_FLOOR = 0.05;
/** How fast a control change glides, in seconds, so moving a knob never clicks. */
const GLIDE_SECONDS = 0.015;
const REVERB_PREDELAY_SECONDS = 0.018;
const MAX_DELAY_SECONDS = 2;

/**
 * @typedef {{
 *   input: GainNode, duck: GainNode, panner: StereoPannerNode, reverbSend: GainNode, delaySend: GainNode,
 *   instrument: string, ducks: boolean, duckUntil: number,
 * }} Strip
 */

/**
 * A soft-clipping curve: a tanh shape normalised so a full-scale input stays full scale. It never goes past ±1.
 * @param {number} drive 1 is almost clean; higher is warmer and denser
 * @param {number} [size]
 * @returns {Float32Array}
 */
export function saturationCurve(drive, size = 2048) {
  const curve = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let index = 0; index < size; index += 1) {
    const x = (index / (size - 1)) * 2 - 1;
    curve[index] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * A reverb's impulse response: stereo noise, different on each side so the tail is wide, fading out over its length.
 * @param {BaseAudioContext} context
 * @param {number} size 0 to 100: the length of the tail, from 0.4 to 5 seconds
 * @param {number} decay 0 to 100: how slowly it fades within that length
 * @returns {AudioBuffer}
 */
export function impulseResponse(context, size, decay) {
  const seconds = 0.4 + (size / 100) * 4.6;
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  // A steep power fades fast (a short, dense tail); a gentle one lets the tail ring to the end.
  const power = 6 - (decay / 100) * 4.8;
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** power;
    }
  }
  return buffer;
}

/**
 * @param {BaseAudioContext} context
 * @param {BiquadFilterType} type
 * @param {number} frequency
 * @param {{ q?: number, gain?: number }} [options]
 */
function biquad(context, type, frequency, { q = 0.7, gain = 0 } = {}) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.gain.value = gain;
  return node;
}

/**
 * @param {BaseAudioContext} context
 * @param {number} drive
 */
function saturator(context, drive) {
  const node = context.createWaveShaper();
  node.curve = saturationCurve(drive);
  node.oversample = '4x';
  return node;
}

/**
 * @param {BaseAudioContext} context
 * @param {number} [value]
 */
function gainNode(context, value = 1) {
  const node = context.createGain();
  node.gain.value = value;
  return node;
}

export class Mixer {
  /**
   * @param {BaseAudioContext} context
   * @param {AudioNode} destination where the mix goes: the engine's master volume, before its limiter
   */
  constructor(context, destination) {
    this.context = context;
    /** @type {Map<string, Strip>} one per track */
    this.strips = new Map();
    /** @type {Map<string, Strip>} for notes previewed without a track, one per instrument */
    this.previews = new Map();
    this.fx = defaultFx();
    this.bpm = 140;
    this.reverbShape = '';

    // The master bus: trimmed for headroom, the sub-bass rumble cut, warmed, and a little presence for the hats and
    // leads. The engine's limiter after it catches the peaks.
    this.master = gainNode(context, 0.8);
    const lowCut = biquad(context, 'highpass', 28);
    const warmth = saturator(context, 1.3);
    const presence = biquad(context, 'peaking', 3200, { q: 0.8, gain: 2 });
    this.master.connect(lowCut).connect(warmth).connect(presence).connect(destination);

    // The drum bus: glued and a little driven, so the kick and claps punch.
    this.drums = gainNode(context, 0.9);
    this.drums.connect(saturator(context, 2)).connect(this.master);

    // The reverb: a short pre-delay keeps the dry hit clear, the low end stays out of the tail, the top is damped.
    this.reverbIn = gainNode(context);
    this.convolver = context.createConvolver();
    this.reverbReturn = gainNode(context, 0.6);
    const predelay = context.createDelay(0.1);
    predelay.delayTime.value = REVERB_PREDELAY_SECONDS;
    this.reverbIn
      .connect(predelay)
      .connect(biquad(context, 'highpass', 240))
      .connect(this.convolver)
      .connect(biquad(context, 'lowpass', 8500))
      .connect(this.reverbReturn)
      .connect(this.master);

    // The ping-pong delay: the left line feeds the right, the right feeds back into the left through the loop
    // filters, so each repeat crosses the stereo field and loses a little low end and top.
    this.delayIn = gainNode(context);
    this.delayLeft = context.createDelay(MAX_DELAY_SECONDS);
    this.delayRight = context.createDelay(MAX_DELAY_SECONDS);
    this.feedback = gainNode(context, 0.35);
    this.loopTone = biquad(context, 'lowpass', 4000);
    const loopLowCut = biquad(context, 'highpass', 220);
    const merger = context.createChannelMerger(2);
    this.delayReturn = gainNode(context, 0.5);
    this.delayIn.connect(loopLowCut).connect(this.delayLeft);
    this.delayLeft.connect(merger, 0, 0);
    this.delayLeft.connect(this.delayRight);
    this.delayRight.connect(merger, 0, 1);
    this.delayRight.connect(this.feedback).connect(this.loopTone).connect(loopLowCut);
    merger.connect(this.delayReturn).connect(this.master);
    this.applyFx();
  }

  /**
   * Follows the song: its tempo and effects, and a strip for each track with its pan, sends and ducking. Strips of
   * removed tracks are released.
   * @param {import('../../shared/types.js').Song} song
   */
  sync(song) {
    this.bpm = song.bpm;
    this.fx = song.fx ?? defaultFx();
    this.applyFx();
    const ids = new Set();
    for (const track of song.tracks) {
      ids.add(track.id);
      let strip = this.strips.get(track.id);
      if (strip && strip.instrument !== track.instrument) {
        this.release(strip);
        strip = undefined;
      }
      if (!strip) {
        strip = this.createStrip(track.instrument);
        this.strips.set(track.id, strip);
      }
      this.setMix(strip, track.mix ?? defaultMix(track.instrument));
    }
    for (const [id, strip] of this.strips) {
      if (!ids.has(id)) {
        this.release(strip);
        this.strips.delete(id);
      }
    }
  }

  /**
   * Where a note goes: its track's strip, or for a note with no track (or one not synced yet) its instrument's default.
   * @param {string | null | undefined} trackId
   * @param {string} instrument
   * @returns {AudioNode}
   */
  input(trackId, instrument) {
    const strip = trackId ? this.strips.get(trackId) : undefined;
    if (strip) {
      return strip.input;
    }
    let preview = this.previews.get(instrument);
    if (!preview) {
      preview = this.createStrip(instrument);
      this.setMix(preview, defaultMix(instrument));
      this.previews.set(instrument, preview);
    }
    return preview.input;
  }

  /**
   * Ducks every ducking track under a kick: a quick dip at the kick's exact time, then a recovery in time with the
   * tempo. A kick that falls while a track is still recovering from the last one is let through, so a fast kick roll
   * does not stutter the bass.
   * @param {number} time the kick's time on the audio clock
   */
  duck(time) {
    const { amount, release } = this.fx.sidechain;
    if (amount <= 0) {
      return;
    }
    const floor = Math.max(DUCK_FLOOR, 1 - amount / 100);
    const end = time + DUCK_ATTACK_SECONDS + duckReleaseSeconds(release, this.bpm);
    for (const strip of this.strips.values()) {
      if (!strip.ducks || time < strip.duckUntil) {
        continue;
      }
      const gain = strip.duck.gain;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(1, time);
      gain.linearRampToValueAtTime(floor, time + DUCK_ATTACK_SECONDS);
      gain.exponentialRampToValueAtTime(1, end);
      strip.duckUntil = end;
    }
  }

  /** Lets every strip duck again from now on, for a fresh start of playback. */
  resetDucking() {
    for (const strip of this.strips.values()) {
      strip.duckUntil = 0;
    }
  }

  /** @private */
  applyFx() {
    const { reverb, delay } = this.fx;
    const shape = `${reverb.size}:${reverb.decay}`;
    // The impulse response is only made again when its shape changes: a level change costs nothing.
    if (shape !== this.reverbShape) {
      this.convolver.buffer = impulseResponse(this.context, reverb.size, reverb.decay);
      this.reverbShape = shape;
    }
    const time = Math.min(MAX_DELAY_SECONDS, delaySeconds(delay.division, this.bpm));
    this.glide(this.reverbReturn.gain, (reverb.level / 100) * 0.9);
    this.glide(this.delayLeft.delayTime, time);
    this.glide(this.delayRight.delayTime, time);
    this.glide(this.feedback.gain, delay.feedback / 100);
    // Tone 0 to 100: repeats from dark (800 Hz) to bright (12 kHz), on a curve that feels even to the ear.
    this.glide(this.loopTone.frequency, 800 * 15 ** (delay.tone / 100));
    this.glide(this.delayReturn.gain, (delay.level / 100) * 0.8);
  }

  /**
   * @private
   * @param {string} instrument
   * @returns {Strip}
   */
  createStrip(instrument) {
    const { context } = this;
    const input = gainNode(context);
    const duck = gainNode(context);
    const panner = context.createStereoPanner();
    const reverbSend = gainNode(context, 0);
    const delaySend = gainNode(context, 0);
    input.connect(duck).connect(panner);
    panner.connect(isDrum(instrument) ? this.drums : this.master);
    // Sends are taken after the duck and the pan, so the tails pump with the track and sit on its side.
    panner.connect(reverbSend).connect(this.reverbIn);
    panner.connect(delaySend).connect(this.delayIn);
    return { input, duck, panner, reverbSend, delaySend, instrument, ducks: false, duckUntil: 0 };
  }

  /**
   * @private
   * @param {Strip} strip
   * @param {import('../../shared/types.js').TrackMix} mix
   */
  setMix(strip, mix) {
    strip.ducks = mix.duck;
    this.glide(strip.panner.pan, mix.pan / 100);
    this.glide(strip.reverbSend.gain, mix.reverb / 100);
    this.glide(strip.delaySend.gain, mix.delay / 100);
  }

  /**
   * @private
   * @param {Strip} strip
   */
  release(strip) {
    for (const node of [strip.input, strip.duck, strip.panner, strip.reverbSend, strip.delaySend]) {
      node.disconnect();
    }
  }

  /**
   * @private
   * @param {AudioParam} param
   * @param {number} value
   */
  glide(param, value) {
    param.setTargetAtTime(value, this.context.currentTime, GLIDE_SECONDS);
  }
}
