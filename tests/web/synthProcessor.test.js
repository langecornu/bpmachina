// Tests for the AudioWorklet processor's glue, with the worklet's globals stubbed: it builds its voices from the module
// it is given, says when it is ready, queues the notes it is sent, and fills its two output channels every quantum.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_FRAMES } from '../../src/audio/faust/faustVoice.js';
import { controlsOf } from '../../src/audio/faust/noteParams.js';

const module = new WebAssembly.Module(readFileSync(path.resolve('src/audio/faust/generated/lead.wasm')));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('synth processor', () => {
  it('builds a core with the asked number of voices, and refuses an instrument it has no voice for', async () => {
    const { createCore } = await import('../../src/audio/faust/synthProcessor.js');
    expect(createCore({ instrument: 'lead', module, polyphony: 4 }, 48000).slots).toHaveLength(4);
    expect(() => createCore({ instrument: 'kick', module, polyphony: 1 }, 48000)).toThrow(/kick/);
  });

  it('registers itself on the audio thread, says it is ready, and plays the notes it is sent', async () => {
    const registered = {};
    class MockProcessor {
      constructor() {
        this.port = { posted: [], onmessage: null, postMessage: (message) => this.port.posted.push(message) };
      }
    }
    vi.stubGlobal('AudioWorkletProcessor', MockProcessor);
    vi.stubGlobal('registerProcessor', (name, processor) => (registered[name] = processor));
    vi.stubGlobal('sampleRate', 48000);
    vi.stubGlobal('currentFrame', 0);
    await import('../../src/audio/faust/synthProcessor.js');
    const Processor = registered['bpm-faust-synth'];
    const processor = new Processor({ processorOptions: { instrument: 'lead', module, polyphony: 2 } });
    expect(processor.port.posted).toEqual([{ type: 'ready' }]);
    const { params, tail } = controlsOf('lead', { time: 0, duration: 1, pitch: 72, gain: 1 });
    processor.port.onmessage({ data: { type: 'on', id: 1, time: 0, params, tail } });
    const outputs = [[new Float32Array(MAX_FRAMES), new Float32Array(MAX_FRAMES)]];
    expect(processor.process([], outputs)).toBe(true);
    expect(outputs[0][0].some((sample) => sample !== 0)).toBe(true);
    expect(outputs[0][1].some((sample) => sample !== 0)).toBe(true);
  });
});
