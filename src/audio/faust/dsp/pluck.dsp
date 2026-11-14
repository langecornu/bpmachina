// Pluck: two saws a few cents apart and a narrow pulse, through a resonant ladder whose envelope closes fast: the
// short, glassy notes of psytrance arpeggios. The amplitude decays to nothing on its own, like a plucked string. Mono:
// arpeggios stack many voices, and the track's pan places it.
declare name "pluck";
bpm = library("bpm.lib");
import("stdfaust.lib");

body = os.sawtooth(bpm.pitch * bpm.cents(-5)) * 0.35 + os.sawtooth(bpm.pitch * bpm.cents(5)) * 0.35
  + os.pulsetrain(bpm.pitch, 0.3) * 0.3;

process = body : bpm.ladder(bpm.sweep, bpm.resonance) : bpm.drive(1.3) : *(bpm.ampEnv * bpm.gain * 0.35)
  : bpm.mono2stereo;
