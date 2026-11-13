// Edits to the song, as pure functions that return a new song: notes on the BPM Grid, patterns, tracks and sections.
// Screens call them through `update`, which makes every edit undoable.
import { LIMITS, createPattern, createTrack } from '../../shared/song.js';
import { STEPS_PER_BAR } from '../../shared/music.js';

/** @typedef {import('../../shared/types.js').Song} Song */
/** @typedef {import('../../shared/types.js').Pattern} Pattern */

export const makeId = () => crypto.randomUUID();

/**
 * @param {Song} song
 * @param {string} patternId
 * @param {(pattern: Pattern) => Pattern} change
 * @returns {Song}
 */
function changePattern(song, patternId, change) {
  return {
    ...song,
    patterns: song.patterns.map((pattern) => (pattern.id === patternId ? change(pattern) : pattern)),
  };
}

/**
 * Adds a note, or removes the one already there: a click on a note's start or body removes it, a click on an empty
 * cell adds one.
 * @param {Song} song
 * @param {{ patternId: string, trackId: string, step: number, pitch: number, length?: number, velocity?: number }} cell
 * @returns {Song}
 */
export function toggleNote(song, { patternId, trackId, step, pitch, length = 1, velocity = 100 }) {
  return changePattern(song, patternId, (pattern) => {
    const hit = pattern.notes.find(
      (note) => note.trackId === trackId && note.pitch === pitch && step >= note.step && step < note.step + note.length,
    );
    if (hit) {
      return { ...pattern, notes: pattern.notes.filter((note) => note !== hit) };
    }
    if (pattern.notes.length >= LIMITS.notesPerPattern) {
      return pattern;
    }
    const steps = pattern.bars * STEPS_PER_BAR;
    // A new note stops before the next note on the same pitch, so notes never overlap.
    const nextStart = Math.min(
      steps,
      ...pattern.notes
        .filter((note) => note.trackId === trackId && note.pitch === pitch && note.step > step)
        .map((note) => note.step),
    );
    const note = { trackId, step, length: Math.max(1, Math.min(length, nextStart - step)), pitch, velocity };
    return {
      ...pattern,
      notes: [...pattern.notes, note].sort((a, b) => a.step - b.step || a.pitch - b.pitch),
    };
  });
}

/**
 * Turns a note's accent or slide on or off: the note that starts on, or covers, the cell. A mark that is off is left
 * out of the note, as the song format keeps it.
 * @param {Song} song
 * @param {{ patternId: string, trackId: string, step: number, pitch?: number }} cell `pitch` left out for a drum lane
 * @param {'accent' | 'slide'} mark
 * @returns {Song} the same song when no note is there
 */
export function toggleNoteMark(song, { patternId, trackId, step, pitch }, mark) {
  const pattern = song.patterns.find((candidate) => candidate.id === patternId);
  const hit = pattern?.notes.find(
    (note) =>
      note.trackId === trackId &&
      (pitch === undefined || note.pitch === pitch) &&
      step >= note.step &&
      step < note.step + note.length,
  );
  if (!hit) {
    return song;
  }
  return changePattern(song, patternId, (current) => ({
    ...current,
    notes: current.notes.map((note) => {
      if (note !== hit) {
        return note;
      }
      const { [mark]: isOn, ...rest } = note;
      return isOn ? rest : { ...rest, [mark]: true };
    }),
  }));
}

/**
 * Accents or softens a drum hit: velocity cycles loud, medium, soft.
 * @param {Song} song
 * @param {{ patternId: string, trackId: string, step: number }} cell
 * @returns {Song}
 */
export function cycleVelocity(song, { patternId, trackId, step }) {
  return changePattern(song, patternId, (pattern) => ({
    ...pattern,
    notes: pattern.notes.map((note) => {
      if (note.trackId !== trackId || note.step !== step) {
        return note;
      }
      // The same thresholds the grid shows: loud from 110, medium from 80, soft below.
      const velocity = note.velocity >= 110 ? 90 : note.velocity >= 80 ? 60 : 120;
      return { ...note, velocity };
    }),
  }));
}

/**
 * @param {Song} song
 * @param {string} patternId
 * @param {string} trackId
 * @returns {Song} the pattern without that track's notes
 */
export function clearTrack(song, patternId, trackId) {
  return changePattern(song, patternId, (pattern) => ({
    ...pattern,
    notes: pattern.notes.filter((note) => note.trackId !== trackId),
  }));
}

/**
 * Changes a pattern's length. Notes past the new end are dropped, and notes running past it are shortened.
 * @param {Song} song
 * @param {string} patternId
 * @param {number} bars
 * @returns {Song}
 */
export function setPatternBars(song, patternId, bars) {
  const steps = bars * STEPS_PER_BAR;
  return changePattern(song, patternId, (pattern) => ({
    ...pattern,
    bars,
    notes: pattern.notes
      .filter((note) => note.step < steps)
      .map((note) => (note.step + note.length > steps ? { ...note, length: steps - note.step } : note)),
  }));
}

/**
 * @param {Song} song
 * @param {string} patternId
 * @param {string} name
 * @returns {Song}
 */
export function renamePattern(song, patternId, name) {
  return changePattern(song, patternId, (pattern) => ({ ...pattern, name: name.slice(0, LIMITS.nameLength) }));
}

/**
 * A name not used by any pattern yet: "B", "C"… then "Pattern 27".
 * @param {Song} song
 * @returns {string}
 */
function freePatternName(song) {
  const used = new Set(song.patterns.map((pattern) => pattern.name));
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((candidate) => !used.has(candidate));
  return letter ?? `Pattern ${song.patterns.length + 1}`;
}

/**
 * @param {Song} song
 * @param {string | null} [copyOf] the id of a pattern to duplicate; empty when not given
 * @returns {{ song: Song, patternId: string | null }} the new pattern's id, or null at the limit
 */
export function addPattern(song, copyOf = null) {
  if (song.patterns.length >= LIMITS.patterns) {
    return { song, patternId: null };
  }
  const source = song.patterns.find((pattern) => pattern.id === copyOf);
  const pattern = source
    ? { ...source, id: makeId(), name: `${source.name} copy`.slice(0, LIMITS.nameLength), notes: [...source.notes] }
    : createPattern(makeId, freePatternName(song), 2);
  return { song: { ...song, patterns: [...song.patterns, pattern] }, patternId: pattern.id };
}

/**
 * Deletes a pattern and the sections that play it. The last pattern stays: a song always has one.
 * @param {Song} song
 * @param {string} patternId
 * @returns {Song}
 */
export function removePattern(song, patternId) {
  if (song.patterns.length <= 1) {
    return song;
  }
  return {
    ...song,
    patterns: song.patterns.filter((pattern) => pattern.id !== patternId),
    sections: song.sections.filter((section) => section.patternId !== patternId),
  };
}

/**
 * @param {Song} song
 * @param {string} trackId
 * @param {Partial<import('../../shared/types.js').Track>} changes
 * @returns {Song}
 */
export function updateTrack(song, trackId, changes) {
  return { ...song, tracks: song.tracks.map((track) => (track.id === trackId ? { ...track, ...changes } : track)) };
}

/**
 * @param {Song} song
 * @param {string} trackId
 * @param {Partial<import('../../shared/types.js').TrackMix>} changes
 * @returns {Song}
 */
export function updateTrackMix(song, trackId, changes) {
  return {
    ...song,
    tracks: song.tracks.map((track) =>
      track.id === trackId ? { ...track, mix: { ...track.mix, ...changes } } : track,
    ),
  };
}

/**
 * @param {Song} song
 * @param {'reverb' | 'delay' | 'sidechain'} group
 * @param {Record<string, number | string>} changes
 * @returns {Song}
 */
export function updateFx(song, group, changes) {
  return { ...song, fx: { ...song.fx, [group]: { ...song.fx[group], ...changes } } };
}

/**
 * @param {Song} song
 * @param {string} instrument
 * @returns {Song}
 */
export function addTrack(song, instrument) {
  if (song.tracks.length >= LIMITS.tracks) {
    return song;
  }
  return { ...song, tracks: [...song.tracks, createTrack(makeId, instrument)] };
}

/**
 * Deletes a track and its notes in every pattern.
 * @param {Song} song
 * @param {string} trackId
 * @returns {Song}
 */
export function removeTrack(song, trackId) {
  return {
    ...song,
    tracks: song.tracks.filter((track) => track.id !== trackId),
    patterns: song.patterns.map((pattern) => ({
      ...pattern,
      notes: pattern.notes.filter((note) => note.trackId !== trackId),
    })),
  };
}

/**
 * @param {Song} song
 * @param {string} patternId the pattern the new section plays
 * @returns {Song}
 */
export function addSection(song, patternId) {
  if (song.sections.length >= LIMITS.sections) {
    return song;
  }
  const pattern = song.patterns.find((candidate) => candidate.id === patternId) ?? song.patterns[0];
  return {
    ...song,
    sections: [...song.sections, { id: makeId(), name: pattern.name, patternId: pattern.id, repeats: 1, cue: '' }],
  };
}

/**
 * @param {Song} song
 * @param {string} sectionId
 * @param {Partial<import('../../shared/types.js').Section>} changes
 * @returns {Song}
 */
export function updateSection(song, sectionId, changes) {
  return {
    ...song,
    sections: song.sections.map((section) => (section.id === sectionId ? { ...section, ...changes } : section)),
  };
}

/**
 * @param {Song} song
 * @param {string} sectionId
 * @param {-1 | 1} direction
 * @returns {Song}
 */
export function moveSection(song, sectionId, direction) {
  const index = song.sections.findIndex((section) => section.id === sectionId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= song.sections.length) {
    return song;
  }
  const sections = [...song.sections];
  [sections[index], sections[target]] = [sections[target], sections[index]];
  return { ...song, sections };
}

/**
 * @param {Song} song
 * @param {string} sectionId
 * @returns {Song}
 */
export function removeSection(song, sectionId) {
  return { ...song, sections: song.sections.filter((section) => section.id !== sectionId) };
}
