// Pad: a supersaw. Seven saws detuned wider at the edges and spread across the stereo field, through a gentle low-pass
// that breathes with a slow LFO. Long notes swell in; short ones (hard trance stabs) get a fast attack and a filter
// envelope from the main thread, so the same voice does both. A high-pass keeps it out of the bass's way.
declare name "pad";
bpm = library("bpm.lib");
import("stdfaust.lib");

spread = nentry("spread", 1, 0, 2, 0.001);
// Cents per saw, and where it sits from left (-1) to right (1).
offsets = (-26, -15, -6, 0, 7, 16, 25);
places = (-1, 0.66, -0.33, 0, 0.33, -0.66, 1);
saw(i) = os.sawtooth(bpm.pitch * bpm.cents(ba.take(i + 1, offsets) * spread));
place(i) = ba.take(i + 1, places) * 0.85;
panned(i) = saw(i) <: *(sqrt((1 - place(i)) / 2)), *(sqrt((1 + place(i)) / 2));
breathe = 1 + 0.18 * os.lf_triangle(0.15);
voice = bpm.lowpass(bpm.sweep * breathe, 0.7 + 2 * bpm.resonance) : fi.highpass(1, 140) : *(bpm.ampEnv * bpm.gain * 0.12);

process = par(i, 7, panned(i)) :> voice, voice;
