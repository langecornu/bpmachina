// A stand-in for the Web Audio API, enough for the engine's master chain: jsdom has no audio. Time only moves when a
// test moves it.

export class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'suspended';
    this.destination = { connect: () => {} };
    this.resumed = 0;
  }

  resume() {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  createGain() {
    return { gain: { value: 1, setTargetAtTime: (value) => (this.lastGain = value) }, connect: (node) => node };
  }

  createDynamicsCompressor() {
    const param = () => ({ value: 0 });
    return {
      threshold: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect: (node) => node,
    };
  }
}

/** performance.now() in tests: always this many milliseconds ahead of the mock audio clock. */
export const PERFORMANCE_OFFSET_MS = 5000;

/**
 * An engine wired to the mock context, a manual timer, and a list of the notes it would play on the synth. Its
 * performance.now() follows the audio clock, so MIDI timestamps are exact.
 */
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
    now: () => PERFORMANCE_OFFSET_MS + context.currentTime * 1000,
  });
  return { engine, context, played, timers };
}
