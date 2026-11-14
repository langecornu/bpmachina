// FX: a riser. Noise and a saw both climb an octave across the note (`rise` seconds, the note's length), through a
// band-pass that opens from 400 Hz to 6 kHz with them, and the level swells to the end. The noise is different in
// each channel, so it fills the stereo field.
declare name "fx";
bpm = library("bpm.lib");
import("stdfaust.lib");

rise = nentry("rise", 1, 0.01, 60, 0.001);
// Seconds since the note started, held at `rise`.
start = bpm.gate > bpm.gate';
elapsed = (+(1 / ma.SR) : *(1 - start)) ~ _ : min(rise);
progress = elapsed / rise;
swell = 0.02 + 0.98 * progress * progress;
voice(n) = n * 0.6 + os.sawtooth(bpm.pitch * bpm.pow2(progress)) * 0.35
  : bpm.bandpass(400 * bpm.pow2(3.9 * progress), 2) : *(swell * bpm.ampEnv * bpm.gain * 0.24);

process = no.noises(2, 0), no.noises(2, 1) : voice, voice;
