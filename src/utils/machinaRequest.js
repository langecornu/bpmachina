// The Machina screen's draft (what the person has typed and chosen) turned into a request for the server, and into
// the size estimate the model picker prices. Pure, so both are tested without the screen.
import { DEFAULT_AI_MODEL } from '../../shared/aiModels.js';

/**
 * @typedef {{
 *   mode: 'new' | 'revise',
 *   brief: string,
 *   bpm: number | null,
 *   key: { root: string, scale: string } | null,
 *   instruments: string[],
 *   sections: { id: string, name: string, bars: number, cue: string }[],
 *   lengthBars: number,
 *   direction: string,
 *   scope: 'pattern' | 'song',
 *   lockedTrackIds: string[],
 *   model: string,
 * }} MachinaDraft
 */

/** @type {MachinaDraft} */
export const EMPTY_DRAFT = {
  mode: 'new',
  brief: '',
  bpm: null,
  key: null,
  instruments: [],
  sections: [],
  lengthBars: 32,
  direction: '',
  scope: 'pattern',
  lockedTrackIds: [],
  model: DEFAULT_AI_MODEL,
};

/**
 * @param {MachinaDraft} draft
 * @param {import('../../shared/types.js').Song} song
 * @param {string | null} patternId the pattern open on the BPM Grid, which a pattern revision changes
 */
export function buildComposeRequest(draft, song, patternId) {
  const isNew = draft.mode === 'new';
  const trackIds = new Set(song.tracks.map((track) => track.id));
  return {
    mode: draft.mode,
    brief: (isNew ? draft.brief : draft.direction).trim(),
    sections: isNew
      ? draft.sections
          .filter((section) => section.name.trim())
          .map(({ name, bars, cue }) => ({ name: name.trim(), bars, cue: cue.trim() }))
      : [],
    bpm: isNew ? draft.bpm : null,
    key: isNew ? draft.key : null,
    instruments: isNew ? draft.instruments : [],
    lengthBars: draft.lengthBars,
    patternId: !isNew && draft.scope === 'pattern' ? patternId : null,
    lockedTrackIds: isNew ? [] : draft.lockedTrackIds.filter((id) => trackIds.has(id)),
    model: draft.model,
  };
}

/**
 * How much the Machina will write, for the cost estimate.
 * @param {MachinaDraft} draft
 * @param {import('../../shared/types.js').Song} song
 * @param {string | null} patternId
 * @returns {{ tracks: number, patternBars: number, existingNotes: number }}
 */
export function estimateRequest(draft, song, patternId) {
  if (draft.mode === 'new') {
    const sectionBars = draft.sections.reduce((total, section) => total + section.bars, 0);
    // Patterns repeat: a 16-bar section is usually a 4-bar pattern played four times, so about a quarter is written.
    const bars = sectionBars > 0 ? sectionBars : draft.lengthBars;
    return { tracks: draft.instruments.length || 7, patternBars: Math.max(2, Math.round(bars / 4)), existingNotes: 0 };
  }
  const existingNotes = song.patterns.reduce((total, pattern) => total + pattern.notes.length, 0);
  const tracks = Math.max(1, song.tracks.length - draft.lockedTrackIds.length);
  const pattern = song.patterns.find((candidate) => candidate.id === patternId);
  const patternBars =
    draft.scope === 'pattern' && pattern ? pattern.bars : song.patterns.reduce((total, p) => total + p.bars, 0);
  return { tracks, patternBars, existingNotes };
}
