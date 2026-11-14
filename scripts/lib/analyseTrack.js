// One track's measurements for the taste profile, and the summary of a whole folder of them (ADR 0012). The output is
// plain JSON in BPMachina's terms (BPM, keys, 16-step bars, sections in bars) so that Claude, in a chat, can read it
// and write the profile; it is never sent anywhere by this code.
import {
  barGrid,
  chromaOf,
  estimateKey,
  estimateSwing,
  estimateTempo,
  loudness,
  percentile,
  spectralBalance,
  spectralFeatures,
  stepProfile,
} from './audioFeatures.js';
import { energyCurve, findSections, findTransitions } from './trackStructure.js';

/**
 * @typedef {{
 *   durationSeconds: number,
 *   tempo: { bpm: number, confidence: number },
 *   key: ReturnType<typeof estimateKey>,
 *   bars: number,
 *   groove: { swing: number, kick: number[], low: number[], sub: number[], bass: number[], mid: number[], high: number[] },
 *   kick: { barsWithKick: number, fourOnTheFloor: boolean },
 *   balance: ReturnType<typeof spectralBalance>,
 *   loudness: ReturnType<typeof loudness>,
 *   energy: { energy: number[], kick: string },
 *   sections: import('./trackStructure.js').Section[],
 *   transitions: import('./trackStructure.js').Transition[],
 * }} TrackMeasures `groove`: how strongly each of the 16 steps of a bar is hit in each band, 0 to 100; `kick.barsWithKick`
 *   a percentage
 */

/**
 * Measures one decoded track.
 * @param {Float32Array} samples mono, -1 to 1
 * @param {number} sampleRate
 * @returns {TrackMeasures}
 */
export function analyseSamples(samples, sampleRate) {
  const features = spectralFeatures(samples, sampleRate);
  const tempo = estimateTempo(features);
  const { bars, period } = barGrid(features, tempo);
  const profile = (/** @type {Float32Array} */ series) => stepProfile(series, bars, period);
  const kick = profile(features.kick);
  const low = profile(features.flux.low);
  const sections = findSections(bars);
  const highOnDownbeat = (/** @type {import('./audioFeatures.js').Bar | undefined} */ bar) => {
    if (!bar) {
      return 0;
    }
    const index = Math.round(bar.start);
    return Math.max(features.flux.high[index] ?? 0, features.flux.high[index + 1] ?? 0);
  };
  const withKick = bars.filter((bar) => bar.hasKick).length;
  return {
    durationSeconds: Math.round(samples.length / sampleRate),
    tempo: { bpm: tempo.bpm, confidence: tempo.confidence },
    key: estimateKey(chromaOf(samples, sampleRate)),
    bars: bars.length,
    groove: {
      swing: estimateSwing(features.flux.all, bars, period),
      kick,
      low,
      sub: profile(features.flux.sub),
      bass: profile(features.flux.bass),
      mid: profile(features.flux.mid),
      high: profile(features.flux.high),
    },
    kick: {
      barsWithKick: bars.length > 0 ? Math.round((withKick / bars.length) * 100) : 0,
      fourOnTheFloor: [0, 4, 8, 12].every((step) => kick[step] >= 60),
    },
    balance: spectralBalance(features),
    loudness: loudness(samples),
    energy: energyCurve(bars),
    sections,
    transitions: findTransitions(bars, sections, { highOnDownbeat }),
  };
}

/**
 * @param {Record<string, number>} counts
 * @param {number} [limit]
 * @returns {{ name: string, count: number }[]} most common first
 */
function ranked(counts, limit = 6) {
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * @param {number[][]} profiles 16 values each
 * @returns {number[]} the mean of each step, 0 to 100
 */
function meanProfile(profiles) {
  if (profiles.length === 0) {
    return [];
  }
  return Array.from({ length: 16 }, (_, step) =>
    Math.round(profiles.reduce((sum, profile) => sum + (profile[step] ?? 0), 0) / profiles.length),
  );
}

/**
 * What the tracks have in common, so Claude starts from the overall picture before reading each track.
 * @param {{ measures?: TrackMeasures }[]} tracks
 */
export function summariseTracks(tracks) {
  const measured = tracks.flatMap((track) => (track.measures ? [track.measures] : []));
  const steady = measured.filter((measures) => measures.tempo.confidence >= 1);
  const bpms = steady.map((measures) => measures.tempo.bpm);
  /** @type {Record<string, number>} */
  const keys = {};
  /** @type {Record<string, number>} */
  const sectionCounts = {};
  /** @type {Record<string, number[]>} */
  const sectionBars = {};
  /** @type {Record<string, number>} */
  const transitions = {};
  for (const measures of measured) {
    const key = `${measures.key.root} ${measures.key.scale}`;
    keys[key] = (keys[key] ?? 0) + 1;
    for (const section of measures.sections) {
      sectionCounts[section.label] = (sectionCounts[section.label] ?? 0) + 1;
      (sectionBars[section.label] ??= []).push(section.bars);
    }
    for (const transition of measures.transitions) {
      for (const kind of transition.kinds) {
        transitions[kind] = (transitions[kind] ?? 0) + 1;
      }
    }
  }
  const median = (/** @type {number[]} */ values) => (values.length > 0 ? percentile(values, 0.5) : null);
  const balanceKeys = /** @type {(keyof TrackMeasures['balance'])[]} */ (
    measured.length > 0 ? Object.keys(measured[0].balance) : []
  );
  return {
    tracks: tracks.length,
    measured: measured.length,
    tempo: {
      steadyTracks: steady.length,
      median: median(bpms),
      low: bpms.length > 0 ? percentile(bpms, 0.1) : null,
      high: bpms.length > 0 ? percentile(bpms, 0.9) : null,
    },
    keys: ranked(keys),
    groove: {
      swing: median(measured.map((measures) => measures.groove.swing)),
      kick: meanProfile(measured.map((measures) => measures.groove.kick)),
      low: meanProfile(measured.map((measures) => measures.groove.low)),
      sub: meanProfile(measured.map((measures) => measures.groove.sub)),
      bass: meanProfile(measured.map((measures) => measures.groove.bass)),
      mid: meanProfile(measured.map((measures) => measures.groove.mid)),
      high: meanProfile(measured.map((measures) => measures.groove.high)),
      fourOnTheFloor: measured.filter((measures) => measures.kick.fourOnTheFloor).length,
    },
    balance: Object.fromEntries(
      balanceKeys.map((name) => [name, median(measured.map((measures) => measures.balance[name]))]),
    ),
    crestDb: median(measured.map((measures) => measures.loudness.crestDb)),
    lengthBars: median(measured.map((measures) => measures.bars)),
    sections: Object.fromEntries(
      Object.entries(sectionBars).map(([label, lengths]) => [
        label,
        { count: sectionCounts[label], medianBars: median(lengths) },
      ]),
    ),
    transitions: ranked(transitions, 10),
  };
}
