// Tests of the phase 1 audio analysis (scripts/analyse-tracks.js, ADR 0010) on synthetic tracks with known answers:
// tempo, the kick on the beat and the rolling bass after it, offbeat hats, swing, key, sections and transitions, plus
// the folder walk (audio only, no links, capped) and the measurements file, with a stand-in decoder so no test needs
// ffmpeg.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { analyseFolder, listTracks, resolveFolder } from '../../scripts/lib/analyseFolder.js';
import { analyseSamples, summariseTracks } from '../../scripts/lib/analyseTrack.js';
import { estimateKey, fft, loudness, percentile } from '../../scripts/lib/audioFeatures.js';
import { decodeAudio, readTags } from '../../scripts/lib/decodeAudio.js';
import { findSections, findTransitions } from '../../scripts/lib/trackStructure.js';
import { synthTrack } from './synthTrack.js';

const RATE = 22050;

/** @param {number[]} profile @returns {number[]} the steps at 80 or more */
const strongSteps = (profile) => profile.flatMap((value, step) => (value >= 80 ? [step] : []));

describe('Audio features', () => {
  let straight;
  let swung;

  before(() => {
    straight = analyseSamples(synthTrack(), RATE);
    swung = analyseSamples(synthTrack({ bpm: 145.5, swing: 0.3, gapBars: [15] }), RATE);
  });

  it('finds the tempo to a tenth of a BPM, with a clear beat', () => {
    assert.ok(Math.abs(straight.tempo.bpm - 142) <= 0.1, `142 BPM, measured ${straight.tempo.bpm}`);
    assert.ok(Math.abs(swung.tempo.bpm - 145.5) <= 0.1, `145.5 BPM, measured ${swung.tempo.bpm}`);
    assert.ok(straight.tempo.confidence >= 1.5, 'the beat stands out');
  });

  it('puts the kick on the beats, the hats on the offbeats and the bass after the kick', () => {
    assert.deepEqual(strongSteps(straight.groove.kick), [0, 4, 8, 12]);
    assert.deepEqual(strongSteps(straight.groove.high), [2, 6, 10, 14]);
    assert.ok(straight.kick.fourOnTheFloor);
    for (const beat of [0, 4, 8, 12]) {
      assert.ok(straight.groove.kick[beat + 1] < 50, 'the bass is far quieter than the kick in the kick profile');
      assert.ok(straight.groove.bass[beat + 1] >= 50, 'the bass band is hit on the sixteenth after the kick');
    }
  });

  it('hears swing only when the off sixteenths are late', () => {
    assert.ok(straight.groove.swing <= 5, `straight, measured ${straight.groove.swing}`);
    assert.ok(swung.groove.swing >= 10, `swung, measured ${swung.groove.swing}`);
  });

  it('finds an E minor key from the pad and the bass', () => {
    assert.equal(`${straight.key.root} ${straight.key.scale}`, 'E minor');
    assert.equal(straight.key.bassRoots[0].root, 'E');
    assert.equal(straight.key.degrees.length, 12);
  });

  it('finds the kickless intro, the drop into the groove and a bar without the kick', () => {
    assert.equal(straight.sections[0].label, 'intro');
    assert.equal(straight.sections[0].kick, false);
    assert.equal(straight.sections[1].startBar, 8);
    assert.ok(straight.transitions[0].kinds.includes('drop'));
    assert.equal(straight.energy.kick.slice(0, 3), '--K');
    assert.ok(swung.transitions.some((transition) => transition.kinds.includes('kick-gap')));
  });

  it('measures the balance and the loudness', () => {
    assert.ok(straight.balance.sub + straight.balance.bass > 80, 'a bass-heavy mix');
    const sine = new Float32Array(RATE).map((_, index) => 0.5 * Math.sin(index / 10));
    const level = loudness(sine);
    assert.ok(Math.abs(level.peakDb + 6) < 0.1 && Math.abs(level.crestDb - 3) < 0.1, 'a sine has a 3 dB crest');
  });

  it('summarises a folder of tracks', () => {
    const summary = summariseTracks([{ measures: straight }, { measures: swung }, { error: 'unreadable' }]);
    assert.equal(summary.tracks, 3);
    assert.equal(summary.measured, 2);
    assert.ok(summary.tempo.median !== null && summary.tempo.median >= 142);
    assert.equal(summary.keys[0].name, 'E minor');
    assert.deepEqual(strongSteps(summary.groove.kick), [0, 4, 8, 12]);
    assert.equal(summary.groove.fourOnTheFloor, 2);
    assert.ok(summary.sections.intro.count === 2);
    assert.equal(summariseTracks([]).tempo.median, null);
  });
});

describe('Audio feature helpers', () => {
  it('transforms a sine into one bin', () => {
    const size = 64;
    const re = Float64Array.from({ length: size }, (_, index) => Math.cos((2 * Math.PI * 5 * index) / size));
    const im = new Float64Array(size);
    fft(re, im);
    assert.ok(Math.abs(re[5] - size / 2) < 1e-9 && Math.abs(re[4]) < 1e-9);
  });

  it('takes percentiles and refines a minor key to phrygian only when its flat second is clear', () => {
    assert.equal(percentile([5, 1, 3], 0.5), 3);
    assert.equal(percentile([], 0.5), 0);
    const phrygian = [10, 9, 0, 8, 0, 7, 0, 9, 7, 0, 7, 0];
    const key = estimateKey({ chroma: phrygian, bassChroma: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    assert.equal(`${key.root} ${key.scale}`, 'C phrygian');
  });

  it('labels a breakdown, a short break, a riser, a filter sweep, a roll and a crash', () => {
    const bar = (
      /** @type {number} */ index,
      /** @type {Partial<import('../../scripts/lib/audioFeatures.js').Bar>} */ values,
    ) => ({
      index,
      start: index * 100,
      kick: 1,
      hasKick: true,
      rmsDb: -10,
      bands: { sub: -10, bass: -10, lowMid: -20, highMid: -25, high: -30 },
      centroid: 1000,
      mid: 1,
      ...values,
    });
    const bars = [
      ...Array.from({ length: 8 }, (_, index) => bar(index, { rmsDb: -20, hasKick: false })),
      ...Array.from({ length: 8 }, (_, index) =>
        bar(8 + index, { bands: { sub: -10, bass: -10, lowMid: -20, highMid: -25, high: -30 + index * 1.5 } }),
      ),
      ...Array.from({ length: 8 }, (_, index) => bar(16 + index, { hasKick: false })),
      ...Array.from({ length: 4 }, (_, index) =>
        bar(24 + index, { centroid: 1000 + index * 300, mid: index === 3 ? 4 : 1 }),
      ),
      ...Array.from({ length: 4 }, (_, index) => bar(28 + index, { hasKick: false })),
      ...Array.from({ length: 8 }, (_, index) => bar(32 + index, {})),
    ];
    const sections = findSections(bars);
    assert.deepEqual(
      sections.map((section) => `${section.label}:${section.bars}`),
      ['intro:8', 'groove:8', 'breakdown:8', 'drop:4', 'break:4', 'drop:8'],
    );
    const transitions = findTransitions(bars, sections, {
      highOnDownbeat: (candidate) => (candidate?.index === 32 ? 10 : 1),
    });
    const at = (/** @type {number} */ barIndex) =>
      transitions.find((transition) => transition.atBar === barIndex)?.kinds;
    assert.ok(at(16)?.includes('riser'));
    assert.ok(at(28)?.includes('filter-sweep') && at(28)?.includes('snare-roll'));
    assert.ok(at(32)?.includes('crash') && at(32)?.includes('drop'));
    assert.deepEqual(findSections([]), []);
  });
});

describe('Folder of tracks', () => {
  let root;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'bpmachina-tracks-'));
    await mkdir(path.join(root, 'Psy', 'Deep'), { recursive: true });
    await writeFile(path.join(root, 'Psy', 'one.mp3'), 'audio');
    await writeFile(path.join(root, 'Psy', 'Deep', 'two.FLAC'), 'audio');
    await writeFile(path.join(root, 'Psy', 'short.wav'), 'audio');
    await writeFile(path.join(root, 'Psy', 'cover.jpg'), 'image');
    await writeFile(path.join(root, 'Psy', '.hidden.mp3'), 'audio');
    await writeFile(path.join(root, 'Psy', 'empty.mp3'), '');
    await writeFile(path.join(root, 'outside.mp3'), 'audio');
    await symlink(path.join(root, 'outside.mp3'), path.join(root, 'Psy', 'link.mp3'));
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('checks the folder the person names', async () => {
    assert.equal(await resolveFolder('~/Psy', { home: root }), await resolveFolder(path.join(root, 'Psy')));
    await assert.rejects(resolveFolder(''), /Name the folder/);
    await assert.rejects(resolveFolder(path.join(root, 'missing')), /There is no folder/);
    await assert.rejects(resolveFolder(path.join(root, 'outside.mp3')), /is a file/);
  });

  it('lists audio files only, skipping links, hidden and empty files, up to the limit', async () => {
    const folder = await resolveFolder(path.join(root, 'Psy'));
    const files = (await listTracks(folder, { limit: 10 })).map((file) => file.file);
    assert.deepEqual(files, [path.join('Deep', 'two.FLAC'), 'one.mp3', 'short.wav']);
    assert.equal((await listTracks(folder, { limit: 1 })).length, 1);
  });

  it('writes the measurements, keeps unchanged tracks on update, and records what could not be read', async () => {
    const out = path.join(root, 'data', 'analysis.json');
    const decoded = [];
    const decode = async (/** @type {string} */ file) => {
      decoded.push(path.basename(file));
      if (file.endsWith('two.FLAC')) {
        throw new Error('ffmpeg could not read the file');
      }
      return file.endsWith('short.wav') ? new Float32Array(RATE) : synthTrack({ bars: 16, introBars: 4 });
    };
    const first = await analyseFolder({
      folder: path.join(root, 'Psy'),
      out,
      decode,
      tags: async (file) => (file.endsWith('one.mp3') ? { title: 'One' } : {}),
      now: () => new Date('2026-11-13T12:00:00Z'),
    });
    assert.deepEqual([first.measured, first.kept, first.failed], [1, 0, 2]);
    const saved = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(saved.folder, 'Psy', 'only the folder name is recorded, not where it is');
    assert.equal(saved.createdAt, '2026-11-13T12:00:00.000Z');
    assert.equal(saved.tracks.find((/** @type {any} */ track) => track.file === 'one.mp3').tags.title, 'One');
    assert.match(saved.tracks.find((/** @type {any} */ track) => track.file === 'short.wav').error, /Shorter/);
    decoded.length = 0;
    const second = await analyseFolder({ folder: path.join(root, 'Psy'), out, decode, update: true });
    assert.equal(second.kept, 1);
    assert.ok(!decoded.includes('one.mp3'), 'an unchanged track is not decoded again');
    await assert.rejects(analyseFolder({ folder: path.join(root, 'data'), out, decode }), /No audio files/);
  });

  it('explains when ffmpeg is missing', async () => {
    const file = path.join(root, 'Psy', 'one.mp3');
    await assert.rejects(
      decodeAudio(file, { sampleRate: RATE, maxSeconds: 1, ffmpeg: 'bpmachina-no-such-ffmpeg' }),
      /is not installed/,
    );
    await assert.rejects(readTags(file, { ffprobe: 'bpmachina-no-such-ffprobe' }), /is not installed/);
  });
});
