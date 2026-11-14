// One voice of a synth written in Faust: an instance of the voice's compiled WebAssembly module, with its own memory,
// its controls set by name and its sound computed a few samples at a time. Faust's output is a module that exports its
// state's memory and a handful of functions (init, setParamValue, compute); where each control lives in that memory is
// recorded by scripts/build-dsp.js in generated/layout.js. Runs on the audio thread (synthProcessor.js) and in Node
// for the tests and the CPU measurement, so it uses nothing but WebAssembly.

/** The most samples computed at once: one render quantum of Web Audio. */
export const MAX_FRAMES = 128;

const BYTES_PER_SAMPLE = 4;
const PAGE_BYTES = 65536;

/** Maths a voice may ask its host for, which WebAssembly lacks, beyond the ones Math has under the same name. */
const EXTRA_MATHS = {
  fmod: (/** @type {number} */ x, /** @type {number} */ y) => x % y,
  remainder: (/** @type {number} */ x, /** @type {number} */ y) => x - Math.round(x / y) * y,
  rint: Math.round,
};

/**
 * @typedef {{ size: number, outputs: number, imports: string[], params: Record<string, number> }} Layout
 * @typedef {{ init: (dsp: number, rate: number) => void, setParamValue: (dsp: number, offset: number, value: number) =>
 *   void, compute: (dsp: number, frames: number, inputs: number, outputs: number) => void, memory: WebAssembly.Memory }}
 *   VoiceExports
 */

/**
 * The functions a compiled voice imports: `_tanhf` is Math.tanh, and so on.
 * @param {string[]} names as the module lists them
 * @returns {{ env: Record<string, Function> }}
 */
export function mathsFor(names) {
  /** @type {Record<string, Function>} */
  const env = {};
  for (const name of names) {
    const plain = name.replace(/^_/, '').replace(/f$/, '');
    const fn =
      /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (Math))[plain] ??
      EXTRA_MATHS[/** @type {'fmod'} */ (plain)];
    if (typeof fn !== 'function') {
      throw new Error(`a Faust voice needs ${name}, which this host does not provide`);
    }
    env[name] = fn;
  }
  return { env };
}

export class FaustVoice {
  /**
   * @param {WebAssembly.Module} module a compiled voice
   * @param {Layout} layout its entry in generated/layout.js
   * @param {number} sampleRate
   */
  constructor(module, layout, sampleRate) {
    const instance = new WebAssembly.Instance(module, mathsFor(layout.imports));
    this.exports = /** @type {VoiceExports} */ (/** @type {unknown} */ (instance.exports));
    this.params = layout.params;
    // After the voice's own state: a table of pointers to its output channels, then the channels themselves.
    const pointers = Math.ceil(layout.size / 16) * 16;
    const firstChannel = pointers + 16 * Math.ceil((layout.outputs * 4) / 16);
    const needed = firstChannel + layout.outputs * MAX_FRAMES * BYTES_PER_SAMPLE;
    const memory = this.exports.memory;
    if (memory.buffer.byteLength < needed) {
      memory.grow(Math.ceil((needed - memory.buffer.byteLength) / PAGE_BYTES));
    }
    const table = new Int32Array(memory.buffer, pointers, layout.outputs);
    /** @type {Float32Array[]} */
    this.channels = [];
    for (let channel = 0; channel < layout.outputs; channel += 1) {
      const start = firstChannel + channel * MAX_FRAMES * BYTES_PER_SAMPLE;
      table[channel] = start;
      this.channels.push(new Float32Array(memory.buffer, start, MAX_FRAMES));
    }
    this.outputs = pointers;
    this.exports.init(0, sampleRate);
  }

  /**
   * Sets a control; one the voice does not have is ignored, so every voice takes the same note message.
   * @param {string} name
   * @param {number} value
   */
  set(name, value) {
    const offset = this.params[name];
    if (offset !== undefined) {
      this.exports.setParamValue(0, offset, value);
    }
  }

  /**
   * Computes `frames` samples and adds them into the outputs from `offset` on. Every voice is stereo (the build checks).
   * @param {Float32Array} left
   * @param {Float32Array} right
   * @param {number} offset
   * @param {number} frames at most MAX_FRAMES
   */
  addTo(left, right, offset, frames) {
    this.exports.compute(0, frames, 0, this.outputs);
    const [first, second] = this.channels;
    for (let index = 0; index < frames; index += 1) {
      left[offset + index] += first[index];
      right[offset + index] += second[index];
    }
  }
}
