// The sound engine: one audio context, a master volume and a limiter, and a look-ahead scheduler. A timer wakes every
// 25 ms and schedules the notes of the next 120 ms at exact times on the audio clock, so timing stays tight even when
// the page is busy. The song can change while it plays (a note drawn on the grid is heard on the next loop) without
// losing the place. A track sent to a MIDI output is played by the MIDI sink instead, on the same schedule with its
// times converted to performance.now() time, and falls back to the synth while its device is not connected. The
// clock, timer, context and sinks are injected so the scheduling is tested without audio or MIDI.
import { stepSeconds } from '../../shared/music.js';
import { buildPlayback, midiNoteFor } from '../utils/playback.js';
import { MidiSink } from './midiOut.js';
import { playNote } from './voices.js';

const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 25;
/** Room before the first note, so it is never scheduled in the past. */
const START_DELAY_SECONDS = 0.06;
const PREVIEW_DELAY_SECONDS = 0.01;
const PREVIEW_SECONDS = 0.25;

/**
 * @typedef {{ mode: 'song' | 'pattern', patternId?: string | null, soloTrackId?: string | null }} PlayOptions
 * @typedef {(note: { instrument: string, time: number, duration: number, pitch: number, gain: number }) => void} NoteSink
 */

export class AudioEngine {
  /**
   * @param {{
   *   createContext?: () => AudioContext,
   *   setTimer?: (tick: () => void, ms: number) => unknown,
   *   clearTimer?: (timer: any) => void,
   *   play?: NoteSink,
   *   now?: () => number,
   * }} [options] `play` replaces the synth voices, for tests; `now` is performance.now(), the clock MIDI is timed on
   */
  constructor({
    createContext = () => new AudioContext({ latencyHint: 'interactive' }),
    setTimer = (tick, ms) => setInterval(tick, ms),
    clearTimer = (timer) => clearInterval(timer),
    play,
    now = () => performance.now(),
  } = {}) {
    this.createContext = createContext;
    this.now = now;
    this.midi = new MidiSink();
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.customPlay = play ?? null;
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {GainNode | null} */
    this.master = null;
    this.masterLevel = 0.8;
    /** @type {import('../../shared/types.js').Song | null} */
    this.song = null;
    /** @type {PlayOptions} */
    this.options = { mode: 'song' };
    /** @type {import('../utils/playback.js').Playback | null} */
    this.playback = null;
    this.timer = null;
    this.nextStep = 0;
    this.nextTime = 0;
    /** @type {{ step: number, time: number }[]} steps scheduled but not yet heard, for the position display */
    this.queue = [];
    this.lastHeardStep = 0;
  }

  /** Creates the audio context on first use: browsers only allow it after the person clicks or presses a key. */
  ensureContext() {
    if (!this.context) {
      this.context = this.createContext();
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.master = this.context.createGain();
      this.master.gain.value = this.masterLevel;
      this.master.connect(limiter).connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch((error) => console.warn('[audio] could not resume', error));
    }
    return this.context;
  }

  /**
   * The MIDI outputs tracks can play through, once the person has turned MIDI on; null while it is off.
   * @param {import('./midiOut.js').MidiAccessLike | null} access
   */
  setMidiAccess(access) {
    if (this.midi.access && this.midi.access !== access) {
      // Release what the old access is sounding while it can still be reached.
      this.midi.stop(this.now());
    }
    this.midi.setAccess(access);
  }

  /** @param {string | null} deviceName where MIDI clock goes, or null for no clock */
  setClockOutput(deviceName) {
    this.midi.setClockDevice(deviceName);
  }

  /**
   * Milliseconds to add to an audio-clock time, in milliseconds, to get its performance.now() time. Taken from the
   * moment being heard now when the browser reports it, so MIDI lines up with the synth's output latency.
   * @param {AudioContext} context
   * @returns {number}
   */
  midiOffset(context) {
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.performanceTime && stamp.contextTime !== undefined) {
      return stamp.performanceTime - stamp.contextTime * 1000;
    }
    return this.now() - context.currentTime * 1000;
  }

  get isPlaying() {
    return this.timer !== null;
  }

  /** @param {number} level 0 to 1 */
  setMasterVolume(level) {
    this.masterLevel = level;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(level, this.context.currentTime, 0.02);
    }
  }

  /**
   * Updates what plays without stopping: the next scheduled step keeps its place within the new layout.
   * @param {import('../../shared/types.js').Song} song
   */
  setSong(song) {
    this.song = song;
    if (this.isPlaying) {
      this.playback = buildPlayback(song, this.options);
      if (this.playback.totalSteps > 0) {
        this.nextStep %= this.playback.totalSteps;
      }
    }
  }

  /**
   * @param {import('../../shared/types.js').Song} song
   * @param {PlayOptions} options
   * @param {number} [fromStep]
   * @returns {boolean} false when there is nothing to play
   */
  start(song, options, fromStep = 0) {
    this.stop();
    this.song = song;
    this.options = options;
    this.playback = buildPlayback(song, options);
    if (this.playback.totalSteps === 0) {
      return false;
    }
    const context = this.ensureContext();
    this.nextStep = fromStep % this.playback.totalSteps;
    this.lastHeardStep = this.nextStep;
    this.nextTime = context.currentTime + START_DELAY_SECONDS;
    this.queue = [];
    this.midi.startClock(this.nextTime * 1000 + this.midiOffset(context), this.nextStep);
    this.tick();
    this.timer = this.setTimer(() => this.tick(), TICK_MS);
    return true;
  }

  stop() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
      this.midi.stop(this.now());
    }
    this.queue = [];
  }

  /** Schedules every step that starts before the look-ahead window ends. */
  tick() {
    if (!this.context || !this.playback || !this.song) {
      return;
    }
    const seconds = stepSeconds(this.song.bpm);
    const horizon = this.context.currentTime + LOOKAHEAD_SECONDS;
    const offset = this.midiOffset(this.context);
    while (this.nextTime < horizon) {
      const stepAt = this.nextTime * 1000 + offset;
      this.midi.releaseDue(stepAt);
      this.midi.clockStep(stepAt, seconds * 1000);
      for (const event of this.playback.eventsAt(this.nextStep)) {
        const endAt = stepAt + event.lengthSteps * seconds * 1000;
        if (event.midi && this.midi.noteOn(event.midi, stepAt, endAt)) {
          continue;
        }
        this.sound({
          instrument: event.instrument,
          time: this.nextTime,
          duration: event.lengthSteps * seconds,
          pitch: event.pitch,
          gain: event.gain,
        });
      }
      this.queue.push({ step: this.nextStep, time: this.nextTime });
      this.nextStep = (this.nextStep + 1) % this.playback.totalSteps;
      this.nextTime += seconds;
    }
  }

  /** @type {NoteSink} */
  sound(note) {
    if (this.customPlay) {
      this.customPlay(note);
      return;
    }
    if (this.context && this.master) {
      playNote(this.context, this.master, note.instrument, note);
    }
  }

  /** @returns {number} the step being heard now */
  heardStep() {
    if (this.context) {
      const now = this.context.currentTime;
      while (this.queue.length > 0 && this.queue[0].time <= now) {
        this.lastHeardStep = /** @type {{ step: number }} */ (this.queue.shift()).step;
      }
    }
    return this.lastHeardStep;
  }

  /**
   * Plays one note now, so drawing on the grid is heard, where the track sounds.
   * @param {Pick<import('../../shared/types.js').Track, 'instrument' | 'output'>} track
   * @param {number} pitch
   * @param {number} [velocity]
   */
  preview(track, pitch, velocity = 90) {
    const context = this.ensureContext();
    const time = context.currentTime + PREVIEW_DELAY_SECONDS;
    const midi = midiNoteFor(track, { pitch, velocity });
    if (midi) {
      const at = time * 1000 + this.midiOffset(context);
      if (this.midi.preview(midi, at, at + PREVIEW_SECONDS * 1000)) {
        return;
      }
    }
    this.sound({ instrument: track.instrument, time, duration: PREVIEW_SECONDS, pitch, gain: velocity / 127 });
  }
}
