# 7. A mixer with shared effect buses, and sidechain as scheduled automation

Status: accepted. Extends [ADR 0005](0005-sound-in-the-browser.md).

## Context

Every voice played into one mono master gain and a limiter, completely dry. The instruments were fine; the sound was
cheap because nothing was mixed: no stereo, no space, no glue, no pump. Psytrance, hard trance and NRG are defined as
much by their mix (a dry centred kick, a ducked bass, wide pads and leads, delays on the acid) as by their notes. Any
fix has to keep the scheduler's tight timing and stay light on the CPU with dense songs, and still ship no audio files.

## Decision

- **A mixer** (`src/audio/mixer.js`) sits between the voices and the engine's master volume. `playNote` keeps its
  signature; the node it plays into is now the track's channel strip instead of the master.
- **A channel strip per track**, made when the song is synced and kept for as long as the track exists: a ducking gain,
  a `StereoPannerNode`, and two send gains. Sends are taken after the duck and the pan, so the tails pump with the
  track and sit on its side. The track's volume stays in each note's gain, as before, so the synth and other ways of
  sounding a note (MIDI out) read the same number.
- **Shared effect buses, one each per audio context**, however many notes play: a reverb (a `ConvolverNode` whose
  stereo impulse response is decaying noise made in code, different on each side; a short pre-delay; a low cut so the
  tail stays out of the bass; a damped top) and a ping-pong delay (two `DelayNode`s, left feeding right, right feeding
  back through a low-pass tone filter and a low cut), timed to the song's tempo in beat divisions. The impulse
  response is only made again when its size or decay changes.
- **A drum bus** with gentle saturation (`WaveShaperNode`, tanh curve, oversampling `4x`) for the drum instruments, and
  **a master bus**: a headroom trim, a low cut, gentle saturation and a presence lift, then the existing master volume
  and the limiter (now with a hard knee and a higher ratio). The saturation curves never exceed full scale.
- **Sidechain ducking is gain automation scheduled at each kick's exact time**, not a compressor keyed by the kick:
  the scheduler already knows when every kick plays, so for each one it ramps the ducking gain of every track marked
  to duck down in 4 ms and back up over a release measured in beats. A kick that falls while a duck is still
  recovering is let through, so a kick roll does not stutter. This is exact, costs no audio analysis, and is tested
  against recorded automation times.
- **The song format** (version 2) carries each track's `mix` (pan, reverb send, delay send, duck) and the song's `fx`
  (reverb size, decay and level; delay division, feedback, tone and level; sidechain amount and release), with genre
  defaults per instrument in `shared/mix.js`. A version 1 song is migrated on load to those defaults
  (`server/services/songMigrations.js`), and the original file is kept beside it.
- **The Machina** may set the mix and the effects; both are optional in its answer, and `shared/composition.js` clamps
  them and fills what is missing from the track's current mix or the defaults.
- **Wider voices:** the lead's detuned saws and the pad's seven supersaw saws are each panned across the field.

## Consequences

The built-in sound has space, width and movement, and the Machina can mix as it composes. CPU cost grows with tracks,
not notes, apart from one `StereoPannerNode` per wide voice. A tempo change moves the delay time with a short glide,
which can be heard as a small pitch bend in the repeats. Ducking follows the scheduled kicks only, so a muted or
soloed-away kick does not duck anything. The mix has not been judged on a range of speakers yet; the defaults are a starting point to tune by ear.
