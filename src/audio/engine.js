// The sound engine: one audio context, the mixer (src/audio/mixer.js), a master volume and a limiter, and a look-ahead
// scheduler. A timer wakes every
// 25 ms and schedules the notes of the next 120 ms at exact times on the audio clock, so timing stays tight even when
// the page is busy. The song can change while it plays (a note drawn on the grid is heard on the next loop) without
// losing the place. Each kick it schedules also ducks the tracks set to duck, at the kick's exact time. The clock, timer
// and context are injected so the scheduling is tested without audio.
import { stepSeconds } from '../../shared/music.js';
import { buildPlayback } from '../utils/playback.js';
import { Mixer } from './mixer.js';
import { playNote } from './voices.js';

const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 25;
/** Room before the first note, so it is never scheduled in the past. */
const START_DELAY_SECONDS = 0.06;

/**
 * @typedef {{ mode: 'song' | 'pattern', patternId?: string | null, soloTrackId?: string | null }} PlayOptions
 * @typedef {(note: { trackId?: string | null, instrument: string, time: number, duration: number, pitch: number,
 *   gain: number }) => void} NoteSink
 */

export class AudioEngine {
  /**
   * @param {{
   *   createContext?: () => AudioContext,
   *   setTimer?: (tick: () => void, ms: number) => unknown,
   *   clearTimer?: (timer: any) => void,
   *   play?: NoteSink,
   * }} [options] `play` replaces the synth voices, for tests
   */
  constructor({
    createContext = () => new AudioContext({ latencyHint: 'interactive' }),
    setTimer = (tick, ms) => setInterval(tick, ms),
    clearTimer = (timer) => clearInterval(timer),
    play,
  } = {}) {
    this.createContext = createContext;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.customPlay = play ?? null;
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {GainNode | null} */
    this.master = null;
    /** @type {Mixer | null} */
    this.mixer = null;
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
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      this.master = this.context.createGain();
      this.master.gain.value = this.masterLevel;
      this.master.connect(limiter).connect(this.context.destination);
      this.mixer = new Mixer(this.context, this.master);
      if (this.song) {
        this.mixer.sync(this.song);
      }
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch((error) => console.warn('[audio] could not resume', error));
    }
    return this.context;
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
    this.mixer?.sync(song);
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
    this.mixer?.sync(song);
    this.mixer?.resetDucking();
    this.nextStep = fromStep % this.playback.totalSteps;
    this.lastHeardStep = this.nextStep;
    this.nextTime = context.currentTime + START_DELAY_SECONDS;
    this.queue = [];
    this.tick();
    this.timer = this.setTimer(() => this.tick(), TICK_MS);
    return true;
  }

  stop() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
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
    while (this.nextTime < horizon) {
      for (const event of this.playback.eventsAt(this.nextStep)) {
        if (event.instrument === 'kick') {
          this.mixer?.duck(this.nextTime);
        }
        this.sound({
          trackId: event.trackId,
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
    if (this.context && this.mixer) {
      playNote(this.context, this.mixer.input(note.trackId, note.instrument), note.instrument, note);
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
   * Plays one note now, so drawing on the grid is heard.
   * @param {string} instrument
   * @param {number} pitch
   * @param {number} [gain]
   * @param {string | null} [trackId] the track it is heard through, with its pan and sends
   */
  preview(instrument, pitch, gain = 0.7, trackId = null) {
    const context = this.ensureContext();
    this.sound({ trackId, instrument, time: context.currentTime + 0.01, duration: 0.25, pitch, gain });
  }
}
