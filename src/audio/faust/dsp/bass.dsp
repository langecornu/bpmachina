// Bass: the rolling psytrance and hard trance low end. A saw for the bite and a sine at the same pitch for the weight,
// into a four-pole ladder whose cutoff each note snaps open for a moment. Notes are short and tight so the kick has
// room; a touch of drive glues the two oscillators together.
declare name "bass";
bpm = library("bpm.lib");
import("stdfaust.lib");

saw = os.sawtooth(bpm.pitch);
sub = bpm.sinTurn(os.lf_sawpos(bpm.pitch));
body = saw * 0.7 + sub * 0.55;

process = body : bpm.ladder(bpm.sweep, bpm.resonance) : bpm.drive(3) : *(bpm.ampEnv * bpm.gain * 0.95)
  : bpm.mono2stereo;
