// A synthetic psytrance-style track for the audio analysis tests: a kick on every beat, a rolling E bass on the three
// sixteenths after it, offbeat hats and an E minor pad, with a kickless intro, so tempo, groove, key and sections have
// known answers.

/**
 * @param {{ bpm?: number, sampleRate?: number, bars?: number, introBars?: number, gapBars?: number[], swing?: number,
 *   seed?: number }} [options] `gapBars`: bars where the kick and bass stop; `swing` how late the off sixteenths are,
 *   as a share of a sixteenth
 * @returns {Float32Array}
 */
export function synthTrack({
  bpm = 142,
  sampleRate = 22050,
  bars = 24,
  introBars = 8,
  gapBars = [],
  swing = 0,
  seed = 7,
} = {}) {
  const step = (60 / bpm / 4) * sampleRate;
  const samples = new Float32Array(Math.round(bars * 16 * step));
  let random = seed;
  const noise = () => {
    random = (random * 1103515245 + 12345) % 2147483648;
    return random / 1073741824 - 1;
  };
  const add = (
    /** @type {number} */ start,
    /** @type {number} */ length,
    /** @type {(t: number) => number} */ wave,
  ) => {
    for (let index = 0; index < length && start + index < samples.length; index += 1) {
      samples[Math.round(start) + index] += wave(index / sampleRate);
    }
  };
  const padFrequencies = [164.81, 196.0, 246.94];
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / sampleRate;
    samples[index] += padFrequencies.reduce((sum, frequency) => sum + 0.04 * Math.sin(2 * Math.PI * frequency * t), 0);
  }
  for (let bar = 0; bar < bars; bar += 1) {
    const hasLowEnd = bar >= introBars && !gapBars.includes(bar);
    for (let sixteenth = 0; sixteenth < 16; sixteenth += 1) {
      const start = (bar * 16 + sixteenth) * step + (sixteenth % 2 === 1 ? swing * step : 0);
      if (hasLowEnd && sixteenth % 4 === 0) {
        add(
          start,
          step * 1.5,
          (t) => 0.8 * Math.exp(-t * 18) * Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 40)) * t),
        );
      }
      if (hasLowEnd && sixteenth % 4 !== 0) {
        add(start, step * 0.8, (t) => 0.35 * Math.exp(-t * 25) * Math.sin(2 * Math.PI * 82.41 * t));
      }
      if (sixteenth % 4 === 2) {
        add(start, step * 0.5, (t) => 0.25 * Math.exp(-t * 60) * noise());
      }
    }
  }
  return samples;
}
