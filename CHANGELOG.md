# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Taste profiles:** a library of small, versioned, hand-editable descriptions of the music you like, one file per
  taste in `server/data/tastes/`, each with a style, moods and an intensity (tempo, keys, groove and bass steps on the
  16-step grid, acid habits, instruments, sound, section lengths, transitions, likes and avoid), validated by a strict
  schema. **Compose to my taste** on the Machina screen picks one, grouped by style, and sends it with the direction as
  data in its own cached block after the unchanged system prompt. **Your tastes** in Settings finds tastes by words,
  style, mood and intensity, shows what each says, edits its labels, duplicates and deletes (moved aside, not
  erased). `/api/v1/tastes` lists, reads, saves and deletes them. See ADR 0012 and docs/TASTE.md.
- **Measuring tracks you love, on your computer:** `node scripts/analyse-tracks.js <folder>` decodes each audio file
  with ffmpeg and measures tempo, beat and downbeat, how hard each sixteenth is hit in the kick, bass, mid and hat
  bands, swing, key candidates, spectral balance, loudness, sections and transitions, into
  `server/data/taste-analysis.json`, for Claude Code to turn into tastes in a chat. `scripts/check-taste.js`
  validates them. No new npm dependency; nothing is uploaded.

- **MIDI out** through Web MIDI: each track sounds through the built-in synth or a MIDI output and channel, chosen on
  its lane on the BPM Grid. Notes are sent ahead with timestamps on the same schedule as the synth; drums send their
  General MIDI note unless the track names another; velocity is the note's, and an accent goes at 127; a slide
  overlaps the next note so a 303-style synth glides, and a slide into the same pitch holds the note. Kicks sent to
  MIDI still duck the synth tracks. Optional MIDI clock (24 pulses a beat, start, stop and song position) to a chosen
  output. Stop releases every note and sends all-notes-off. A MIDI card in Settings turns it on and lists the
  outputs; without Web MIDI (Safari) or with permission refused, every track plays on the synth and the card says
  why. See ADR 0010.
- **Sampled drums:** the kick, snare, closed and open hats, tom and percussion play recorded one-shots by default:
  thirteen public-domain (CC0) samples from Sonic Pi's library, trimmed to mono FLAC (about 340 kB in all), served by
  the app and loaded after the first Play, outside the JavaScript bundle. Each drum track has a **Kit**: one of its
  samples or the 909-style synth. Tune and Decay work on samples too (playback speed, an earlier fade); velocity and
  accents set the level; a closed hat chokes a ringing open hat. Until a sample has loaded, or if it fails to, the drum
  plays the synth. The clap stays synthesised. See ADR 0009.
- **Synth voices written in Faust:** bass, acid, lead, pluck, keys, pad and the FX riser are now real DSP run on the
  audio thread instead of bare oscillators: four-pole ladder filters (resonance that screams on the acid), oscillators
  that drift a few cents, drive inside each voice, envelopes that follow velocity, an FM electric piano for the keys,
  and a seven-saw supersaw pad whose short notes are hard trance stabs. One worklet per track with a pool of voices,
  notes started and ended at the exact sample. They load on the first play; until then, and in a browser that cannot
  run them, the previous voices play. The acid keeps its knobs, accents and slides. See ADR 0011.
- **A 303-style acid line:** the Acid instrument is now one sawtooth or square oscillator into a resonant four-pole
  ladder filter, run on the audio thread as an AudioWorklet, with Cutoff, Resonance, Env mod, Decay and waveform knobs
  on its lane. See ADR 0007.
- **Accent and slide** on notes. An accent plays a note harder (on the acid line, a brighter and shorter filter peak);
  a slide on an Acid or Bass note glides into the track's next note with no new attack. Set them with the piano roll's
  Accent and Slide tools, or Shift-click and Alt-click while drawing; Alt-click accents a drum hit. The Machina writes
  accents and slides, and leans on them for acid lines. The starter song's acid hook has them.
- **A 909-style drum kit:** a pitch-swept kick with an attack click, a snare of two tuned tones and snappy noise,
  metallic hats where the closed hat chokes the open one, and a reworked clap and tom, each with Tune and Decay knobs
  (and Attack on the kick, Snappy on the snare).

### Changed

- **Song format version 4:** a drum track's `sound` may carry its `kit`. Older songs are migrated when they open; their
  drums play the default samples, and choosing **909 synth** brings back the synthesised sound.
- **Song format version 2:** notes may carry `accent` and `slide`, and tracks carry their `sound` knobs. A song saved
  by an earlier version is migrated when it is opened, and the file as it was is kept beside it as `song.v1.json`.
- Accented notes count a little more towards a section's energy in the export for Open DMX Stage.

### Changed

- **Licence: GPL-3.0-or-later** (from MIT), so BPMachina can build on the best open-source synthesis code, much of
  which is GPL. Anything distributed that is built from BPMachina must be shared under the same licence, with its
  source. Versions already published under MIT stay available under MIT.
- **React 19.3** (from 18.3), with its types and version 7 of the React hooks lint rules, which add checks for the
  React Compiler. The transport makes its sound engine with lazy state instead of reading a ref during render, and the
  keyboard shortcuts use `useEffectEvent`, so their listener is added once instead of after every edit. The first load
  grows from about 63 kB to 85 kB of gzipped JavaScript (React DOM 19 is larger), within the 200 kB budget.
- **Song format version 3:** each track has a `mix` and the song has `fx`. An older song is migrated when it opens,
  with the default mix for each instrument, and its original file is kept beside it (`song.v1.json` or `song.v2.json`).
- **Song format version 5:** each track has an `output`, the built-in synth or a MIDI output and channel. An older
  song is migrated when it opens with every track on the synth, as before, and its original file is kept beside it.

### Added

- **Mixing and effects:** a channel strip per track with stereo pan and sends to a shared reverb (its impulse response
  made in code) and a tempo-synced stereo ping-pong delay with a filter in its loop; sidechain ducking on every kick,
  scheduled at the kick's exact time; a saturated drum bus; and a master bus with a low cut, gentle saturation and a
  presence lift before the limiter. Pan, sends and ducking on each lane of the BPM Grid; reverb, delay and sidechain on
  the Arrangement screen. Hats and percussion sit off centre by default, the lead is spread wide and the pad is a
  seven-saw supersaw. The Machina may set the mix and the effects. See ADR 0008.
- **The Machina**, the AI composer: compose a new song from a brief, tempo, key, band and a structure with a cue for
  each section, or revise one pattern or the whole song with tracks locked. Genre starting points (psytrance journey,
  hard trance anthem, NRG rush). Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5, with a cost estimate before composing and
  the cost after. The result replaces the song at once, with Undo to bring the previous one back. See ADR 0003.
- **BPM Grid**: patterns as tabs (new, duplicate, rename, length, delete); a lane per track with mute, volume and
  remove; drum hits placed by clicking, accented with Shift-click; a piano roll for synth tracks, in key by default,
  with note lengths; a playhead on both.
- **Sound engine**: fourteen Web Audio instruments tuned for driving electronic music (a punchy kick, a tight rolling
  bass, a resonant acid line, risers), a limiter and master volume, and a look-ahead scheduler. See ADR 0005.
- **Arrangement**: sections with pattern, repeats and a cue; move and remove; a strip of the song's shape and energy.
- **Export for Open DMX Stage**: a song cue with tempo, length, and each section's start bar and energy. See ADR 0006.
- **Transport bar** on every screen; Space plays and stops; Ctrl or ⌘ Z undoes and Shift redoes.
- **Starter song**: "Machina Awakens", a psytrance roller in E minor at 142 BPM.
- The song is saved as you work, with a backup of the previous save; an unreadable file is kept aside, and one from a
  newer version is never overwritten.
- Settings for the Anthropic API key (write-only), light and dark themes, and the look of Open DMX Stage.
