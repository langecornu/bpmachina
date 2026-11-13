# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **React 19.3** (from 18.3), with its types and version 7 of the React hooks lint rules, which add checks for the
  React Compiler. The transport makes its sound engine with lazy state instead of reading a ref during render, and the
  keyboard shortcuts use `useEffectEvent`, so their listener is added once instead of after every edit. The first load
  grows from about 63 kB to 85 kB of gzipped JavaScript (React DOM 19 is larger), within the 200 kB budget.

### Added

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
