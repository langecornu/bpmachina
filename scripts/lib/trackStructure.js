// Finds a track's sections and how it moves between them, from the bars measured in audioFeatures.js: where the kick
// drops out and comes back, where the energy or the brightness steps up or down, and what happens in the bars before
// each change (a riser, a filter opening, a roll, a gap in the kick, a crash on the one). The section names are guesses
// from the kick and the energy, for Claude or the person to confirm by ear.
import { percentile } from './audioFeatures.js';

/** Sections are found on 4-bar blocks: this music changes on 4, 8 and 16-bar phrases. */
const BLOCK_BARS = 4;
/** A change this big between two blocks, in dB-like units, starts a new section. */
const CHANGE_THRESHOLD = 4;

/** @typedef {import('./audioFeatures.js').Bar} Bar */

/**
 * @typedef {{ startBar: number, bars: number, label: string, energy: number, kick: boolean }} Section `energy` 0 to 100
 *   within the track
 * @typedef {{ atBar: number, kinds: string[] }} Transition what happens going into the section that starts at `atBar`
 */

/**
 * @param {Bar[]} bars
 * @returns {(bar: Bar) => number} loudness as 0 to 100, from the track's quietest to its loudest bars
 */
function energyScale(bars) {
  const levels = bars.map((bar) => bar.rmsDb);
  const low = percentile(levels, 0.05);
  const high = percentile(levels, 0.95);
  return (bar) => (high > low ? Math.round(Math.max(0, Math.min(1, (bar.rmsDb - low) / (high - low))) * 100) : 50);
}

/**
 * @param {Bar[]} blockBars
 * @returns {{ kick: number, rms: number, low: number, high: number }}
 */
function blockFeatures(blockBars) {
  const mean = (/** @type {(bar: Bar) => number} */ pick) =>
    blockBars.reduce((sum, bar) => sum + pick(bar), 0) / blockBars.length;
  return {
    kick: mean((bar) => (bar.hasKick ? 1 : 0)),
    rms: mean((bar) => bar.rmsDb),
    low: mean((bar) => bar.bands.sub + bar.bands.bass) / 2,
    high: mean((bar) => bar.bands.high),
  };
}

/**
 * The energy and kick of the track in 4-bar blocks, compact enough to read: energy 0 to 100, and K or - for kick or
 * no kick.
 * @param {Bar[]} bars
 * @returns {{ energy: number[], kick: string }}
 */
export function energyCurve(bars) {
  const scale = energyScale(bars);
  const energy = [];
  let kick = '';
  for (let start = 0; start < bars.length; start += BLOCK_BARS) {
    const block = bars.slice(start, start + BLOCK_BARS);
    energy.push(Math.round(block.reduce((sum, bar) => sum + scale(bar), 0) / block.length));
    kick += block.filter((bar) => bar.hasKick).length * 2 >= block.length ? 'K' : '-';
  }
  return { energy, kick };
}

/**
 * Splits the bars into sections where the kick comes or goes or the sound changes clearly, and names each one.
 * @param {Bar[]} bars
 * @returns {Section[]}
 */
export function findSections(bars) {
  if (bars.length === 0) {
    return [];
  }
  const scale = energyScale(bars);
  const starts = [0];
  let previous = blockFeatures(bars.slice(0, BLOCK_BARS));
  for (let start = BLOCK_BARS; start < bars.length; start += BLOCK_BARS) {
    const current = blockFeatures(bars.slice(start, start + BLOCK_BARS));
    const kickFlips = Math.round(current.kick) !== Math.round(previous.kick);
    const change = Math.hypot(current.rms - previous.rms, current.low - previous.low, current.high - previous.high);
    if (kickFlips || change >= CHANGE_THRESHOLD) {
      starts.push(start);
    }
    previous = current;
  }
  const sections = starts.map((startBar, index) => {
    const end = starts[index + 1] ?? bars.length;
    const sectionBars = bars.slice(startBar, end);
    return {
      startBar,
      bars: end - startBar,
      label: '',
      energy: Math.round(sectionBars.reduce((sum, bar) => sum + scale(bar), 0) / sectionBars.length),
      kick: sectionBars.filter((bar) => bar.hasKick).length * 2 >= sectionBars.length,
    };
  });
  // Kickless stretches are one part however their level moves, so they are joined before naming; parts with a kick
  // stay split where the energy steps, which is what tells an intro from the groove.
  const joined = mergeAlike(
    sections.map((section) => ({ ...section, label: section.kick ? `kick ${section.startBar}` : '' })),
  );
  return mergeAlike(labelSections(joined));
}

/**
 * Joins neighbouring sections that read the same (kick or no kick, and the same name once named), so a part whose
 * energy wobbles is one section rather than several 4-bar pieces.
 * @param {Section[]} sections
 * @returns {Section[]}
 */
function mergeAlike(sections) {
  /** @type {Section[]} */
  const merged = [];
  for (const section of sections) {
    const last = merged[merged.length - 1];
    if (last && last.kick === section.kick && last.label === section.label) {
      const bars = last.bars + section.bars;
      merged[merged.length - 1] = {
        ...last,
        bars,
        energy: Math.round((last.energy * last.bars + section.energy * section.bars) / bars),
      };
    } else {
      merged.push(section);
    }
  }
  return merged;
}

/**
 * Names sections from their kick and energy: before the first full-kick part is the intro, a kickless part in the
 * middle a breakdown (a break when shorter than 8 bars), the kick part after one a drop, a quieter tail the outro, and
 * the rest the groove.
 * @param {Section[]} sections
 * @returns {Section[]}
 */
function labelSections(sections) {
  const peak = Math.max(...sections.map((section) => section.energy));
  return sections.map((section, index) => {
    const isFirst = index === 0;
    const isLast = index === sections.length - 1 && sections.length > 1;
    const before = sections[index - 1];
    let label = 'groove';
    if (isFirst && (!section.kick || section.energy < peak * 0.7)) {
      label = 'intro';
    } else if (isLast && (!section.kick || section.energy < peak * 0.7)) {
      label = 'outro';
    } else if (!section.kick) {
      label = section.bars >= 8 ? 'breakdown' : 'break';
    } else if (before && !before.kick && index > 1) {
      label = 'drop';
    }
    return { ...section, label };
  });
}

/**
 * @param {number[]} values
 * @returns {number} the slope of a straight-line fit, per item
 */
function slope(values) {
  const count = values.length;
  if (count < 2) {
    return 0;
  }
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let top = 0;
  let bottom = 0;
  values.forEach((value, index) => {
    top += (index - meanX) * (value - meanY);
    bottom += (index - meanX) ** 2;
  });
  return top / bottom;
}

/**
 * What happens in the bars leading into each section, and into each bar where the kick comes back after a short gap
 * (a one or two-bar gap before a new phrase is a transition even inside a section): `riser` (the highs climb at least 6 dB over 8 bars),
 * `filter-sweep` (the sound brightens by a third or more without getting much louder), `kick-gap` (the kick stops
 * for the last bar or two), `snare-roll` (the mids are hit far more often in the last bar), `drop` (the kick returns
 * after four bars or more without it) and `crash` (a burst of highs on the one).
 * @param {Bar[]} bars
 * @param {Section[]} sections
 * @param {{ highOnDownbeat: (bar: Bar) => number }} measure the high-band onset on a bar's first beat
 * @returns {Transition[]}
 */
export function findTransitions(bars, sections, { highOnDownbeat }) {
  const typicalMid = percentile(
    bars.map((bar) => bar.mid),
    0.5,
  );
  const typicalCrash = percentile(bars.map(highOnDownbeat), 0.5);
  const starts = new Map(sections.slice(1).map((section) => [section.startBar, section.kick]));
  bars.forEach((bar, index) => {
    const gap = bars.slice(Math.max(0, index - 3), index);
    if (bar.hasKick && !bars[index - 1]?.hasKick && gap.some((candidate) => candidate.hasKick) && !starts.has(index)) {
      starts.set(index, true);
    }
  });
  return [...starts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, hasKick]) => {
      const lead = bars.slice(Math.max(0, at - 8), at);
      const kinds = [];
      const highs = lead.map((bar) => bar.bands.high);
      if (lead.length >= 4 && slope(highs) * lead.length >= 6) {
        kinds.push('riser');
      }
      const brightness = lead.map((bar) => bar.centroid);
      const loudnessChange = Math.abs(lead[lead.length - 1].rmsDb - lead[0].rmsDb);
      if (lead.length >= 4 && brightness[0] > 0 && brightness[brightness.length - 1] / brightness[0] >= 1.33) {
        kinds.push(loudnessChange < 3 ? 'filter-sweep' : 'riser');
      }
      const last = bars[at - 1];
      const earlier = bars.slice(Math.max(0, at - 4), at - 2);
      if (last && !last.hasKick && hasKick && earlier.some((bar) => bar.hasKick)) {
        kinds.push('kick-gap');
      }
      if (last && typicalMid > 0 && last.mid >= 1.8 * typicalMid) {
        kinds.push('snare-roll');
      }
      const kickless = bars.slice(Math.max(0, at - 4), at);
      if (hasKick && kickless.length === 4 && kickless.every((bar) => !bar.hasKick)) {
        kinds.push('drop');
      }
      if (typicalCrash > 0 && highOnDownbeat(bars[at]) >= 2.5 * typicalCrash) {
        kinds.push('crash');
      }
      return { atBar: at, kinds: [...new Set(kinds)] };
    });
}
