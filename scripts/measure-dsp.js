// Measures what the Faust synth voices cost and how loud they are, in Node, with the same compiled voices, voice pools
// and event handling the browser's audio thread runs (V8 runs the WebAssembly in both). Renders a dense song, every
// synth instrument busy at once, in 128-sample quanta as Web Audio does, and reports the time each instrument takes as a
// share of real time, plus its peak and loudness. Optionally writes each instrument's render as a WAV file to listen to.
//   npm run measure:dsp                 (or: node scripts/measure-dsp.js 145 [wav-directory])
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FaustVoice } from '../src/audio/faust/faustVoice.js';
import { DSP_LAYOUTS } from '../src/audio/faust/generated/layout.js';
import { FAUST_INSTRUMENTS, controlsOf } from '../src/audio/faust/noteParams.js';
import { POLYPHONY } from '../src/audio/faust/polyphony.js';
import { SynthCore } from '../src/audio/faust/synthCore.js';

const GENERATED = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/audio/faust/generated');
const RATE = 48000;
const QUANTUM = 128;
const BARS = 8;

/**
 * A dense song's worth of notes per instrument, as [step, length in steps, pitch, gain] at sixteenths: a rolling bass
 * on every off-sixteenth, an acid line on every sixteenth, a lead in eighths, a pluck arpeggio on every sixteenth,
 * four-note keys and pad chords, and a riser over the last two bars.
 * @param {string} instrument
 * @returns {[number, number, number, number][]}
 */
function patternOf(instrument) {
  const steps = BARS * 16;
  /** @type {[number, number, number, number][]} */
  const notes = [];
  for (let step = 0; step < steps; step += 1) {
    const chord = [57, 60, 64, 67].map((pitch) => pitch + (Math.floor(step / 16) % 2) * 2);
    if (instrument === 'bass' && step % 4 !== 0) {
      notes.push([step, 1, 33 + (step % 3 === 0 ? 0 : 12), 0.9]);
    } else if (instrument === 'acid') {
      notes.push([step, 1, 45 + [0, 12, 3, 15, 7, 0, 10, 12][step % 8], step % 4 === 2 ? 1 : 0.7]);
    } else if (instrument === 'lead' && step % 2 === 0) {
      notes.push([step, 2, 69 + [0, 3, 7, 12][(step / 2) % 4], 0.8]);
    } else if (instrument === 'pluck') {
      notes.push([step, 1, chord[step % 4] + 12, 0.75]);
    } else if ((instrument === 'keys' || instrument === 'pad') && step % 16 === 0) {
      for (const pitch of chord) {
        notes.push([step, instrument === 'pad' ? 16 : 6, pitch, 0.7]);
      }
    } else if (instrument === 'pad' && step % 16 === 10) {
      // Hard trance stabs between the held chords.
      for (const pitch of chord) {
        notes.push([step, 1, pitch + 12, 0.9]);
      }
    } else if (instrument === 'fx' && step === steps - 32) {
      notes.push([step, 32, 60, 0.8]);
    }
  }
  return notes;
}

/**
 * @param {Float32Array} left
 * @param {Float32Array} right
 * @param {number} rate
 * @returns {Buffer} a 16-bit stereo WAV file
 */
function wav(left, right, rate) {
  const data = Buffer.alloc(left.length * 4);
  for (let index = 0; index < left.length; index += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[index])) * 32767), index * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[index])) * 32767), index * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * Renders an instrument's part of the dense song, quantum by quantum, timing only the rendering.
 * @param {string} instrument
 * @param {WebAssembly.Module} module
 * @param {number} stepSeconds
 * @param {number} quanta
 */
function render(instrument, module, stepSeconds, quanta) {
  const voices = Array.from(
    { length: POLYPHONY[instrument] },
    () => new FaustVoice(module, DSP_LAYOUTS[instrument], RATE),
  );
  const core = new SynthCore(voices, RATE);
  let id = 0;
  let seed = 1;
  const notes = patternOf(instrument);
  for (const [step, length, pitch, gain] of notes) {
    const note = { time: 0.01 + step * stepSeconds, duration: length * stepSeconds, pitch, gain };
    seed = (seed * 16807) % 2147483647;
    const controls = controlsOf(instrument, note, () => (seed % 1000) / 1000);
    id += 1;
    core.receive({ type: 'on', id, time: note.time, params: controls.params, tail: controls.tail });
    core.receive({ type: 'off', id, time: controls.end });
  }
  const left = new Float32Array(quanta * QUANTUM);
  const right = new Float32Array(quanta * QUANTUM);
  let busiest = 0;
  const started = process.hrtime.bigint();
  for (let quantum = 0; quantum < quanta; quantum += 1) {
    const offset = quantum * QUANTUM;
    core.render(offset, left.subarray(offset, offset + QUANTUM), right.subarray(offset, offset + QUANTUM));
    busiest = Math.max(busiest, core.activeVoices);
  }
  const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
  return { elapsed, busiest, notes: notes.length, left, right };
}

async function main() {
  const bpm = Number(process.argv[2] ?? 145);
  const wavDirectory = process.argv[3];
  const stepSeconds = 60 / bpm / 4;
  const seconds = BARS * 16 * stepSeconds + 1;
  const quanta = Math.ceil((seconds * RATE) / QUANTUM);
  console.log(`${BARS} bars at ${bpm} BPM (${seconds.toFixed(1)} s of audio), ${RATE} Hz, ${QUANTUM}-sample quanta`);
  let total = 0;
  for (const instrument of FAUST_INSTRUMENTS) {
    const module = new WebAssembly.Module(await readFile(path.join(GENERATED, `${instrument}.wasm`)));
    // The first pass warms up the WebAssembly compiler's optimising tier; the second is timed.
    render(instrument, module, stepSeconds, quanta);
    const { elapsed, busiest, notes, left, right } = render(instrument, module, stepSeconds, quanta);
    total += elapsed;
    let peak = 0;
    let energy = 0;
    for (let index = 0; index < left.length; index += 1) {
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
      energy += left[index] ** 2 + right[index] ** 2;
    }
    const rms = Math.sqrt(energy / (2 * left.length));
    console.log(
      `${instrument.padEnd(6)} ${String(notes).padStart(4)} notes, up to ${busiest}/${POLYPHONY[instrument]} voices: ` +
        `${((elapsed / seconds) * 100).toFixed(2).padStart(5)}% of real time, peak ${peak.toFixed(2)}, ` +
        `RMS ${(20 * Math.log10(rms || 1e-9)).toFixed(1)} dBFS${Number.isFinite(peak) ? '' : '  NOT FINITE'}`,
    );
    if (wavDirectory) {
      await writeFile(path.join(wavDirectory, `${instrument}.wav`), wav(left, right, RATE));
    }
  }
  console.log(`All seven at once: ${((total / seconds) * 100).toFixed(2)}% of one core's real time`);
}

main().catch((error) => {
  console.error(`Measurement failed: ${error.message}`);
  process.exitCode = 1;
});
