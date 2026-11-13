# BPMachina

**You set the pulse. The Machina does the heavy lifting.** BPMachina is a music composer in the browser for driving
electronic music (psytrance, hard trance, NRG and their neighbours). Describe a track to **the Machina**, an AI
composer running on Claude, lay out its sections with a cue for each, and it writes the basslines, arpeggios and
layers. Then shape every note by hand on the **BPM Grid**, arrange the song, and export it to
[Open DMX Stage](https://github.com/langecornu/open-dmx-stage) so the lights follow it.

The name says how it works (see [the naming rationale](BPMachina%20Naming%20Rationale.md)): **BPM** is the human side,
the tempo and the intent you bring; **Machina** is the engine that writes under your direction.

## Features

- **The Machina (AI composer):** compose a new song from a brief, a tempo and key (or let it choose), the band you
  want, and a structure where every section has its own cue. Or revise what you have: one pattern or the whole song,
  with the tracks you want kept **locked**. Genre starting points for a psytrance journey, a hard trance anthem and an
  NRG rush. Pick Claude Haiku, Sonnet or Opus, with a cost estimate before you press Compose. Uses your own Anthropic
  API key, which never leaves the server.
- **Undo everything:** what the Machina writes replaces the song on screen at once, and one Undo brings back your work.
  Every edit on every screen can be undone and redone (Ctrl or ⌘ Z).
- **BPM Grid:** patterns of 1 to 8 bars as tabs; one lane per track with mute, volume and a mix
  panel (pan, reverb and delay sends, ducking); click steps to place drum hits
  and Shift-click to make them softer or louder; a piano roll for synth tracks, in the song's key by default, with note
  lengths from a sixteenth to a bar, and **accent** and **slide** on any note; sound knobs on each acid and drum lane.
  Edits are heard on the next loop.
- **Built-in sound:** fourteen synthesised instruments (kick, snare, clap, closed and open hats, tom, percussion, bass, acid, lead,
  pluck, keys, pad and an FX riser), made with Web Audio in the browser and scheduled ahead on the audio clock, so
  timing stays tight. Nothing to download. The acid line is modelled on a 303-style bassline (one oscillator into a
  resonant four-pole ladder filter, with accents that bark and slides that glide), and the drums on a 909-style machine
  (a pitch-swept kick with an attack click, a two-tone snare with snappy noise, metallic hats where the closed hat
  chokes the open one). All of it is synthesised: no samples.
- **A produced mix:** a channel strip per track with stereo pan and sends to a shared reverb and a tempo-synced
  ping-pong delay; sidechain ducking of the bass, pad and lead on every kick; a saturated drum bus; and a master bus
  with a low cut, gentle saturation and a presence lift before the limiter. Hats and percussion sit off centre, the
  lead is spread wide and the pad is a seven-saw supersaw. The Machina sets the mix too.
- **Arrangement:** sections in order, each repeating a pattern, with a cue for the Machina; a strip shows the song's
  shape and energy, and where playback is. Below them, the song's effects: reverb, delay and sidechain.
- **Export for Open DMX Stage:** the song's tempo, length, and each section's start bar and energy, in the shape
  DMX-Stage's AI shows read.
- **Transport** on every screen: play the song or loop a pattern, with bar, beat and section. Space plays and stops.
- **Light and dark themes**, the look of its sibling project Open DMX Stage, and keyboard and screen reader support.

Coming next: your own samples, MIDI out to hardware and DAWs, and WAV export.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5180. The API runs on port 4100. Requires Node.js 24.15 or newer (`nvm install && nvm use` reads
`.nvmrc`).

The first start opens a starter song, "Machina Awakens", a psytrance roller: press **Play song** or Space. To use the
Machina, open **Settings** and paste an Anthropic API key from the [Anthropic Console](https://console.anthropic.com).

The [usage guide](docs/USAGE.md) walks through every screen.

## Commands

| Command                 | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | API and web app with live reload                       |
| `npm run build`         | Production build into `dist/`                          |
| `npm start`             | Serves the API and the built app on port 4100          |
| `npm test`              | Server tests (node:test) and browser tests (Vitest)    |
| `npm run test:coverage` | Tests with coverage thresholds                         |
| `npm run check`         | Lint, type check, tests and build: run before a commit |

Configuration is optional; see [.env.example](.env.example).

## How it is built

- **Browser:** React 19 and Vite. The sound engine (`src/audio/`) is Web Audio: synth voices, a look-ahead
  scheduler ([ADR 0005](docs/adr/0005-sound-in-the-browser.md)) and a mixer with shared effect buses
  ([ADR 0008](docs/adr/0008-mixing-and-effects.md)).
- **Server:** Node.js and Express. It keeps the song (`server/data/song.json`, saved as you work) and runs the Machina
  Engine (`server/services/machinaEngine.js`), which calls Claude through the official Anthropic SDK with structured
  outputs ([ADR 0003](docs/adr/0003-the-machina-engine.md)).
- **Shared:** `shared/` holds the music theory, the instruments, the song format and the code that checks and merges
  what the Machina writes, used by both sides ([ADR 0006](docs/adr/0006-song-format-and-cue-export.md)).

The app has no login and listens on this computer only by default
([ADR 0004](docs/adr/0004-this-computer-only-by-default.md)). See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [coding standards](docs/CODING_STANDARDS.md). Licence: [GPL-3.0-or-later](LICENSE): you may use, change and share BPMachina, and anything
you distribute that is built from it must be shared under the same licence, with its source.
