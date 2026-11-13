// A stand-in for the Web Audio API, enough for the engine's mixer and master chain: jsdom has no audio. Parameters
// record their automation, so the sidechain's exact times are checked. Time only moves when a test moves it.

/**
 * An audio parameter that records its automation as [kind, value, time] entries.
 * @param {MockAudioContext} context
 * @param {number} [value]
 * @param {boolean} [isGain] whether a glide is reported as the context's last gain
 */
function param(context, value = 0, isGain = false) {
  const events = [];
  return {
    value,
    events,
    setValueAtTime: (target, time) => events.push(['set', target, time]),
    linearRampToValueAtTime: (target, time) => events.push(['linear', target, time]),
    exponentialRampToValueAtTime: (target, time) => events.push(['exponential', target, time]),
    cancelScheduledValues: (time) => events.push(['cancel', null, time]),
    setTargetAtTime: (target, time) => {
      events.push(['target', target, time]);
      if (isGain) {
        context.lastGain = target;
      }
    },
  };
}

export class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = 'suspended';
    this.destination = { connect: () => {} };
    this.resumed = 0;
    this.nodes = [];
  }

  resume() {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  node(kind, extra = {}) {
    const node = {
      kind,
      ...extra,
      outputs: [],
      disconnected: false,
      connect: (target) => {
        node.outputs.push(target);
        return target;
      },
      disconnect: () => {
        node.disconnected = true;
      },
    };
    this.nodes.push(node);
    return node;
  }

  createGain() {
    return this.node('gain', { gain: param(this, 1, true) });
  }

  createDynamicsCompressor() {
    return this.node('compressor', {
      threshold: param(this),
      knee: param(this),
      ratio: param(this),
      attack: param(this),
      release: param(this),
    });
  }

  createBiquadFilter() {
    return this.node('filter', { type: 'lowpass', frequency: param(this, 350), Q: param(this, 1), gain: param(this) });
  }

  createWaveShaper() {
    return this.node('shaper', { curve: null, oversample: 'none' });
  }

  createStereoPanner() {
    return this.node('panner', { pan: param(this) });
  }

  createConvolver() {
    return this.node('convolver', { buffer: null });
  }

  createDelay() {
    return this.node('delay', { delayTime: param(this) });
  }

  createChannelMerger() {
    return this.node('merger');
  }

  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, numberOfChannels: channels, getChannelData: (channel) => data[channel] };
  }
}

/** An engine wired to the mock context, a manual timer, and a list of the notes it would play. */
export async function createMockEngine() {
  const { AudioEngine } = await import('../../src/audio/engine.js');
  const context = new MockAudioContext();
  const played = [];
  const timers = { tick: null, cleared: 0 };
  const engine = new AudioEngine({
    createContext: () => /** @type {any} */ (context),
    setTimer: (tick) => {
      timers.tick = tick;
      return 1;
    },
    clearTimer: () => {
      timers.cleared += 1;
    },
    play: (note) => played.push(note),
  });
  return { engine, context, played, timers };
}
