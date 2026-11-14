// A stand-in for Web MIDI: outputs that record every message with its timestamp, and an access object that can plug
// outputs in and out. jsdom has no MIDI, and no test needs real gear.

export class MockMidiOutput {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
    this.state = 'connected';
    /** @type {{ data: number[], timestamp: number | undefined }[]} */
    this.sent = [];
  }

  /**
   * @param {number[]} data
   * @param {number} [timestamp]
   */
  send(data, timestamp) {
    this.sent.push({ data: [...data], timestamp });
  }

  /** @returns {number[][]} the bytes sent, without the times */
  messages() {
    return this.sent.map((message) => message.data);
  }
}

export class MockMidiAccess {
  /** @param {string[]} names */
  constructor(names = []) {
    /** @type {Map<string, MockMidiOutput>} */
    this.outputs = new Map(names.map((name, index) => [`out-${index}`, new MockMidiOutput(name)]));
    this.inputs = new Map();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
  }

  /** @param {string} name */
  output(name) {
    return [...this.outputs.values()].find((output) => output.name === name);
  }

  addEventListener(type, listener) {
    if (type === 'statechange') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type, listener) {
    if (type === 'statechange') {
      this.listeners.delete(listener);
    }
  }

  /** @param {string} name plugs in an output and tells the listeners */
  plugIn(name) {
    this.outputs.set(`out-${this.outputs.size}`, new MockMidiOutput(name));
    this.listeners.forEach((listener) => listener());
  }

  /** @param {string} name unplugs an output: the browser keeps it listed as disconnected */
  unplug(name) {
    this.output(name).state = 'disconnected';
    this.listeners.forEach((listener) => listener());
  }
}

/**
 * Gives the browser a `navigator.requestMIDIAccess`.
 * @param {(options: any) => Promise<any>} implementation
 */
export function setRequestMidiAccess(implementation) {
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: implementation, configurable: true, writable: true });
}

/** Takes Web MIDI away again, as in Safari. */
export function removeRequestMidiAccess() {
  delete navigator.requestMIDIAccess;
}
