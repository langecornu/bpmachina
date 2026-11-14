// Acid: a 303-style line. One oscillator, saw or square, into a resonant four-pole ladder whose cutoff every note
// snaps open and lets close over the decay knob: the squelch is the resonance ringing as it sweeps, and at the top of
// the resonance knob it screams. Drive after the filter, as the line is pushed through a distortion pedal on so many
// records. A slide keeps the note sounding and glides its pitch (see bpm.lib).
declare name "acid";
bpm = library("bpm.lib");
import("stdfaust.lib");

shape = nentry("waveform", 0, 0, 1, 1);
osc = select2(shape > 0.5, os.sawtooth(bpm.pitch), os.square(bpm.pitch) * 0.8);

process = osc * 0.7 : bpm.ladder(bpm.sweep, bpm.resonance) : bpm.drive(1.6) : *(bpm.ampEnv * bpm.gain * 0.22)
  : bpm.mono2stereo;
