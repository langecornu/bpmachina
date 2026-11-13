// Turns what the AI composer answers into a song. The answer is data, never trusted as a song: tracks must use known
// instruments, notes are moved onto the grid and into each instrument's range, numbers are clamped, duplicates and
// references to unknown tracks or patterns are dropped, and every list is capped. The mix and effects the AI chose
// are clamped into range, and whatever it left out keeps its current or default value. A revision is merged into the
// song the person already has: tracks they locked keep their notes and their mix, and everything keeps its id where it
// can. Pure, for browser and server.
import { INSTRUMENT_IDS, instrumentOf } from './instruments.js';
import { cleanFx, cleanMix, defaultMix } from './mix.js';
import { MAX_BPM, MIN_BPM, NOTE_NAMES, SCALE_NAMES, STEPS_PER_BAR, clamp } from './music.js';
import { LIMITS, SONG_SCHEMA_VERSION, createTrack } from './song.js';

/** @typedef {import('./types.js').Song} Song */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {import('./types.js').Note} Note */
/** @typedef {import('./types.js').Pattern} Pattern */

/**
 * @typedef {{ track: string, step: number, length: number, pitch: number, velocity: number }} GeneratedNote
 * @typedef {{
 *   summary: string,
 *   title: string,
 *   bpm: number,
 *   key: { root: string, scale: string },
 *   tracks: { name: string, instrument: string, mix?: Partial<import('./types.js').TrackMix> }[],
 *   patterns: { name: string, bars: number, notes: GeneratedNote[] }[],
 *   sections: { name: string, pattern: string, repeats: number, cue: string }[],
 *   fx?: unknown,
 * }} Composition what the AI answers, in the shape the API enforces; `mix` and `fx` may be left out
 */

const FLATS = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };

/**
 * @param {string} text
 * @param {string} fallback
 * @param {number} [maxLength]
 * @returns {string}
 */
function cleanText(text, fallback, maxLength = LIMITS.nameLength) {
  const trimmed = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return trimmed || fallback;
}

/** @param {string} name */
const nameKey = (name) => String(name).trim().toLowerCase();

/**
 * @param {{ root: string, scale: string }} key
 * @returns {{ root: string, scale: string }} a key the app knows, A minor when it cannot tell
 */
export function cleanKey(key) {
  const rawRoot = String(key?.root ?? '').trim();
  const spelled = rawRoot.charAt(0).toUpperCase() + rawRoot.slice(1);
  const root = FLATS[/** @type {keyof typeof FLATS} */ (spelled)] ?? spelled;
  const scale = nameKey(key?.scale ?? '');
  return {
    root: NOTE_NAMES.includes(root) ? root : 'A',
    scale: SCALE_NAMES.includes(scale) ? scale : 'minor',
  };
}

/**
 * Moves a pitch by octaves into a range, so a bass line written an octave too high still plays as a bass line.
 * @param {number} pitch
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
export function foldIntoRange(pitch, low, high) {
  let folded = Math.round(pitch);
  while (folded < low) {
    folded += 12;
  }
  while (folded > high) {
    folded -= 12;
  }
  return folded < low ? low : folded;
}

/**
 * @param {GeneratedNote[]} notes
 * @param {Map<string, Track>} tracksByName lower-case name to track
 * @param {number} bars
 * @returns {Note[]} on the grid, in range, without duplicates, sorted by step, capped
 */
export function cleanNotes(notes, tracksByName, bars) {
  const steps = bars * STEPS_PER_BAR;
  const seen = new Set();
  /** @type {Note[]} */
  const cleaned = [];
  for (const note of notes) {
    const track = tracksByName.get(nameKey(note.track));
    const step = Math.floor(Number(note.step));
    if (!track || !Number.isFinite(step) || step < 0 || step >= steps || !Number.isFinite(Number(note.pitch))) {
      continue;
    }
    const instrument = instrumentOf(track.instrument);
    const isDrum = instrument.kind === 'drum';
    const pitch = isDrum ? instrument.defaultPitch : foldIntoRange(Number(note.pitch), instrument.low, instrument.high);
    const identity = `${track.id}:${step}:${pitch}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    cleaned.push({
      trackId: track.id,
      step,
      length: isDrum ? 1 : clamp(Math.round(Number(note.length) || 1), 1, steps - step),
      pitch,
      velocity: clamp(Math.round(Number(note.velocity) || 100), 1, 127),
    });
  }
  return cleaned.sort((a, b) => a.step - b.step || a.pitch - b.pitch).slice(0, LIMITS.notesPerPattern);
}

/**
 * The composition's tracks, reusing the person's tracks (their id, volume and mute) where the name matches. The mix
 * the AI gives a track wins; where it gives none, the track keeps its own or gets its instrument's default.
 * @param {Composition['tracks']} generated
 * @param {Track[]} existing
 * @param {() => string} makeId
 * @returns {Track[]}
 */
function mergeTracks(generated, existing, makeId) {
  const byName = new Map(existing.map((track) => [nameKey(track.name), track]));
  /** @type {Track[]} */
  const tracks = [];
  for (const wanted of generated) {
    const instrument = INSTRUMENT_IDS.includes(wanted.instrument) ? wanted.instrument : null;
    const name = cleanText(wanted.name, instrument ? instrumentOf(instrument).name : 'Track');
    if (!instrument || tracks.some((track) => nameKey(track.name) === nameKey(name))) {
      continue;
    }
    const known = byName.get(nameKey(name));
    const mix = cleanMix(wanted.mix, known?.mix ?? defaultMix(instrument));
    tracks.push(known ? { ...known, instrument, mix } : { ...createTrack(makeId, instrument, name), mix });
    if (tracks.length === LIMITS.tracks) {
      break;
    }
  }
  return tracks;
}

/**
 * A new song from a composition. Existing tracks with the same names keep their ids and mixer settings.
 * @param {Composition} composition
 * @param {{ makeId: () => string, existingTracks?: Track[], existingFx?: import('./types.js').SongFx }} options
 *   `existingFx` fills in the effects the AI leaves out (the defaults when not given)
 * @returns {Song}
 */
export function buildSong(composition, { makeId, existingTracks = [], existingFx }) {
  const tracks = mergeTracks(composition.tracks, existingTracks, makeId);
  const tracksByName = new Map(tracks.map((track) => [nameKey(track.name), track]));
  /** @type {Pattern[]} */
  const patterns = [];
  for (const generated of composition.patterns) {
    const name = cleanText(generated.name, `Pattern ${patterns.length + 1}`);
    if (patterns.some((pattern) => nameKey(pattern.name) === nameKey(name))) {
      continue;
    }
    const bars = clamp(Math.round(Number(generated.bars) || 1), 1, LIMITS.barsPerPattern);
    patterns.push({ id: makeId(), name, bars, notes: cleanNotes(generated.notes, tracksByName, bars) });
    if (patterns.length === LIMITS.patterns) {
      break;
    }
  }
  const patternsByName = new Map(patterns.map((pattern) => [nameKey(pattern.name), pattern]));
  const sections = composition.sections
    .filter((section) => patternsByName.has(nameKey(section.pattern)))
    .slice(0, LIMITS.sections)
    .map((section) => ({
      id: makeId(),
      name: cleanText(section.name, 'Section'),
      patternId: /** @type {Pattern} */ (patternsByName.get(nameKey(section.pattern))).id,
      repeats: clamp(Math.round(Number(section.repeats) || 1), 1, LIMITS.repeats),
      cue: cleanText(section.cue, '', LIMITS.cueLength),
    }));
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    name: cleanText(composition.title, 'Untitled song'),
    bpm: clamp(Math.round(Number(composition.bpm) || 120), MIN_BPM, MAX_BPM),
    key: cleanKey(composition.key),
    tracks,
    patterns,
    // A song with patterns but no usable sections still plays: each pattern once, in order.
    sections:
      sections.length > 0
        ? sections
        : patterns.map((pattern) => ({ id: makeId(), name: pattern.name, patternId: pattern.id, repeats: 1, cue: '' })),
    brief: '',
    fx: cleanFx(composition.fx, existingFx),
  };
}

/**
 * Merges a revision of the whole song. Locked tracks are kept as they are, and in every pattern that already existed
 * (matched by name) their notes stay exactly as the person left them. The person's brief and cues are kept.
 * @param {Song} song
 * @param {Composition} composition
 * @param {{ makeId: () => string, lockedTrackIds?: string[] }} options
 * @returns {Song}
 */
export function reviseSong(song, composition, { makeId, lockedTrackIds = [] }) {
  const locked = song.tracks.filter((track) => lockedTrackIds.includes(track.id));
  const built = buildSong(composition, { makeId, existingTracks: song.tracks, existingFx: song.fx });
  const tracks = [...locked, ...built.tracks.filter((track) => !lockedTrackIds.includes(track.id))].slice(
    0,
    LIMITS.tracks,
  );
  const lockedIds = new Set(locked.map((track) => track.id));
  const oldPatterns = new Map(song.patterns.map((pattern) => [nameKey(pattern.name), pattern]));
  const trackIds = new Set(tracks.map((track) => track.id));
  const patterns = built.patterns.map((pattern) => {
    const old = oldPatterns.get(nameKey(pattern.name));
    const steps = pattern.bars * STEPS_PER_BAR;
    const kept = old ? old.notes.filter((note) => lockedIds.has(note.trackId) && note.step < steps) : [];
    const fresh = pattern.notes.filter((note) => trackIds.has(note.trackId) && (!old || !lockedIds.has(note.trackId)));
    // A kept pattern keeps its id, so the editor stays on it.
    return { ...pattern, id: old?.id ?? pattern.id, notes: sortNotes([...kept, ...fresh]) };
  });
  const idByBuiltId = new Map(built.patterns.map((pattern, index) => [pattern.id, patterns[index].id]));
  return {
    ...built,
    tracks,
    patterns,
    sections: built.sections.map((section) => ({
      ...section,
      patternId: /** @type {string} */ (idByBuiltId.get(section.patternId)),
      cue: section.cue || (song.sections.find((old) => nameKey(old.name) === nameKey(section.name))?.cue ?? ''),
    })),
    brief: song.brief,
  };
}

/**
 * Merges a revision of one pattern: only that pattern's notes change, on tracks that are not locked. The AI may add
 * tracks; the song's tempo, key and sections stay as they are.
 * @param {Song} song
 * @param {Composition} composition
 * @param {{ makeId: () => string, patternId: string, lockedTrackIds?: string[] }} options
 * @returns {Song}
 */
export function revisePattern(song, composition, { makeId, patternId, lockedTrackIds = [] }) {
  const target = song.patterns.find((pattern) => pattern.id === patternId);
  const generated =
    composition.patterns.find((pattern) => target && nameKey(pattern.name) === nameKey(target.name)) ??
    composition.patterns[0];
  if (!target || !generated) {
    return song;
  }
  const added = mergeTracks(composition.tracks, song.tracks, makeId).filter(
    (track) => !song.tracks.some((existing) => existing.id === track.id),
  );
  const tracks = [...song.tracks, ...added].slice(0, LIMITS.tracks);
  const writable = tracks.filter((track) => !lockedTrackIds.includes(track.id));
  const bars = clamp(Math.round(Number(generated.bars) || target.bars), 1, LIMITS.barsPerPattern);
  const fresh = cleanNotes(generated.notes, new Map(writable.map((track) => [nameKey(track.name), track])), bars);
  const kept = target.notes.filter((note) => lockedTrackIds.includes(note.trackId) && note.step < bars * STEPS_PER_BAR);
  return {
    ...song,
    tracks,
    patterns: song.patterns.map((pattern) =>
      pattern.id === patternId ? { ...pattern, bars, notes: sortNotes([...kept, ...fresh]) } : pattern,
    ),
  };
}

/**
 * @param {Note[]} notes
 * @returns {Note[]} by step, then pitch, capped
 */
function sortNotes(notes) {
  return [...notes].sort((a, b) => a.step - b.step || a.pitch - b.pitch).slice(0, LIMITS.notesPerPattern);
}
