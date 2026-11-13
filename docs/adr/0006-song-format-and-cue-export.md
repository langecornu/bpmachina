# 6. One song document, and a cue export for Open DMX Stage

Status: accepted

## Context

The song must be editable by hand and by the AI, saved safely, and usable by the sibling lighting app.

## Decision

- **One JSON document** (`server/data/song.json`, shape in `shared/types.js`, rules in `server/schemas/songSchema.js`):
  tracks (one instrument each), patterns of 1 to 8 bars holding notes (track, step on a sixteenth-note grid, length,
  MIDI pitch, velocity), and sections that play a pattern a number of times with a cue. It carries `schemaVersion` (2 since ADR 0007, which added accent, slide and sound knobs; 3 since ADR 0008, which added the mix).
- **Saved as you work**, atomically (temporary file, then rename), with the previous save kept as a backup. An
  unreadable file is moved aside, never overwritten; one from a newer version is left untouched and saving is refused.
- **The cue export** (`shared/songCue.js`) gives tempo, length, and each section's start bar and energy (0 to 1, from
  how many tracks play and how hard), with the same field names Open DMX Stage's AI shows read for a song
  (`bpm`, `durationSeconds`, `firstBeatSeconds`, `sections[].startBar/bars/energy`).

## Consequences

Repeated sections cost nothing to store, and the AI writes each pattern once. A future format change adds a migration
and raises `schemaVersion`. Open DMX Stage needs an importer for the cue file to use it directly; until then the
numbers match what it already reads from analysed audio.
