// The sound engine: one audio context, the mixer (src/audio/mixer.js), a master volume and a limiter, and a look-ahead
// scheduler. A timer wakes every
// 25 ms and schedules the notes of the next 120 ms at exact times on the audio clock, so timing stays tight even when
// the page is busy. The song can change while it plays (a note drawn on the grid is heard on the next loop) without
// losing the place. Each kick it schedules also ducks the tracks set to duck, at the kick's exact time (the mixer,
// src/audio/mixer.js). A note that slides is held open by its voice; the engine keeps the handle per track and hands it
// the track's next note to glide into, or ends it where it would have ended if that note never comes. The clock, timer
// and context are injected so the scheduling is tested without audio.
import { stepSeconds } from '../../shared/music.js';
import { buildPlayback } from '../utils/playback.js';
import { LADDER_PROCESSOR } from './ladderWorklet.js';
import { Mixer } from './mixer.js';
import { playNote, useLadderFilter } from './voices.js';

/** The ladder filter runs on the audio thread from its own file, served from this site (see vite.config.js). */
const LADDER_URL = new URL('./ladderWorklet.js', import.meta.url).href;

const LOOKAHEAD_SECONDS = 0.12;
const TICK_MS = 25;
/** Room before the first note, so it is never scheduled in the past. */
const START_DELAY_SECONDS = 0.06;

/**
 * @typedef {{ mode: 'song' | 'pattern', patternId?: string | null, soloTrackId?: string | null }} PlayOptions
 * @typedef {{ instrument: string, time: number, duration: number, pitch: number, gain: number, trackId?: string | null,
 *   accent?: boolean, slide?: boolean, tied?: boolean, sound?: import('../../shared/types.js').TrackSound }} EngineNote
 *   `slide`: held into the track's next note; `tied`: that next note, which glides on from the held one
 * @typedef {(note: EngineNote) => import('./voices.js').HeldVoice | void | unknown} NoteSink
 */

export class AudioEngine {
  /**
   * @param {{
   *   createContext?: () => AudioContext,
   *   setTimer?: (tick: () => void, ms: number) => unknown,
   *   clearTimer?: (timer: any) => void,
   *   play?: NoteSink,
   *   createLadder?: import('./voices.js').LadderFactory,
   * }} [options] `play` replaces the synth voices, for tests; `createLadder` makes the ladder filter node
   */
  constructor({
    createContext = () => new AudioContext({ latencyHint: 'interactive' }),
    setTimer = (tick, ms) => setInterval(tick, ms),
    clearTimer = (timer) => clearInterval(timer),
    play,
    createLadder = (context, options) => new AudioWorkletNode(context, LADDER_PROCESSOR, options),
  } = {}) {
    this.createContext = createContext;
    this.createLadder = createLadder;
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
    /** @type {Map<string, { voice: import('./voices.js').HeldVoice, end: number }>} notes held by a slide, by track */
    this.held = new Map();
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
      this.loadLadder(this.context);
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

  /**
   * Loads the ladder filter onto the audio thread. Until it is ready, or if it cannot load, the acid voice uses
   * built-in filters instead, so nothing waits for it.
   * @param {AudioContext} context
   */
  loadLadder(context) {
    if (!context.audioWorklet) {
      return;
    }
    context.audioWorklet
      .addModule(LADDER_URL)
      .then(() => useLadderFilter(context, this.createLadder))
      .catch((error) => console.warn('[audio] the ladder filter could not load; using the built-in filters', error));
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
    // A held note ends where its gate would have closed; nothing is left sounding.
    for (const held of this.held.values()) {
      held.voice.release(held.end);
    }
    this.held.clear();
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
          instrument: event.instrument,
          time: this.nextTime,
          duration: event.lengthSteps * seconds,
          pitch: event.pitch,
          gain: event.gain,
          trackId: event.trackId,
          accent: event.accent,
          slide: event.slide,
          tied: event.tied,
          sound: event.sound,
        });
      }
      this.releaseUnfinished(this.nextTime);
      this.queue.push({ step: this.nextStep, time: this.nextTime });
      this.nextStep = (this.nextStep + 1) % this.playback.totalSteps;
      this.nextTime += seconds;
    }
  }

  /**
   * Plays a note, or glides a held one into it.
   * @param {EngineNote} note
   */
  sound(note) {
    const held = note.tied && note.trackId ? this.held.get(note.trackId) : undefined;
    if (held && note.trackId) {
      held.voice.glide(note);
      if (note.slide) {
        held.end = note.time + note.duration;
      } else {
        this.held.delete(note.trackId);
      }
      return;
    }
    let voice;
    if (this.customPlay) {
      voice = this.customPlay(note);
    } else if (this.context && this.mixer) {
      voice = playNote(this.context, this.mixer.input(note.trackId, note.instrument), note.instrument, note);
    }
    if (note.slide && note.trackId && isHeldVoice(voice)) {
      this.held.set(note.trackId, { voice, end: note.time + note.duration });
    }
  }

  /**
   * Ends a held note whose next note did not come when it should have (the song changed under it), at the time its
   * gate would have closed.
   * @param {number} time the step just scheduled
   */
  releaseUnfinished(time) {
    for (const [trackId, held] of this.held) {
      if (held.end <= time + 1e-6) {
        held.voice.release(held.end);
        this.held.delete(trackId);
      }
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

/**
 * @param {unknown} voice
 * @returns {voice is import('./voices.js').HeldVoice}
 */
function isHeldVoice(voice) {
  return typeof voice === 'object' && voice !== null && 'glide' in voice && 'release' in voice;
}
