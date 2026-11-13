# 5. Sound is made in the browser, with Web Audio synths and a look-ahead scheduler

Status: accepted

## Context

Composing needs instant, reliable playback: press Play and hear it, click a step and hear it on the next loop. Samples
would need downloading and licensing; a server-side engine would add latency and a second clock.

## Decision

- **Synthesised voices** (`src/audio/voices.js`), one per instrument, built from oscillators, noise, filters and
  envelopes for each note. Tuned for the home genres: a pitch-swept kick, a short filtered bass for rolling lines, a
  resonant acid voice whose filter sweep follows velocity, a rising FX voice.
- **A look-ahead scheduler** (`src/audio/engine.js`): a 25 ms timer schedules every note starting in the next 120 ms
  at exact times on the audio clock. Timing does not depend on the page being idle.
- **What plays when** is pure (`src/utils/playback.js`): the song as segments of steps, with the notes starting on any
  step. The engine rebuilds it when the song changes and keeps its place, so edits are heard while playing.
- **A limiter** on the master keeps a dense song from clipping.
- The clock, timer, context and voices are injected, so the scheduling and every voice are tested without audio.

## Consequences

No downloads and no licences to manage; the sound is good for sketching and arranging but simpler than samples or
plugins. Samples and MIDI out will plug in beside the synth voices as other ways to sound a note. Playback follows the
tab: a hidden tab's timer slows, which the look-ahead absorbs for short stretches only.
