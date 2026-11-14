// Lead: three detuned saws per side and a square an octave down underneath, through a ladder per channel with a
// short filter envelope, so the hook cuts through at the start of each note and settles. The saws are detuned
// differently left and right, which is what makes it wide without a chorus.
declare name "lead";
bpm = library("bpm.lib");
import("stdfaust.lib");

spread = nentry("spread", 12, 0, 50, 0.01);
saws(offsets) = par(i, 3, os.sawtooth(bpm.pitch * bpm.cents(ba.take(i + 1, offsets) * spread / 12))) :> /(3);
sub = os.square(bpm.pitch / 2) * 0.25;
left = saws((-12, 3, 9)) + sub;
right = saws((-8, -2, 12)) + sub;
voice = bpm.ladder(bpm.sweep, bpm.resonance) : bpm.drive(1.4) : *(bpm.ampEnv * bpm.gain * 0.33);

process = left, right : voice, voice;
