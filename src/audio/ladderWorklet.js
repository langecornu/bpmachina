// A resonant four-pole low-pass ladder filter, run on the browser's audio thread (an AudioWorklet) for the acid voice.
// Web Audio's own BiquadFilterNode is two-pole (12 dB per octave) and never quite squelches; a ladder of four one-pole
// stages with feedback from the last back to the first gives the 24 dB per octave slope and the singing, nearly
// self-oscillating resonance of a 303-style bassline. The stages are zero-delay-feedback (topology-preserving) one-poles,
// so the filter stays in tune and stable as the cutoff sweeps fast, and a soft clip at the input adds the ladder's grit.
// This file is served as it is (vite.config.js keeps it a real file: the content security policy only allows scripts
// from this site), so it imports nothing. The maths is exported so it is tested without audio.
/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentTime */

export const LADDER_PROCESSOR = 'ladder-filter';

/** Feedback at full resonance: just under 4, where a four-pole ladder starts to oscillate on its own. */
export const MAX_FEEDBACK = 3.9;
/** How much of the low end lost to resonance is given back, as on the hardware, where the bass thins but stays. */
const PASSBAND_MAKEUP = 0.5;

/**
 * @param {number} resonance 0 to 1
 * @returns {number} the feedback from the last stage to the first, 0 to MAX_FEEDBACK
 */
export function feedbackOf(resonance) {
  return Math.min(1, Math.max(0, resonance)) * MAX_FEEDBACK;
}

/**
 * The one-pole stages' coefficient for a cutoff, with the cutoff pre-warped so it lands where asked.
 * @param {number} cutoff Hz
 * @param {number} rate samples per second
 * @returns {number} G = g / (1 + g), with g = tan(π · cutoff / rate); between 0 and 1
 */
export function stageGain(cutoff, rate) {
  const safe = Math.min(Math.max(cutoff, 10), rate * 0.45);
  const warped = Math.tan((Math.PI * safe) / rate);
  return warped / (1 + warped);
}

/** The ladder's state and one sample of processing: four integrators and the feedback around them. */
export class LadderFilter {
  constructor() {
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.s4 = 0;
  }

  /**
   * @param {number} input one sample
   * @param {number} gain the stages' coefficient, from stageGain
   * @param {number} feedback from feedbackOf
   * @returns {number} the filtered sample
   */
  process(input, gain, feedback) {
    // Each stage is y = G·x + (1 − G)·s. Run the four in a row on the state alone to predict the last stage's output,
    // then solve the feedback loop for this very sample instead of using last sample's output (zero delay).
    const rest = 1 - gain;
    const gain2 = gain * gain;
    const gain4 = gain2 * gain2;
    const fromState = gain2 * gain * rest * this.s1 + gain2 * rest * this.s2 + gain * rest * this.s3 + rest * this.s4;
    const predicted = (gain4 * input + fromState) / (1 + feedback * gain4);
    // The soft clip: loud input and strong resonance saturate instead of running away.
    const driven = Math.tanh(input - feedback * predicted);
    let v = gain * (driven - this.s1);
    const y1 = v + this.s1;
    this.s1 = y1 + v;
    v = gain * (y1 - this.s2);
    const y2 = v + this.s2;
    this.s2 = y2 + v;
    v = gain * (y2 - this.s3);
    const y3 = v + this.s3;
    this.s3 = y3 + v;
    v = gain * (y3 - this.s4);
    const y4 = v + this.s4;
    this.s4 = y4 + v;
    return y4 * (1 + PASSBAND_MAKEUP * feedback);
  }

  /** @returns {boolean} true while the filter still rings */
  isRinging() {
    return Math.abs(this.s1) + Math.abs(this.s2) + Math.abs(this.s3) + Math.abs(this.s4) > 1e-5;
  }
}

/**
 * The processor's parameters: the cutoff, which the acid voice sweeps per sample; the resonance, set per note; and
 * `until`, the time on the audio clock the note needs the filter until (a note held by a slide moves it on).
 * @type {{ name: string, defaultValue: number, minValue: number, maxValue?: number, automationRate: string }[]}
 */
export const LADDER_PARAMETERS = [
  { name: 'cutoff', defaultValue: 1000, minValue: 10, maxValue: 20000, automationRate: 'a-rate' },
  { name: 'resonance', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'until', defaultValue: 0, minValue: 0, automationRate: 'k-rate' },
];

/**
 * Filters one block of samples. Returns false once the note no longer needs the filter and it has stopped ringing, so
 * the browser can drop the node: every note makes its own.
 * @param {LadderFilter} ladder
 * @param {Float32Array | undefined} input
 * @param {Float32Array} output
 * @param {Float32Array} cutoff one value, or one per sample
 * @param {number} resonance
 * @param {number} rate
 * @param {boolean} isNeeded false once the note has ended
 * @returns {boolean} true to keep running
 */
export function processBlock(ladder, input, output, cutoff, resonance, rate, isNeeded) {
  const feedback = feedbackOf(resonance);
  let lastCutoff = Number.NaN;
  let gain = 0;
  for (let index = 0; index < output.length; index += 1) {
    const frequency = cutoff.length > 1 ? cutoff[index] : cutoff[0];
    if (frequency !== lastCutoff) {
      lastCutoff = frequency;
      gain = stageGain(frequency, rate);
    }
    output[index] = ladder.process(input ? input[index] : 0, gain, feedback);
  }
  return isNeeded || ladder.isRinging();
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class LadderProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return LADDER_PARAMETERS;
    }

    constructor() {
      super();
      this.ladder = new LadderFilter();
    }

    /**
     * @param {Float32Array[][]} inputs
     * @param {Float32Array[][]} outputs
     * @param {Record<string, Float32Array>} parameters
     */
    process(inputs, outputs, parameters) {
      return processBlock(
        this.ladder,
        inputs[0]?.[0],
        outputs[0][0],
        parameters.cutoff,
        parameters.resonance[0],
        sampleRate,
        currentTime < parameters.until[0],
      );
    }
  }
  registerProcessor(LADDER_PROCESSOR, LadderProcessor);
}
