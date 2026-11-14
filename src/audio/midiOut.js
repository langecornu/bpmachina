// MIDI out: the bytes BPMachina sends, and the sink that sends them to the outputs the browser lists. Notes and clock
// are sent ahead with a timestamp (performance.now() time), so the browser delivers them on time even though they are
// scheduled up to a look-ahead early, like the synth voices. A note's note-off is held back until the scheduler
// reaches its time, so stopping never leaves a stale note-off to cut a note played later. Outputs are found by name,
// because the browser's ids for them change between sessions.

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const ALL_NOTES_OFF = 123;
const SONG_POSITION = 0xf2;
export const CLOCK = 0xf8;
export const START = 0xfa;
export const CONTINUE = 0xfb;
export const STOP = 0xfc;
/** A note-off this close after a step counts as at the step: step times add up with rounding errors. */
const SAME_TIME_MS = 1;
/**
 * How long a sliding note's note-off waits after the next note-on: 303-style synths (TB-03, TD-3) and most monosynths
 * glide when a note starts before the one before it ends.
 */
export const LEGATO_MS = 5;
/** MIDI clock runs at 24 pulses a quarter note: 6 to each sixteenth step. */
export const PULSES_PER_STEP = 6;

/**
 * @param {number} channel 1 to 16
 * @param {number} pitch
 * @param {number} velocity 1 to 127
 * @returns {number[]}
 */
export const noteOn = (channel, pitch, velocity) => [NOTE_ON | (channel - 1), pitch, velocity];

/**
 * @param {number} channel 1 to 16
 * @param {number} pitch
 * @returns {number[]}
 */
export const noteOff = (channel, pitch) => [NOTE_OFF | (channel - 1), pitch, 0];

/**
 * @param {number} channel 1 to 16
 * @returns {number[]} controller 123, which every channel-voice instrument treats as "release every note"
 */
export const allNotesOff = (channel) => [CONTROL_CHANGE | (channel - 1), ALL_NOTES_OFF, 0];

/**
 * @param {number} step sixteenths from the start of the song, which is what MIDI counts the song position in
 * @returns {number[]}
 */
export const songPosition = (step) => [SONG_POSITION, step & 0x7f, (step >> 7) & 0x7f];

/**
 * @typedef {{ name?: string | null, state?: string, send: (data: number[], timestamp?: number) => void }} MidiOutputLike
 * @typedef {{ outputs: Map<string, MidiOutputLike> }} MidiAccessLike
 * @typedef {{ deviceName: string, channel: number, pitch: number, at: number, legato: boolean }} PendingOff
 *   `legato`: the note slides, so the track's next note starts before it ends
 */

export class MidiSink {
  constructor() {
    /** @type {MidiAccessLike | null} */
    this.access = null;
    /** @type {PendingOff[]} note-offs not yet sent, in no particular order */
    this.pendingOffs = [];
    /** @type {Map<string, Set<number>>} the channels each device was sent notes on since the last stop */
    this.usedChannels = new Map();
    /** @type {string | null} the output MIDI clock is sent to, by name */
    this.clockDevice = null;
    this.isClockRunning = false;
    /** the latest time anything was sent for, since the look-ahead sends ahead of now */
    this.lastSentAt = 0;
  }

  /** @param {MidiAccessLike | null} access */
  setAccess(access) {
    this.access = access;
  }

  /** @param {string | null} deviceName */
  setClockDevice(deviceName) {
    this.clockDevice = deviceName || null;
  }

  /**
   * @param {string | null} deviceName
   * @returns {MidiOutputLike | null} the connected output with that name
   */
  outputNamed(deviceName) {
    if (!this.access || !deviceName) {
      return null;
    }
    for (const output of this.access.outputs.values()) {
      if (output.name === deviceName && output.state !== 'disconnected') {
        return output;
      }
    }
    return null;
  }

  /**
   * @param {string} deviceName
   * @returns {boolean} true when a note sent there would be heard; when false, the caller plays it on the synth
   */
  has(deviceName) {
    return this.outputNamed(deviceName) !== null;
  }

  /**
   * Sends a note-on now (timestamped for later) and keeps its note-off until `releaseDue` reaches it. A note that slides
   * is released just after the next one starts, so the instrument glides; sliding into the same pitch is a tie, which
   * holds the note on instead of striking it again.
   * @param {import('../utils/playback.js').MidiNote} note
   * @param {number} start performance.now() time, in milliseconds
   * @param {number} end
   * @param {boolean} [slide]
   * @returns {boolean} false when the device is not connected
   */
  noteOn(note, start, end, slide = false) {
    const output = this.outputNamed(note.deviceName);
    if (!output) {
      return false;
    }
    const at = slide ? end + LEGATO_MS : end;
    const tie = this.pendingOffs.find(
      (off) =>
        off.legato && off.deviceName === note.deviceName && off.channel === note.channel && off.pitch === note.pitch,
    );
    if (tie) {
      tie.at = at;
      tie.legato = slide;
      return true;
    }
    output.send(noteOn(note.channel, note.pitch, note.velocity), start);
    this.lastSentAt = Math.max(this.lastSentAt, start);
    this.pendingOffs.push({ deviceName: note.deviceName, channel: note.channel, pitch: note.pitch, at, legato: slide });
    const channels = this.usedChannels.get(note.deviceName) ?? new Set();
    channels.add(note.channel);
    this.usedChannels.set(note.deviceName, channels);
    return true;
  }

  /**
   * One note on its own, on and off, for hearing a note as it is drawn.
   * @param {import('../utils/playback.js').MidiNote} note
   * @param {number} start
   * @param {number} end
   * @returns {boolean} false when the device is not connected
   */
  preview(note, start, end) {
    const output = this.outputNamed(note.deviceName);
    if (!output) {
      return false;
    }
    output.send(noteOn(note.channel, note.pitch, note.velocity), start);
    output.send(noteOff(note.channel, note.pitch), end);
    return true;
  }

  /**
   * Sends every held note-off due by `until`. The scheduler calls this before the note-ons of a step, so a note that
   * ends where the next one starts is released first and the next one is not cut.
   * @param {number} until performance.now() time, in milliseconds
   */
  releaseDue(until) {
    const due = this.pendingOffs.filter((off) => off.at <= until + SAME_TIME_MS);
    if (due.length === 0) {
      return;
    }
    this.pendingOffs = this.pendingOffs.filter((off) => off.at > until + SAME_TIME_MS);
    for (const off of due.sort((a, b) => a.at - b.at)) {
      this.outputNamed(off.deviceName)?.send(noteOff(off.channel, off.pitch), Math.min(off.at, until));
    }
  }

  /**
   * Starts the clock on the clock output: start (or, past the top, the song position then continue).
   * @param {number} at performance.now() time of the first step
   * @param {number} fromStep
   */
  startClock(at, fromStep) {
    const output = this.outputNamed(this.clockDevice);
    if (!output) {
      return;
    }
    if (fromStep > 0) {
      output.send(songPosition(fromStep), at);
      output.send([CONTINUE], at);
    } else {
      output.send([START], at);
    }
    this.isClockRunning = true;
  }

  /**
   * The clock pulses of one sixteenth step.
   * @param {number} at performance.now() time the step starts
   * @param {number} stepMs
   */
  clockStep(at, stepMs) {
    const output = this.isClockRunning ? this.outputNamed(this.clockDevice) : null;
    if (!output) {
      return;
    }
    for (let pulse = 0; pulse < PULSES_PER_STEP; pulse += 1) {
      output.send([CLOCK], at + (pulse * stepMs) / PULSES_PER_STEP);
    }
    this.lastSentAt = Math.max(this.lastSentAt, at + ((PULSES_PER_STEP - 1) * stepMs) / PULSES_PER_STEP);
  }

  /**
   * Silences everything: the held note-offs, all-notes-off on every channel used, and the clock's stop. They are sent
   * for now, or for just after the last note or pulse already sent ahead, so nothing already on its way sounds after.
   * @param {number} now performance.now() time
   */
  stop(now) {
    const at = Math.max(now, this.lastSentAt);
    this.lastSentAt = 0;
    const held = this.pendingOffs;
    this.pendingOffs = [];
    for (const off of held) {
      this.outputNamed(off.deviceName)?.send(noteOff(off.channel, off.pitch), at);
    }
    for (const [deviceName, channels] of this.usedChannels) {
      const output = this.outputNamed(deviceName);
      for (const channel of [...channels].sort((a, b) => a - b)) {
        output?.send(allNotesOff(channel), at);
      }
    }
    this.usedChannels.clear();
    if (this.isClockRunning) {
      this.outputNamed(this.clockDevice)?.send([STOP], at);
      this.isClockRunning = false;
    }
  }
}
