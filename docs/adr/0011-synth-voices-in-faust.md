# 11. Synth voices written in Faust, compiled ahead of time to WebAssembly, run in an AudioWorklet

Status: accepted. Extends [ADR 0005](0005-sound-in-the-browser.md); builds on [ADR 0007](0007-303-style-acid-909-style-drums.md)
(the acid's knobs, accent and slide) and [ADR 0008](0008-mixing-and-effects.md) (each track's channel strip).

## Context

Even with a mixer, the synths sounded thin, "like an 8-bit computer": each voice was a few `OscillatorNode` waveforms
through a `BiquadFilterNode` with fixed envelopes. Web Audio's nodes cannot do what makes a synth sound analogue: a
four-pole ladder filter with resonance that sings, saturation inside the voice, oscillators that drift, envelopes that
respond to how hard a note is played. That needs sample-by-sample DSP on the audio thread. Writing it by hand in
JavaScript (as the acid's ladder worklet does) works for one filter but does not scale to seven instruments. The app
loads nothing from a CDN (ADR 0004), must keep its first load under 200 kB of gzipped JavaScript, and a dense song runs
many notes at once.

## Decision

- **The voices are written in [Faust](https://faust.grame.fr)**, a functional language for audio DSP:
  `src/audio/faust/dsp/*.dsp`, one per synth instrument (bass, acid, lead, pluck, keys, pad, fx), on shared building
  blocks in `bpm.lib`: alias-suppressed oscillators from the Faust libraries with a slow per-note drift, a
  zero-delay-feedback four-pole ladder (the same design as the acid's ladder worklet) with a soft clip in its feedback,
  a state-variable filter, exponential ADSR envelopes, a filter envelope that sweeps in octaves, and drive. The pad is a
  seven-saw supersaw spread across the stereo field; a short pad note is a hard trance stab and a long one swells. The
  acid takes the 303-style knobs from `shared/sound.js` with the same mapping as the built-in acid voice.
- **Compiled ahead of time and committed.** `npm run dsp` (`scripts/build-dsp.js`) runs the Faust compiler's own
  WebAssembly build, `@grame/faustwasm` (a dev dependency), and writes one small `.wasm` per voice (7 to 13 kB) and
  `generated/layout.js`, where each control lives in a voice's memory. A normal build, CI and the app never need the
  compiler. We do not use faustwasm's runtime glue: our processor drives the compiled module directly through its five
  exports, which keeps it to about 4 kB.
- **No transcendental maths per sample.** WebAssembly has no `sin`, `tan`, `tanh`, `exp` or `pow`; each call out to
  JavaScript's costs about 100 ns, twenty times a whole sawtooth oscillator. The first version spent nearly two cores on
  a dense song for that reason alone. `bpm.lib` uses polynomial and rational approximations (well under a percent off
  where it is heard), and computes what depends only on a control (an envelope's rates) once per block. The library's
  table-based sine was avoided too: it keeps 256 kB in every voice's memory.
- **One AudioWorkletNode per track and instrument, with a voice pool inside** (`faust/synthProcessor.js`,
  `faust/synthCore.js`), not one node per note. `playNote(context, out, instrument, note)` keeps its contract: the node
  is made the first time an output (now the track's channel strip) plays that instrument, and connected to it. Pools are
  3 to 12 voices (`faust/polyphony.js`); a new note takes a silent voice, else the one fading longest, else the oldest.
  Silent voices are not computed at all.
- **Sample-exact timing.** Each note becomes timed messages to the node (`on` with all its controls, `off`, and `set`
  for a slide's glide), stamped with their time on the audio clock. The processor cuts each 128-sample quantum at the
  exact sample an event falls on. A note that arrives late plays at the start of the next quantum.
- **Loaded lazily, with a fallback.** The engine loads the processor and compiles the seven modules when it makes its
  audio context, on the first play: none of it is in the first load. Until a node says it is ready, and wherever
  AudioWorklet or WebAssembly is missing or a node fails, `playNote` plays the built-in Web Audio voices, including the
  acid's ladder worklet, so playback never goes silent.
- **Content security policy:** `script-src 'self' 'wasm-unsafe-eval'`, which allows compiling WebAssembly and nothing
  else that `'unsafe-eval'` would.
- **Levels match the voices they replace** (measured on the same notes in a browser, within about 1 dB), so existing
  songs and the Machina's choices of volume keep their balance. The riser is 8 dB louder than before, when it was barely
  heard.

## Licences

The `.dsp` sources and the processor are this project's code. The compiled `.wasm` files are the Faust compiler's
output, which GRAME places under the licence of the source it was compiled from. The Faust library functions used are
under the MIT-style STK-4.3 licence (oscillators, `si.smooth`, noise), MIT, or the LGPL with GRAME's exception that
lets the compiled code be distributed under any licence. `@grame/faustwasm` (LGPL-2.1) is a dev dependency used only to
compile and is not shipped. None of this depends on the GPL relicensing (PR #12): it was chosen under the MIT licence
and remains compatible with GPL-3.0-or-later.

## Consequences

The synths have ladder filters that squelch and scream, analogue drift, drive and velocity-sensitive envelopes, and a
real supersaw, at a cost measured with `npm run measure:dsp`: a dense song with all seven synth instruments busy at
once (a rolling bass, a sixteenth-note acid line, an eighth-note lead, a sixteenth-note pluck arpeggio, four-note keys
and pad chords with stabs between them, and a riser) takes 22 to 27% of one core of a 2012 Intel Core i7 (2.3 GHz) in
Node's V8, the engine Chrome runs the same WebAssembly with; a recent machine needs a fraction of that. The pad and the
pluck cost the most (about 1% of that core per sounding voice). The very first note of each track plays on the built-in
voice while its node starts. Changing a voice means editing Faust and running `npm run dsp`; the tests play every
committed voice. The sound was tuned by measurement (levels, filter sweeps, peaks) and has not yet been judged on real
speakers: the envelopes, drive and filter ranges may want adjusting by ear.
