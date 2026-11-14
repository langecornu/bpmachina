// The AudioWorklet processor behind every Faust synth track: one per track (per instrument while there is no mixer),
// running a pool of voices of one compiled instrument and taking its notes as timed messages from the main thread
// (src/audio/faustSynths.js). The voice's module arrives compiled, in the node's options; this file is bundled with
// what it imports and served from this site (see faustSynths.js), and only registers itself where the worklet's globals
// exist, so the tests import it freely.
/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentFrame */
import { FaustVoice } from './faustVoice.js';
import { DSP_LAYOUTS } from './generated/layout.js';
import { SYNTH_PROCESSOR, SynthCore } from './synthCore.js';

/**
 * Builds the core for a node: the instrument's voices, each its own instance of the compiled module.
 * @param {{ instrument: string, module: WebAssembly.Module, polyphony: number }} options the node's processorOptions
 * @param {number} rate
 * @returns {SynthCore}
 */
export function createCore({ instrument, module, polyphony }, rate) {
  const layout = DSP_LAYOUTS[instrument];
  if (!layout) {
    throw new Error(`no Faust voice for ${instrument}`);
  }
  const voices = Array.from({ length: polyphony }, () => new FaustVoice(module, layout, rate));
  return new SynthCore(voices, rate);
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class SynthProcessor extends AudioWorkletProcessor {
    /** @param {{ processorOptions: { instrument: string, module: WebAssembly.Module, polyphony: number } }} options */
    constructor(options) {
      super();
      this.core = createCore(options.processorOptions, sampleRate);
      this.port.onmessage = (/** @type {MessageEvent} */ event) => this.core.receive(event.data);
      // Notes go to this synth only from now on; until then they play on the built-in voices.
      this.port.postMessage({ type: 'ready' });
    }

    /** @param {Float32Array[][]} _inputs @param {Float32Array[][]} outputs */
    process(_inputs, outputs) {
      const [left, right] = outputs[0];
      this.core.render(currentFrame, left, right ?? left);
      // Kept alive while the page lives: the track may play again, and a silent pool costs next to nothing.
      return true;
    }
  }
  registerProcessor(SYNTH_PROCESSOR, SynthProcessor);
}
