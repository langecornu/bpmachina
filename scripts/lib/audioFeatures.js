// Measures a decoded track for the taste profile (ADR 0010, docs/TASTE.md): tempo, the beat and bar grid, where the
// low end, the mids and the hats land on the sixteenth-note grid, swing, key, the spectral balance, loudness, and the
// energy and kick of every bar. Plain JavaScript on a mono Float32Array, so it needs no native add-on and runs offline;
// the decoding is done by ffmpeg (scripts/lib/decodeAudio.js). Every measure here is an estimate from the mixed-down
// audio: exact notes need transcription, which this does not attempt.

/** Short frames for timing (about 23 ms at 22,050 Hz), long frames for pitch. */
const FRAME = 2048;
const HOP = 512;
const PITCH_FRAME = 8192;
const PITCH_HOP = 4096;

/** Where the kick's body is, in hertz. */
const KICK_BAND = /** @type {const} */ ([35, 120]);

/** Frequency bands in hertz. `low` is where the kick and the bass meet; `high` is the hats. */
const FLUX_BANDS = /** @type {const} */ ({
  low: [30, 150],
  sub: [30, 80],
  bass: [80, 250],
  mid: [250, 5000],
  high: [5000, 11000],
  all: [30, 11000],
});
const BALANCE_BANDS = /** @type {const} */ ({
  sub: [20, 60],
  bass: [60, 250],
  lowMid: [250, 2000],
  highMid: [2000, 6000],
  high: [6000, 11000],
});

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Krumhansl and Kessler's key profiles (1982): how strongly each degree of a key is heard. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** The scales BPMachina offers (shared/music.js), split by their third so a minor key is refined among minor scales. */
const SCALE_FAMILIES = {
  minor: {
    minor: [0, 2, 3, 5, 7, 8, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  },
  major: {
    major: [0, 2, 4, 5, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  },
};

/** @typedef {Record<keyof typeof FLUX_BANDS, Float32Array>} BandSeries */

/**
 * @typedef {{
 *   frameRate: number,
 *   flux: BandSeries,
 *   energy: Record<keyof typeof BALANCE_BANDS, Float32Array>,
 *   kick: Float32Array,
 *   centroid: Float32Array,
 *   rms: Float32Array,
 * }} SpectralFeatures one value per short frame. `flux` is the onset strength on a log scale, which shows every hit;
 *   `kick` is the rise in low-end level on a linear scale, where the kick stands far above the bass
 */

/** @type {Map<number, { rev: Uint32Array, cos: Float64Array, sin: Float64Array, window: Float64Array }>} */
const plans = new Map();

/**
 * Bit-reversal order, twiddle factors and a Hann window for one FFT size, computed once.
 * @param {number} size a power of two
 */
function planFor(size) {
  const cached = plans.get(size);
  if (cached) {
    return cached;
  }
  const bits = Math.log2(size);
  const rev = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed |= ((index >> bit) & 1) << (bits - 1 - bit);
    }
    rev[index] = reversed;
  }
  const cos = new Float64Array(size / 2);
  const sin = new Float64Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    cos[index] = Math.cos((-2 * Math.PI * index) / size);
    sin[index] = Math.sin((-2 * Math.PI * index) / size);
  }
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
  }
  const plan = { rev, cos, sin, window };
  plans.set(size, plan);
  return plan;
}

/**
 * In-place radix-2 FFT.
 * @param {Float64Array} re
 * @param {Float64Array} im
 */
export function fft(re, im) {
  const size = re.length;
  const { rev, cos, sin } = planFor(size);
  for (let index = 0; index < size; index += 1) {
    const other = rev[index];
    if (other > index) {
      const swapRe = re[index];
      const swapIm = im[index];
      re[index] = re[other];
      im[index] = im[other];
      re[other] = swapRe;
      im[other] = swapIm;
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2;
    const step = size / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < half; offset += 1) {
        const wr = cos[offset * step];
        const wi = sin[offset * step];
        const a = start + offset;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/**
 * Magnitude spectra of successive windowed frames, handed to `onFrame` one at a time so a long track never holds
 * every spectrum in memory.
 * @param {Float32Array} samples
 * @param {number} size
 * @param {number} hop
 * @param {(magnitudes: Float64Array, frame: number, start: number) => void} onFrame
 * @returns {number} how many frames
 */
function eachSpectrum(samples, size, hop, onFrame) {
  const { window } = planFor(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const magnitudes = new Float64Array(size / 2 + 1);
  const count = samples.length < size ? 0 : Math.floor((samples.length - size) / hop) + 1;
  for (let frame = 0; frame < count; frame += 1) {
    const start = frame * hop;
    for (let index = 0; index < size; index += 1) {
      re[index] = samples[start + index] * window[index];
      im[index] = 0;
    }
    fft(re, im);
    for (let bin = 0; bin <= size / 2; bin += 1) {
      magnitudes[bin] = Math.hypot(re[bin], im[bin]);
    }
    onFrame(magnitudes, frame, start);
  }
  return count;
}

/**
 * @param {readonly [number, number]} band in hertz
 * @param {number} size FFT size
 * @param {number} sampleRate
 * @returns {[number, number]} the first and last bin, inclusive
 */
function binsOf([low, high], size, sampleRate) {
  const last = size / 2;
  return [Math.max(1, Math.round((low * size) / sampleRate)), Math.min(last, Math.round((high * size) / sampleRate))];
}

/**
 * Per-frame onset strength (spectral flux) in each band, band energies, spectral centroid and loudness.
 * @param {Float32Array} samples mono, -1 to 1
 * @param {number} sampleRate
 * @returns {SpectralFeatures}
 */
export function spectralFeatures(samples, sampleRate) {
  const count = samples.length < FRAME ? 0 : Math.floor((samples.length - FRAME) / HOP) + 1;
  const fluxBins = Object.entries(FLUX_BANDS).map(([name, band]) => ({
    name,
    bins: binsOf(band, FRAME, sampleRate),
    values: new Float32Array(count),
  }));
  const energyBins = Object.entries(BALANCE_BANDS).map(([name, band]) => ({
    name,
    bins: binsOf(band, FRAME, sampleRate),
    values: new Float32Array(count),
  }));
  const kickBins = binsOf(KICK_BAND, FRAME, sampleRate);
  const kick = new Float32Array(count);
  let previousLow = 0;
  const centroid = new Float32Array(count);
  const rms = new Float32Array(count);
  const previous = new Float64Array(FRAME / 2 + 1);
  const current = new Float64Array(FRAME / 2 + 1);
  eachSpectrum(samples, FRAME, HOP, (magnitudes, frame, start) => {
    let weighted = 0;
    let total = 0;
    for (let bin = 1; bin <= FRAME / 2; bin += 1) {
      current[bin] = Math.log1p(magnitudes[bin]);
      weighted += magnitudes[bin] * bin;
      total += magnitudes[bin];
    }
    centroid[frame] = total > 0 ? ((weighted / total) * sampleRate) / FRAME : 0;
    for (const band of fluxBins) {
      let rise = 0;
      for (let bin = band.bins[0]; bin <= band.bins[1]; bin += 1) {
        rise += Math.max(0, current[bin] - previous[bin]);
      }
      band.values[frame] = frame === 0 ? 0 : rise;
    }
    for (const band of energyBins) {
      let power = 0;
      for (let bin = band.bins[0]; bin <= band.bins[1]; bin += 1) {
        power += magnitudes[bin] ** 2;
      }
      band.values[frame] = power;
    }
    let low = 0;
    for (let bin = kickBins[0]; bin <= kickBins[1]; bin += 1) {
      low += magnitudes[bin];
    }
    kick[frame] = frame === 0 ? 0 : Math.max(0, low - previousLow);
    previousLow = low;
    let square = 0;
    for (let index = start; index < start + HOP; index += 1) {
      square += samples[index] ** 2;
    }
    rms[frame] = Math.sqrt(square / HOP);
    previous.set(current);
  });
  return {
    frameRate: sampleRate / HOP,
    flux: /** @type {BandSeries} */ (Object.fromEntries(fluxBins.map((band) => [band.name, band.values]))),
    energy: /** @type {SpectralFeatures['energy']} */ (
      Object.fromEntries(energyBins.map((band) => [band.name, band.values]))
    ),
    kick,
    centroid,
    rms,
  };
}

/**
 * The onset strength with its slow-moving level taken away, so a loud section does not outweigh the beat.
 * @param {Float32Array} series
 * @param {number} radius frames each side
 * @returns {Float32Array}
 */
function highPass(series, radius) {
  const result = new Float32Array(series.length);
  let sum = 0;
  let count = 0;
  for (let index = 0; index < Math.min(radius, series.length); index += 1) {
    sum += series[index];
    count += 1;
  }
  for (let index = 0; index < series.length; index += 1) {
    const enter = index + radius;
    const leave = index - radius - 1;
    if (enter < series.length) {
      sum += series[enter];
      count += 1;
    }
    if (leave >= 0) {
      sum -= series[leave];
      count -= 1;
    }
    result[index] = Math.max(0, series[index] - sum / count);
  }
  return result;
}

/**
 * @param {Float32Array} series
 * @param {number} position fractional index
 * @returns {number} linearly interpolated, 0 outside
 */
function sampleAt(series, position) {
  const index = Math.floor(position);
  if (index < 0 || index + 1 >= series.length) {
    return 0;
  }
  const fraction = position - index;
  return series[index] * (1 - fraction) + series[index + 1] * fraction;
}

/**
 * How strongly onsets line up with a steady beat at this tempo, at its best phase.
 * @param {Float32Array} onset
 * @param {number} period frames per beat
 * @returns {{ score: number, phase: number }}
 */
function combScore(onset, period, phaseStep = 0.5) {
  let best = { score: -Infinity, phase: 0 };
  for (let phase = 0; phase < period; phase += phaseStep) {
    let sum = 0;
    let count = 0;
    for (let position = phase; position < onset.length - 1; position += period) {
      sum += sampleAt(onset, position);
      count += 1;
    }
    const score = count > 0 ? sum / count : 0;
    if (score > best.score) {
      best = { score, phase };
    }
  }
  return best;
}

/**
 * The tempo and where the first beat falls. Electronic dance music keeps a steady tempo, so the beat that best fits
 * the whole track is searched for directly, coarse then fine, which is accurate to a few hundredths of a BPM.
 * @param {SpectralFeatures} features
 * @param {{ min?: number, max?: number }} [range] in BPM
 * @returns {{ bpm: number, phase: number, confidence: number }} `phase` in frames; `confidence` how far the beat stands
 *   above the average onset, in standard deviations (above about 1.5 is a clear beat)
 */
export function estimateTempo(features, { min = 90, max = 190 } = {}) {
  const { frameRate } = features;
  const onset = highPass(mixOnsets(features), Math.round(frameRate));
  const periodOf = (/** @type {number} */ bpm) => (frameRate * 60) / bpm;
  let best = { bpm: min, score: -Infinity, phase: 0 };
  for (let bpm = min; bpm <= max; bpm += 0.25) {
    const { score, phase } = combScore(onset, periodOf(bpm));
    if (score > best.score) {
      best = { bpm, score, phase };
    }
  }
  const coarse = best.bpm;
  for (let bpm = coarse - 0.3; bpm <= coarse + 0.3; bpm += 0.01) {
    const { score, phase } = combScore(onset, periodOf(bpm), 0.25);
    if (score > best.score) {
      best = { bpm, score, phase };
    }
  }
  // The beat found may sit on a sixteenth where the bass or the hats are busiest; the beat is where the kick hits.
  const period = periodOf(best.bpm);
  const kick = highPass(features.kick, Math.round(frameRate));
  const phases = [0, 1, 2, 3].map((quarter) => best.phase + (quarter * period) / 4);
  const kickAt = phases.map((phase) => {
    let sum = 0;
    let count = 0;
    for (let position = phase; position < kick.length - 1; position += period) {
      sum += peakNear(kick, position, 1);
      count += 1;
    }
    return count > 0 ? sum / count : 0;
  });
  const phase = phases[kickAt.indexOf(Math.max(...kickAt))] % period;
  const { mean, deviation } = meanAndDeviation(onset);
  return {
    bpm: Math.round(best.bpm * 100) / 100,
    phase,
    confidence: deviation > 0 ? Math.round(((best.score - mean) / deviation) * 100) / 100 : 0,
  };
}

/**
 * The low band (kick) counts double: it carries the beat in this music.
 * @param {SpectralFeatures} features
 * @returns {Float32Array}
 */
function mixOnsets(features) {
  const low = normalise(features.flux.low);
  const all = normalise(features.flux.all);
  return low.map((value, index) => 2 * value + all[index]);
}

/** @param {Float32Array} series @returns {Float32Array} scaled so its mean is 1 */
function normalise(series) {
  const { mean } = meanAndDeviation(series);
  return mean > 0 ? series.map((value) => value / mean) : new Float32Array(series.length);
}

/** @param {ArrayLike<number>} values */
function meanAndDeviation(values) {
  if (values.length === 0) {
    return { mean: 0, deviation: 0 };
  }
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
  }
  const mean = sum / values.length;
  let squares = 0;
  for (let index = 0; index < values.length; index += 1) {
    squares += (values[index] - mean) ** 2;
  }
  return { mean, deviation: Math.sqrt(squares / values.length) };
}

/**
 * @param {number[]} values
 * @param {number} fraction 0 to 1
 * @returns {number}
 */
export function percentile(values, fraction) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))];
}

/**
 * The strongest onset near a position, so an onset a frame early or late still counts.
 * @param {Float32Array} series
 * @param {number} position fractional frame
 * @param {number} radius frames
 */
function peakNear(series, position, radius) {
  let peak = 0;
  for (let index = Math.ceil(position - radius); index <= Math.floor(position + radius); index += 1) {
    if (index >= 0 && index < series.length) {
      peak = Math.max(peak, series[index]);
    }
  }
  return peak;
}

/**
 * Which beat starts the bar: the one where the sound changes most (parts come in and drop out on the one).
 * @param {SpectralFeatures} features
 * @param {number} phase frames
 * @param {number} period frames per beat
 * @returns {number} 0 to 3, beats after `phase`
 */
function downbeatOffset(features, phase, period) {
  const bands = Object.values(features.energy);
  const sums = [0, 0, 0, 0];
  const beats = Math.floor((features.rms.length - phase) / period);
  const windowOf = (/** @type {Float32Array} */ series, /** @type {number} */ from) => {
    let total = 0;
    for (
      let index = Math.max(0, Math.round(from));
      index < Math.min(series.length, Math.round(from + period));
      index += 1
    ) {
      total += series[index];
    }
    return Math.log10(1e-9 + total);
  };
  for (let beat = 1; beat < beats - 1; beat += 1) {
    const at = phase + beat * period;
    let change = 0;
    for (const series of bands) {
      change += Math.abs(windowOf(series, at) - windowOf(series, at - period));
    }
    sums[beat % 4] += change;
  }
  return sums.indexOf(Math.max(...sums));
}

/**
 * @typedef {{
 *   index: number,
 *   start: number,
 *   kick: number,
 *   hasKick: boolean,
 *   rmsDb: number,
 *   bands: Record<keyof typeof BALANCE_BANDS, number>,
 *   centroid: number,
 *   mid: number,
 * }} Bar `start` in frames; `kick` how hard the low end hits on the beats; `bands` in dB; `mid` mean mid-band onset
 */

/**
 * The bars of the track on the beat grid, with how loud, how bright and how much kick each one has.
 * @param {SpectralFeatures} features
 * @param {{ bpm: number, phase: number }} tempo
 * @returns {{ bars: Bar[], period: number, firstBar: number }} `period` frames per beat; `firstBar` in frames
 */
export function barGrid(features, tempo) {
  const period = (features.frameRate * 60) / tempo.bpm;
  const offset = downbeatOffset(features, tempo.phase, period);
  let firstBar = tempo.phase + offset * period;
  // A bar that started just before the audio begins still counts from its first beat in the audio.
  while (firstBar - 4 * period >= -period) {
    firstBar -= 4 * period;
  }
  const radius = Math.max(1, period / 8);
  /** @type {Bar[]} */
  const bars = [];
  for (let start = firstBar, index = 0; start + 4 * period <= features.rms.length; start += 4 * period, index += 1) {
    let kick = 0;
    for (let beat = 0; beat < 4; beat += 1) {
      kick += peakNear(features.kick, start + beat * period, radius);
    }
    const from = Math.max(0, Math.round(start));
    const to = Math.round(start + 4 * period);
    let square = 0;
    let centroid = 0;
    let mid = 0;
    const bands = /** @type {Bar['bands']} */ ({});
    for (const name of /** @type {(keyof typeof BALANCE_BANDS)[]} */ (Object.keys(BALANCE_BANDS))) {
      let power = 0;
      for (let frame = from; frame < to; frame += 1) {
        power += features.energy[name][frame];
      }
      bands[name] = Math.round(10 * Math.log10(1e-12 + power / (to - from)) * 10) / 10;
    }
    for (let frame = from; frame < to; frame += 1) {
      square += features.rms[frame] ** 2;
      centroid += features.centroid[frame];
      mid += features.flux.mid[frame];
    }
    bars.push({
      index,
      start,
      kick: kick / 4,
      hasKick: false,
      rmsDb: 10 * Math.log10(1e-12 + square / (to - from)),
      bands,
      centroid: centroid / (to - from),
      mid: mid / (to - from),
    });
  }
  const loudKick = percentile(
    bars.map((bar) => bar.kick),
    0.9,
  );
  for (const bar of bars) {
    bar.hasKick = loudKick > 0 && bar.kick >= 0.4 * loudKick;
  }
  return { bars, period, firstBar };
}

/**
 * How strongly each of the 16 steps of a bar is hit in one band, averaged over the bars with a kick (the main groove),
 * as 0 to 100 relative to the strongest step.
 * @param {Float32Array} series onset strength per frame
 * @param {Bar[]} bars
 * @param {number} period frames per beat
 * @returns {number[]} 16 values
 */
export function stepProfile(series, bars, period) {
  const grooveBars = bars.some((bar) => bar.hasKick) ? bars.filter((bar) => bar.hasKick) : bars;
  const sums = new Array(16).fill(0);
  const stepFrames = period / 4;
  for (const bar of grooveBars) {
    for (let step = 0; step < 16; step += 1) {
      sums[step] += peakNear(series, bar.start + step * stepFrames, Math.max(0.5, stepFrames * 0.3));
    }
  }
  const peak = Math.max(...sums);
  return sums.map((sum) => (peak > 0 ? Math.round((sum / peak) * 100) : 0));
}

/**
 * How late the off sixteenths (the second and fourth of each beat) land compared with the on ones, as a percentage of
 * a sixteenth: 0 is straight, about 33 is a triplet feel. Approximate: a busy mix blurs it.
 * @param {Float32Array} series onset strength per frame
 * @param {Bar[]} bars
 * @param {number} period frames per beat
 * @returns {number}
 */
export function estimateSwing(series, bars, period) {
  const stepFrames = period / 4;
  const centreOf = (/** @type {number} */ position) => {
    let weight = 0;
    let sum = 0;
    for (let index = Math.ceil(position - stepFrames / 2); index < position + stepFrames / 2; index += 1) {
      const value = index >= 0 && index < series.length ? series[index] : 0;
      weight += value;
      sum += value * (index - position);
    }
    return weight > 0 ? { offset: sum / weight, weight } : null;
  };
  const late = { on: 0, off: 0, onWeight: 0, offWeight: 0 };
  for (const bar of bars.filter((candidate) => candidate.hasKick)) {
    for (let step = 0; step < 16; step += 1) {
      const centre = centreOf(bar.start + step * stepFrames);
      if (!centre) {
        continue;
      }
      if (step % 2 === 0) {
        late.on += centre.offset * centre.weight;
        late.onWeight += centre.weight;
      } else {
        late.off += centre.offset * centre.weight;
        late.offWeight += centre.weight;
      }
    }
  }
  if (late.onWeight === 0 || late.offWeight === 0) {
    return 0;
  }
  const delay = late.off / late.offWeight - late.on / late.onWeight;
  return Math.max(0, Math.min(100, Math.round((delay / stepFrames) * 100)));
}

/**
 * Pitch-class strength over the whole track, from long frames: the harmony (80 Hz to 2 kHz) and the bass (35 to
 * 200 Hz) separately.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {{ chroma: number[], bassChroma: number[] }} each sums to 1
 */
export function chromaOf(samples, sampleRate) {
  const chroma = new Array(12).fill(0);
  const bassChroma = new Array(12).fill(0);
  const classOf = new Int8Array(PITCH_FRAME / 2 + 1).fill(-1);
  for (let bin = 1; bin <= PITCH_FRAME / 2; bin += 1) {
    const frequency = (bin * sampleRate) / PITCH_FRAME;
    if (frequency >= 35 && frequency <= 2000) {
      classOf[bin] = ((Math.round(69 + 12 * Math.log2(frequency / 440)) % 12) + 12) % 12;
    }
  }
  eachSpectrum(samples, PITCH_FRAME, PITCH_HOP, (magnitudes) => {
    for (let bin = 1; bin <= PITCH_FRAME / 2; bin += 1) {
      const pitchClass = classOf[bin];
      if (pitchClass < 0) {
        continue;
      }
      const frequency = (bin * sampleRate) / PITCH_FRAME;
      if (frequency >= 80) {
        chroma[pitchClass] += magnitudes[bin];
      }
      if (frequency <= 200) {
        bassChroma[pitchClass] += magnitudes[bin];
      }
    }
  });
  const toShares = (/** @type {number[]} */ values) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    return values.map((value) => (total > 0 ? value / total : 0));
  };
  return { chroma: toShares(chroma), bassChroma: toShares(bassChroma) };
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Pearson correlation
 */
function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let top = 0;
  let squaresA = 0;
  let squaresB = 0;
  for (let index = 0; index < a.length; index += 1) {
    top += (a[index] - meanA) * (b[index] - meanB);
    squaresA += (a[index] - meanA) ** 2;
    squaresB += (b[index] - meanB) ** 2;
  }
  return squaresA > 0 && squaresB > 0 ? top / Math.sqrt(squaresA * squaresB) : 0;
}

/**
 * The likely key: the root and major or minor from Krumhansl and Kessler's profiles, then the closest of BPMachina's
 * scales with the same third. The bass counts as much as the harmony, since in this music it states the root.
 * @param {{ chroma: number[], bassChroma: number[] }} pitch
 * @returns {{ root: string, scale: string, score: number, candidates: { root: string, mode: string, score: number }[],
 *   degrees: number[], bassRoots: { root: string, share: number }[] }} `degrees`: how strong each semitone above the
 *   root is, 0 to 100; `bassRoots`: the bass's strongest pitch classes
 */
export function estimateKey({ chroma, bassChroma }) {
  const heard = chroma.map((value, index) => value + bassChroma[index]);
  const candidates = [];
  for (let root = 0; root < 12; root += 1) {
    const rotated = heard.map((_, degree) => heard[(root + degree) % 12]);
    candidates.push({ root: NOTE_NAMES[root], mode: 'major', score: correlation(rotated, MAJOR_PROFILE) });
    candidates.push({ root: NOTE_NAMES[root], mode: 'minor', score: correlation(rotated, MINOR_PROFILE) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const rootIndex = NOTE_NAMES.indexOf(best.root);
  const degreesRaw = heard.map((_, degree) => heard[(rootIndex + degree) % 12]);
  const strongest = Math.max(...degreesRaw);
  const degrees = degreesRaw.map((value) => (strongest > 0 ? Math.round((value / strongest) * 100) : 0));
  const fitOf = (/** @type {number[]} */ intervals) => {
    const inside = new Set(intervals);
    const sumOf = (/** @type {boolean} */ wanted) =>
      degrees.filter((_, degree) => inside.has(degree) === wanted).reduce((sum, value) => sum + value, 0);
    return sumOf(true) / intervals.length - sumOf(false) / (12 - intervals.length);
  };
  // Another scale replaces plain major or minor only when it fits clearly better: the degrees that tell them apart
  // (the second, the sixth) are often quiet, and the kick's pitch sweep smears the low end.
  const family = SCALE_FAMILIES[/** @type {'major' | 'minor'} */ (best.mode)];
  let scale = best.mode;
  let scaleFit = fitOf(family[/** @type {keyof typeof family} */ (best.mode)]) + 8;
  for (const [name, intervals] of Object.entries(family)) {
    const fit = fitOf(intervals);
    if (fit > scaleFit) {
      scaleFit = fit;
      scale = name;
    }
  }
  const bassRoots = bassChroma
    .map((share, index) => ({ root: NOTE_NAMES[index], share: Math.round(share * 100) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
  const round = (/** @type {number} */ value) => Math.round(value * 100) / 100;
  return {
    root: best.root,
    scale,
    score: round(best.score),
    candidates: candidates.slice(0, 3).map((candidate) => ({ ...candidate, score: round(candidate.score) })),
    degrees,
    bassRoots,
  };
}

/**
 * Share of the energy in each band, in percent.
 * @param {SpectralFeatures} features
 * @returns {Record<keyof typeof BALANCE_BANDS, number> & { centroidHz: number }}
 */
export function spectralBalance(features) {
  const totals = Object.entries(features.energy).map(([name, values]) => [
    name,
    values.reduce((sum, value) => sum + value, 0),
  ]);
  const all = totals.reduce((sum, [, value]) => sum + Number(value), 0);
  const { mean } = meanAndDeviation(features.centroid);
  return /** @type {any} */ ({
    ...Object.fromEntries(totals.map(([name, value]) => [name, all > 0 ? Math.round((Number(value) / all) * 100) : 0])),
    centroidHz: Math.round(mean),
  });
}

/**
 * @param {Float32Array} samples
 * @returns {{ rmsDb: number, peakDb: number, crestDb: number }} dB relative to full scale; a small crest factor is a
 *   loud, compressed master
 */
export function loudness(samples) {
  let square = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    square += samples[index] ** 2;
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  const rmsDb = 10 * Math.log10(1e-12 + square / Math.max(1, samples.length));
  const peakDb = 20 * Math.log10(1e-12 + peak);
  const round = (/** @type {number} */ value) => Math.round(value * 10) / 10;
  return { rmsDb: round(rmsDb), peakDb: round(peakDb), crestDb: round(peakDb - rmsDb) };
}
