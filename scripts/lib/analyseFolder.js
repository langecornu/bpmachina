// Turns a folder of tracks the person loves into one measurements file (ADR 0012, docs/TASTE.md). The folder must be
// a real folder on this computer; symbolic links are skipped, so the walk never leaves it; only audio files are read,
// and the counts, depth and sizes are capped. With `update`, tracks already measured (same name, size and date) are
// kept rather than measured again.
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { analyseSamples, summariseTracks } from './analyseTrack.js';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aif', '.aiff', '.m4a', '.aac', '.ogg', '.opus']);
export const MEASUREMENTS_VERSION = 1;

const SAMPLE_RATE = 22050;
const MAX_SECONDS = 15 * 60;
const MAX_DEPTH = 4;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const CONCURRENCY = 2;

/**
 * @typedef {{ file: string, size: number, modified: string, tags?: Record<string, string>,
 *   measures?: import('./analyseTrack.js').TrackMeasures, error?: string }} TrackEntry `file` relative to the folder
 */

/**
 * The folder the person named, checked: `~` is their home, and it must exist and be a folder.
 * @param {string} input
 * @param {{ home?: string, cwd?: string }} [options]
 * @returns {Promise<string>} its real absolute path
 * @throws {Error} with a plain message when it is not a folder that can be read
 */
export async function resolveFolder(input, { home = os.homedir(), cwd = process.cwd() } = {}) {
  if (typeof input !== 'string' || !input.trim() || input.length > 1024 || input.includes('\0')) {
    throw new Error('Name the folder of tracks to analyse, for example: ~/Music/Psytrance');
  }
  const expanded =
    input.trim() === '~' || input.trim().startsWith('~/') ? path.join(home, input.trim().slice(1)) : input.trim();
  let real;
  try {
    real = await realpath(path.resolve(cwd, expanded));
  } catch {
    throw new Error(`There is no folder at ${input}.`);
  }
  if (!(await stat(real)).isDirectory()) {
    throw new Error(`${input} is a file, not a folder. Name the folder that holds the tracks.`);
  }
  return real;
}

/**
 * The audio files in a folder and its subfolders, sorted, without following links or hidden files.
 * @param {string} folder a real absolute path from resolveFolder
 * @param {{ limit: number }} options
 * @returns {Promise<{ path: string, file: string, size: number, modified: string }[]>}
 */
export async function listTracks(folder, { limit }) {
  /** @type {{ path: string, file: string, size: number, modified: string }[]} */
  const found = [];
  /** @param {string} directory @param {number} depth */
  const walk = async (directory, depth) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= limit || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < MAX_DEPTH) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const info = await lstat(full);
        if (info.size > 0 && info.size <= MAX_FILE_BYTES) {
          found.push({
            path: full,
            file: path.relative(folder, full),
            size: info.size,
            modified: info.mtime.toISOString(),
          });
        }
      }
    }
  };
  await walk(folder, 0);
  return found;
}

/**
 * @param {string} file
 * @returns {Promise<TrackEntry[]>} the tracks of an earlier run, or none
 */
async function previousTracks(file) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    return saved?.version === MEASUREMENTS_VERSION && Array.isArray(saved.tracks) ? saved.tracks : [];
  } catch {
    return [];
  }
}

/**
 * Runs `work` on every item, a few at a time, keeping the order.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} work
 * @returns {Promise<R[]>}
 */
async function inPool(items, work) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

/**
 * Measures every track in the folder and writes the measurements file.
 * @param {{
 *   folder: string,
 *   out: string,
 *   limit?: number,
 *   update?: boolean,
 *   decode: (file: string, options: { sampleRate: number, maxSeconds: number }) => Promise<Float32Array>,
 *   tags?: (file: string) => Promise<Record<string, string>>,
 *   onProgress?: (message: string) => void,
 *   now?: () => Date,
 * }} options `decode` and `tags` read the files (scripts/lib/decodeAudio.js), replaced in tests
 * @returns {Promise<{ out: string, summary: ReturnType<typeof summariseTracks>, measured: number, kept: number,
 *   failed: number }>}
 */
export async function analyseFolder({
  folder,
  out,
  limit = 200,
  update = false,
  decode,
  tags = async () => ({}),
  onProgress = () => {},
  now = () => new Date(),
}) {
  const root = await resolveFolder(folder);
  const files = await listTracks(root, { limit });
  if (files.length === 0) {
    throw new Error(`No audio files in ${folder} (looked for ${[...AUDIO_EXTENSIONS].join(', ')}).`);
  }
  const earlier = update ? new Map((await previousTracks(out)).map((track) => [track.file, track])) : new Map();
  let kept = 0;
  const tracks = await inPool(files, async (file, index) => {
    const known = earlier.get(file.file);
    if (known?.measures && known.size === file.size && known.modified === file.modified) {
      kept += 1;
      return known;
    }
    onProgress(`[${index + 1}/${files.length}] ${file.file}`);
    /** @type {TrackEntry} */
    const entry = { file: file.file, size: file.size, modified: file.modified };
    try {
      const [samples, fileTags] = await Promise.all([
        decode(file.path, { sampleRate: SAMPLE_RATE, maxSeconds: MAX_SECONDS }),
        tags(file.path).catch(() => ({})),
      ]);
      if (Object.keys(fileTags).length > 0) {
        entry.tags = fileTags;
      }
      if (samples.length < SAMPLE_RATE * 20) {
        entry.error = 'Shorter than 20 seconds, so it was not measured.';
      } else {
        entry.measures = analyseSamples(samples, SAMPLE_RATE);
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message.slice(0, 200) : 'Could not be read.';
    }
    return entry;
  });
  const summary = summariseTracks(tracks);
  const document = {
    version: MEASUREMENTS_VERSION,
    createdAt: now().toISOString(),
    folder: path.basename(root),
    note: 'Measured on this computer by scripts/analyse-tracks.js. Estimates from the mixed audio; see docs/TASTE.md.',
    summary,
    tracks,
  };
  await mkdir(path.dirname(out), { recursive: true });
  const temp = `${out}.tmp`;
  await writeFile(temp, `${JSON.stringify(document, null, 1)}\n`, 'utf8');
  await rename(temp, out);
  return {
    out,
    summary,
    measured: tracks.filter((track) => track.measures).length - kept,
    kept,
    failed: tracks.filter((track) => track.error).length,
  };
}
