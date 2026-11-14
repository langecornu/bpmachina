// The heart of a track's synth on the audio thread: a pool of voices and a queue of note events, each stamped with its
// time on the audio clock. Every render quantum is cut at the exact sample an event falls on, so a note starts, ends or
// glides precisely where the look-ahead scheduler put it, not at the next 128-sample boundary. A new note takes a silent
// voice, else the one that has been fading longest, else the oldest. Voices that are silent are not computed at all,
// which is what keeps a dense song light. Pure: the voices are injected, so it is tested without audio or WebAssembly.

/** The name the processor registers under (see synthProcessor.js). */
export const SYNTH_PROCESSOR = 'bpm-faust-synth';

/**
 * @typedef {{ set: (name: string, value: number) => void,
 *   addTo: (left: Float32Array, right: Float32Array, offset: number, frames: number) => void }} Voice
 * @typedef {{ type: 'on', id: number, time: number, params: Record<string, number>, tail: number }
 *   | { type: 'off', id: number, time: number }
 *   | { type: 'set', id: number, time: number, params: Record<string, number> }} NoteEvent `time` in seconds on the
 *   audio clock. `on` starts note `id` with its controls; `tail`: seconds it still sounds after its `off`. `set`
 *   changes a sounding note's controls (a slide's new pitch) without a new attack.
 * @typedef {{ voice: Voice, id: number, isGated: boolean, silentAt: number, startedAt: number, count: number,
 *   tail: number }} Slot `silentAt`: the frame from which the voice is quiet (Infinity while held)
 */

export class SynthCore {
  /**
   * @param {Voice[]} voices
   * @param {number} sampleRate
   */
  constructor(voices, sampleRate) {
    this.sampleRate = sampleRate;
    /** @type {Slot[]} */
    this.slots = voices.map((voice) => ({
      voice,
      id: -1,
      isGated: false,
      silentAt: 0,
      startedAt: -1,
      count: 0,
      tail: 0,
    }));
    /** @type {(NoteEvent & { frame: number })[]} waiting, in order of time */
    this.queue = [];
    /** The frame after the last one rendered. */
    this.lastFrame = 0;
  }

  /**
   * Queues an event; one already due plays at the start of the next quantum.
   * @param {NoteEvent} event
   */
  receive(event) {
    const frame = Math.round(event.time * this.sampleRate);
    let index = this.queue.length;
    // Events nearly always arrive in order, so the search from the end is short.
    while (index > 0 && this.queue[index - 1].frame > frame) {
      index -= 1;
    }
    this.queue.splice(index, 0, { ...event, frame });
  }

  /** @returns {number} voices sounding now, for the tests and the CPU measurement */
  get activeVoices() {
    return this.slots.filter((slot) => slot.isGated || slot.silentAt > this.lastFrame).length;
  }

  /**
   * Fills one quantum of output.
   * @param {number} startFrame the frame of its first sample on the audio clock
   * @param {Float32Array} left
   * @param {Float32Array} right
   */
  render(startFrame, left, right) {
    left.fill(0);
    right.fill(0);
    const frames = left.length;
    let cursor = 0;
    while (cursor < frames) {
      const now = startFrame + cursor;
      while (this.queue.length > 0 && this.queue[0].frame <= now) {
        this.apply(/** @type {NoteEvent & { frame: number }} */ (this.queue.shift()), now);
      }
      const nextEvent = this.queue.length > 0 ? this.queue[0].frame - startFrame : frames;
      const end = Math.min(frames, nextEvent);
      for (const slot of this.slots) {
        if (slot.isGated || slot.silentAt > now) {
          slot.voice.addTo(left, right, cursor, end - cursor);
        }
      }
      cursor = end;
    }
    this.lastFrame = startFrame + frames;
  }

  /**
   * @param {NoteEvent} event
   * @param {number} frame when it takes effect
   */
  apply(event, frame) {
    if (event.type === 'on') {
      const slot = this.pick(frame);
      for (const [name, value] of Object.entries(event.params)) {
        slot.voice.set(name, value);
      }
      // A new count drops the gate for one sample inside the voice, so a voice still sounding attacks again.
      slot.count += 1;
      slot.voice.set('note', slot.count);
      slot.voice.set('gate', 1);
      Object.assign(slot, { id: event.id, isGated: true, silentAt: Infinity, startedAt: frame, tail: event.tail });
      return;
    }
    const slot = this.slots.find((candidate) => candidate.id === event.id && candidate.isGated);
    if (!slot) {
      return; // the note has ended, or its voice was taken by a newer one
    }
    if (event.type === 'set') {
      for (const [name, value] of Object.entries(event.params)) {
        slot.voice.set(name, value);
      }
      return;
    }
    slot.voice.set('gate', 0);
    slot.isGated = false;
    slot.silentAt = frame + Math.ceil(slot.tail * this.sampleRate);
  }

  /**
   * The voice for a new note: a silent one, else the one fading longest, else the oldest held.
   * @param {number} frame
   * @returns {Slot}
   */
  pick(frame) {
    let best = this.slots[0];
    let bestScore = Infinity;
    for (const slot of this.slots) {
      const score = slot.silentAt <= frame ? -Infinity : slot.isGated ? slot.startedAt : slot.silentAt - 1e12;
      if (score < bestScore) {
        best = slot;
        bestScore = score;
      }
    }
    return best;
  }
}
