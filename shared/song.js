// The song document: limits, a new empty song, the starter song a first visit plays, and the song laid out in time
// (sections, bars and seconds). Pure, for browser and server.
import { instrumentOf } from './instruments.js';
import { BEATS_PER_BAR, STEPS_PER_BAR } from './music.js';

/** @typedef {import('./types.js').Song} Song */
/** @typedef {import('./types.js').Pattern} Pattern */
/** @typedef {import('./types.js').Section} Section */
/** @typedef {import('./types.js').Note} Note */

/** 2: notes may carry `accent` and `slide`, and tracks carry their `sound` knobs (server/services/songMigrations.js). */
export const SONG_SCHEMA_VERSION = 2;

/** Bounds on everything that grows, so a saved or generated song stays a sensible size. */
export const LIMITS = {
  tracks: 12,
  patterns: 32,
  sections: 64,
  barsPerPattern: 8,
  repeats: 16,
  notesPerPattern: 2048,
  nameLength: 60,
  cueLength: 400,
  briefLength: 2000,
};

/**
 * @param {() => string} makeId
 * @param {string} instrument
 * @param {string} [name]
 * @returns {import('./types.js').Track}
 */
export function createTrack(makeId, instrument, name = instrumentOf(instrument).name) {
  return { id: makeId(), name, instrument, volume: 80, muted: false, sound: {} };
}

/**
 * @param {() => string} makeId
 * @param {string} [name]
 * @param {number} [bars]
 * @returns {Pattern}
 */
export function createPattern(makeId, name = 'A', bars = 2) {
  return { id: makeId(), name, bars, notes: [] };
}

/**
 * A blank song with a basic band and one empty pattern, ready to draw in or to hand to the AI composer.
 * @param {() => string} makeId
 * @returns {Song}
 */
export function createEmptySong(makeId) {
  const pattern = createPattern(makeId);
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    name: 'Untitled song',
    bpm: 140,
    key: { root: 'E', scale: 'minor' },
    tracks: ['kick', 'clap', 'hat', 'bass', 'acid', 'pad'].map((instrument) => createTrack(makeId, instrument)),
    patterns: [pattern],
    sections: [{ id: makeId(), name: 'Loop', patternId: pattern.id, repeats: 1, cue: '' }],
    brief: '',
  };
}

/**
 * @param {string} trackId
 * @param {number[]} steps
 * @param {number} pitch
 * @param {number} [velocity]
 * @returns {Note[]}
 */
const hits = (trackId, steps, pitch, velocity = 110) =>
  steps.map((step) => ({ trackId, step, length: 1, pitch, velocity }));

/**
 * The song a first visit opens with: a psytrance roller in E minor, so pressing Play makes music in the app's home
 * genre straight away. Kick on every beat, the bass rolling on the three sixteenths after it, an acid hook that leans on
 * accents and slides, and a breakdown before the roll comes back.
 * @param {() => string} makeId
 * @returns {Song}
 */
export function createStarterSong(makeId) {
  const song = createEmptySong(makeId);
  const [kick, clap, hat, bass, acid, pad] = song.tracks.map((track) => track.id);
  const beats = [0, 4, 8, 12, 16, 20, 24, 28];
  const offbeats = beats.map((step) => step + 2);
  // The roll: E on the three sixteenths after each kick, turning to G and A on the last beat of the second bar.
  const roll = beats.flatMap((beat, index) => {
    const pitch = index === 7 ? 43 : 40;
    return [1, 2, 3].map((offset) => ({
      trackId: bass,
      step: beat + offset,
      length: 1,
      pitch: index === 7 && offset === 3 ? 45 : pitch,
      velocity: offset === 1 ? 92 : 112,
    }));
  });
  // The hook: [step, pitch, accent, slide]. Accents punch the filter open; a slide holds a note into the next one and
  // glides up or down to it, which is where an acid line gets its talking, rubbery feel.
  const hook = [
    [0, 52, true, false],
    [3, 55, false, false],
    [6, 52, false, true],
    [8, 59, true, false],
    [10, 57, false, false],
    [12, 52, false, true],
    [14, 64, true, false],
    [16, 52, true, false],
    [19, 55, false, false],
    [22, 52, false, true],
    [24, 62, true, false],
    [26, 59, false, true],
    [28, 57, false, true],
    [30, 55, false, false],
  ].map(([step, pitch, accent, slide]) => ({
    trackId: acid,
    step: Number(step),
    length: 2,
    pitch: Number(pitch),
    velocity: Number(step) % 8 === 0 ? 118 : 96,
    ...(accent ? { accent: true } : {}),
    ...(slide ? { slide: true } : {}),
  }));
  // E minor held across both bars.
  const chord = [52, 55, 59].map((pitch) => ({ trackId: pad, step: 0, length: 32, pitch, velocity: 72 }));
  const intro = {
    id: makeId(),
    name: 'Intro',
    bars: 2,
    notes: [...hits(kick, beats, 36), ...hits(hat, offbeats, 42, 82), ...chord],
  };
  const rollPattern = {
    id: makeId(),
    name: 'Roll',
    bars: 2,
    notes: [
      ...hits(kick, beats, 36, 120),
      ...hits(clap, [4, 12, 20, 28], 39, 100),
      ...hits(hat, offbeats, 42, 90),
      ...roll,
      ...hook,
    ],
  };
  const breakdown = { id: makeId(), name: 'Breakdown', bars: 2, notes: [...hook, ...chord] };
  return {
    ...song,
    name: 'Machina Awakens',
    bpm: 142,
    patterns: [intro, rollPattern, breakdown],
    sections: [
      { id: makeId(), name: 'Intro', patternId: intro.id, repeats: 2, cue: 'Kick, hats and the pad only.' },
      {
        id: makeId(),
        name: 'Roll',
        patternId: rollPattern.id,
        repeats: 4,
        cue: 'The bass rolls in; the acid hook leads.',
      },
      {
        id: makeId(),
        name: 'Breakdown',
        patternId: breakdown.id,
        repeats: 2,
        cue: 'Drums out: the hook over the pad.',
      },
      { id: makeId(), name: 'Drop', patternId: rollPattern.id, repeats: 4, cue: 'The full roll comes back.' },
    ],
    brief: 'Hypnotic, driving psytrance roller in E minor.',
  };
}

/**
 * @param {Pattern} pattern
 * @returns {number} its length in steps
 */
export const patternSteps = (pattern) => pattern.bars * STEPS_PER_BAR;

/**
 * The song laid out in time: each section with its pattern and where it starts. A section whose pattern is gone is
 * skipped.
 * @param {Song} song
 * @returns {{ section: Section, pattern: Pattern, startBar: number, bars: number }[]}
 */
export function songTimeline(song) {
  const patterns = new Map(song.patterns.map((pattern) => [pattern.id, pattern]));
  let startBar = 0;
  const timeline = [];
  for (const section of song.sections) {
    const pattern = patterns.get(section.patternId);
    if (!pattern) {
      continue;
    }
    const bars = pattern.bars * section.repeats;
    timeline.push({ section, pattern, startBar, bars });
    startBar += bars;
  }
  return timeline;
}

/**
 * @param {Song} song
 * @returns {number} the song's length in bars
 */
export function songBars(song) {
  return songTimeline(song).reduce((total, entry) => total + entry.bars, 0);
}

/**
 * @param {Song} song
 * @returns {number} the song's length in seconds
 */
export function songSeconds(song) {
  return (songBars(song) * BEATS_PER_BAR * 60) / song.bpm;
}
