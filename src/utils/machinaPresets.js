// Starting points for directing the Machina in its home genres: a brief, tempo, key, band and a structure with a cue
// for each section. Picking one fills the form; every field stays editable.

/**
 * @typedef {{ id: string, label: string, brief: string, bpm: number, key: { root: string, scale: string },
 *   instruments: string[], sections: { name: string, bars: number, cue: string }[] }} MachinaPreset
 */

/** @type {MachinaPreset[]} */
export const MACHINA_PRESETS = [
  {
    id: 'psytrance',
    label: 'Psytrance journey',
    brief: 'Hypnotic full-on psytrance: a tight rolling bassline, a mutating acid hook, dark and driving.',
    bpm: 142,
    key: { root: 'E', scale: 'phrygian' },
    instruments: ['kick', 'clap', 'hat', 'openhat', 'bass', 'acid', 'pad', 'fx'],
    sections: [
      { name: 'Intro', bars: 16, cue: 'Kick and hats only, a filtered hint of the acid motif.' },
      { name: 'Build', bars: 16, cue: 'The rolling bass enters; layers stack every 8 bars.' },
      { name: 'Breakdown', bars: 8, cue: 'Drums and bass out: pad and the acid motif, a riser into the drop.' },
      { name: 'Drop', bars: 16, cue: 'The full roll back, the acid hook at its squelchiest.' },
      { name: 'Outro', bars: 8, cue: 'Strip back to kick, bass and hats.' },
    ],
  },
  {
    id: 'hard-trance',
    label: 'Hard trance anthem',
    brief: 'Euphoric hard trance: a hard kick, offbeat bass, big minor chord stabs and an anthemic lead.',
    bpm: 145,
    key: { root: 'A', scale: 'minor' },
    instruments: ['kick', 'clap', 'hat', 'openhat', 'bass', 'lead', 'pad', 'fx'],
    sections: [
      { name: 'Intro', bars: 8, cue: 'Kick, offbeat bass and hats.' },
      { name: 'Build', bars: 8, cue: 'Chord stabs come in; a riser.' },
      { name: 'Break', bars: 16, cue: 'The anthem lead alone over the pad, then the drums return.' },
      { name: 'Climax', bars: 16, cue: 'Everything in: the lead doubled over driving drums.' },
      { name: 'Outro', bars: 8, cue: 'Drums and bass only.' },
    ],
  },
  {
    id: 'nrg',
    label: 'NRG rush',
    brief: 'Relentless hi-NRG: an octave-bouncing offbeat bass, a bright synth riff, constant energy.',
    bpm: 152,
    key: { root: 'D', scale: 'minor' },
    instruments: ['kick', 'snare', 'hat', 'bass', 'lead', 'pluck', 'keys'],
    sections: [
      { name: 'Intro', bars: 8, cue: 'Kick and the octave bass bounce.' },
      { name: 'Verse', bars: 16, cue: 'The pluck riff over the bass, hats driving.' },
      { name: 'Chorus', bars: 16, cue: 'The bright lead hook, keys stabbing the chords.' },
      { name: 'Bridge', bars: 8, cue: 'Half the drums, a new chord turn.' },
      { name: 'Final chorus', bars: 16, cue: 'The hook at full energy.' },
    ],
  },
];
