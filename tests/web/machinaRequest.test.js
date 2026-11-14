// Unit tests for turning the Machina screen's draft into a request, and into the size the cost estimate prices.
import { describe, expect, it } from 'vitest';

import { createStarterSong } from '../../shared/song.js';
import { EMPTY_DRAFT, buildComposeRequest, estimateRequest } from '../../src/utils/machinaRequest.js';

let counter = 0;
const makeId = () => `id-${(counter += 1)}`;

describe('Machina request', () => {
  it('sends a new song’s direction without the draft-only fields', () => {
    const song = createStarterSong(makeId);
    const draft = {
      ...EMPTY_DRAFT,
      brief: '  Dark roller ',
      bpm: 142,
      instruments: ['kick'],
      sections: [
        { id: 'a', name: ' Intro ', bars: 8, cue: ' quiet ' },
        { id: 'b', name: '   ', bars: 8, cue: '' },
      ],
      lockedTrackIds: [song.tracks[0].id],
    };
    expect(buildComposeRequest(draft, song, song.patterns[0].id)).toEqual({
      mode: 'new',
      brief: 'Dark roller',
      sections: [{ name: 'Intro', bars: 8, cue: 'quiet' }],
      bpm: 142,
      key: null,
      instruments: ['kick'],
      lengthBars: 32,
      patternId: null,
      lockedTrackIds: [],
      model: 'claude-opus-5-5',
      useTaste: false,
    });
  });

  it('composes to taste only when asked and a profile is there', () => {
    const song = createStarterSong(makeId);
    const draft = { ...EMPTY_DRAFT, brief: 'x', useTaste: true };
    expect(buildComposeRequest(draft, song, null, true).useTaste).toBe(true);
    expect(buildComposeRequest(draft, song, null, false).useTaste).toBe(false);
    expect(buildComposeRequest({ ...draft, useTaste: undefined }, song, null, true).useTaste).toBe(false);
  });

  it('sends a revision of the open pattern, with locks for tracks that still exist', () => {
    const song = createStarterSong(makeId);
    const draft = {
      ...EMPTY_DRAFT,
      mode: 'revise',
      brief: 'ignored',
      direction: 'Harder',
      lockedTrackIds: [song.tracks[0].id, 'deleted'],
    };
    const request = buildComposeRequest(draft, song, song.patterns[1].id);
    expect(request).toMatchObject({
      mode: 'revise',
      brief: 'Harder',
      sections: [],
      bpm: null,
      patternId: song.patterns[1].id,
      lockedTrackIds: [song.tracks[0].id],
    });
    expect(buildComposeRequest({ ...draft, scope: 'song' }, song, song.patterns[1].id).patternId).toBeNull();
  });

  it('estimates the music to write', () => {
    const song = createStarterSong(makeId);
    expect(estimateRequest(EMPTY_DRAFT, song, null)).toEqual({ tracks: 7, patternBars: 8, existingNotes: 0 });
    const withStructure = {
      ...EMPTY_DRAFT,
      instruments: ['kick', 'bass'],
      sections: [{ id: 'a', name: 'A', bars: 16, cue: '' }],
    };
    expect(estimateRequest(withStructure, song, null)).toEqual({ tracks: 2, patternBars: 4, existingNotes: 0 });
    const revise = { ...EMPTY_DRAFT, mode: 'revise', lockedTrackIds: [song.tracks[0].id] };
    const notes = song.patterns.reduce((total, pattern) => total + pattern.notes.length, 0);
    expect(estimateRequest(revise, song, song.patterns[0].id)).toEqual({
      tracks: 5,
      patternBars: 2,
      existingNotes: notes,
    });
    expect(estimateRequest({ ...revise, scope: 'song' }, song, null).patternBars).toBe(6);
  });
});
