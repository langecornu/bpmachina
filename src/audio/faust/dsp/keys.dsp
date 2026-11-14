// Keys: a two-operator FM electric piano. A sine modulates another at the same pitch with an index that falls as the
// note decays (bright on the strike, mellow after), plus a high, quickly fading partial for the tine's bell. Harder
// notes strike brighter. The two channels are a few cents apart.
declare name "keys";
bpm = library("bpm.lib");
import("stdfaust.lib");

strike = bpm.adsr(0.001, 0.9, 0.15, 0.3, bpm.gate);
index = (0.1 + 0.25 * min(1, bpm.gain)) * strike;
bell = bpm.adsr(0.001, 0.25, 0, 0.1, bpm.gate) * 0.12 * min(1, bpm.gain);
piano(c) = bpm.sinTurn(phase + index * bpm.sinTurn(phase)) + bpm.sinTurn(ma.decimal(phase * 7)) * bell with {
  phase = os.lf_sawpos(bpm.pitch * bpm.cents(c));
};
voice = bpm.drive(1.2) : *(bpm.ampEnv * bpm.gain * 0.75);

process = piano(-3), piano(3) : voice, voice;
