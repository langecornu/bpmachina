# 7. A 303-style acid voice with accent and slide, and a 909-style kit, by synthesis

Status: accepted

## Context

Acid lines and four-on-the-floor drums are the core of the app's home genres, and their character comes from two
classic machines: the 303-style bassline (one oscillator, a resonant four-pole filter, an envelope that opens it per
note, and per-step accent and slide) and the 909-style drum machine (a pitch-swept kick with a click, a two-tone snare
with noise, metallic hats where the closed hat cuts off the open one). The first version had none of the accent or
slide, and its acid filter was Web Audio's `BiquadFilterNode`, which is only two-pole (12 dB per octave) and does not
squelch. Samples cannot be bundled (ADR 0005), and the content security policy only allows scripts from this site.

## Decision

- **A ladder filter on the audio thread.** `src/audio/ladderWorklet.js` is an AudioWorklet: four zero-delay-feedback
  one-pole stages with feedback from the last to the first (24 dB per octave, resonance just short of
  self-oscillation), and a soft clip at its input. Its maths is exported and tested without audio. The file is served as
  it is from this site: `vite.config.js` keeps it out of inlined assets. The engine loads it when the audio context is
  made; until it is ready, or if it cannot load, the acid voice uses two biquads in a row. Each note makes its own
  filter node, which tells the browser it can be dropped once the note is over and the filter has stopped ringing.
- **Accent and slide are part of the note** (`accent`, `slide`, both left out when false), not velocity tricks, so the
  Machina and the person can set them independently of how loud a note is. An accent plays any note harder; on the acid
  voice it also opens the filter further and closes it fast, ignoring the decay knob, as the hardware does. A slide is
  allowed on instruments that glide (acid and bass, `slides` in `shared/instruments.js`).
- **Slides are resolved in the pure playback plan** (`src/utils/playback.js`): a sliding note lasts until the track's
  next note in the pattern, which is marked as tied. The voice for a sliding note is held open and returned as a
  handle; the engine keeps one per track and passes it the tied note, which glides the pitch in 60 ms with no new
  attack. A held note whose next note never comes (the song changed, playback stopped) is ended where its gate would
  have closed. A slide never crosses into another pattern.
- **Sound knobs per track** (`sound`, shared/sound.js): all 0 to 100, only the instrument's own kept, a missing knob at
  its default. Acid: cutoff, resonance, env mod, decay, waveform. Drums: tune and decay, attack on the kick, snappy on
  the snare.
- **The 909-style kit**: a sine swept from about five times its pitch with a click of noise and a short blip; a snare
  of two tuned triangle tones plus high-passed noise; hats of six square waves at clashing pitches, band- and
  high-passed, with a choke: a closed or open hat silences an open hat that started earlier and still rings.
- **Song format 2** with a migration from 1 (`server/services/songMigrations.js`); the original file is kept as
  `song.v1.json`.
- **Names**: the UI says Acid, Kick, Snare and so on. "303-style" and "909-style" appear in tooltips and docs only, and
  ATTRIBUTIONS.md carries the trademark notice.

## Consequences

The acid line squelches and talks, and the Machina can write the accents and slides acid depends on. Each acid note
costs an AudioWorkletNode and each hat seven sources; that is well within budget at sixteenths, but a song with many
hat tracks at very high tempo costs more than before. The sound was tuned by reading the maths and was not judged on
studio monitors; the knob ranges may want adjusting by ear. Slides do not cross pattern boundaries, and an open hat
choked by a preview while playing is choked in the music too.
