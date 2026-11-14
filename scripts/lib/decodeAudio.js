// Decodes an audio file to mono samples, and reads its tags, with the ffmpeg and ffprobe programs installed on this
// computer (docs/TASTE.md). They run as separate programs with an argument list (no shell), may only open local files
// (no network, no playlists that point elsewhere), and are stopped after a time limit. Nothing is uploaded.
import { spawn } from 'node:child_process';

const DECODE_TIMEOUT_MS = 180_000;
const TAG_LENGTH = 120;

/**
 * Runs a program and collects what it prints, up to a limit.
 * @param {string} command
 * @param {string[]} args
 * @param {{ maxBytes: number, timeoutMs: number }} limits
 * @returns {Promise<Buffer>}
 */
function run(command, args, { maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    // Its own timer rather than spawn's `timeout`, which keeps the process alive after a program that is not installed.
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let errorText = '';
    child.stdout.on('data', (/** @type {Buffer} */ chunk) => {
      if (size + chunk.length > maxBytes) {
        chunks.push(chunk.subarray(0, maxBytes - size));
        size = maxBytes;
        child.kill();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    child.stderr.on('data', (/** @type {Buffer} */ chunk) => {
      errorText = `${errorText}${chunk}`.slice(-400);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
          ? new Error(`${command} is not installed. Install ffmpeg (see docs/TASTE.md) and try again.`)
          : error,
      );
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0 || size >= maxBytes) {
        resolve(Buffer.concat(chunks, size));
      } else {
        reject(
          new Error(
            `${command} could not read the file (${signal ?? code}): ${errorText.trim().split('\n').pop() ?? ''}`,
          ),
        );
      }
    });
  });
}

/**
 * @param {string} file an absolute path, so it can never be read as an option
 * @param {{ sampleRate: number, maxSeconds: number, ffmpeg?: string }} options
 * @returns {Promise<Float32Array>} mono, -1 to 1, at most `maxSeconds` long
 */
export async function decodeAudio(file, { sampleRate, maxSeconds, ffmpeg = 'ffmpeg' }) {
  const args = [
    '-nostdin',
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-i',
    file,
    '-t',
    String(maxSeconds),
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-f',
    'f32le',
    'pipe:1',
  ];
  const bytes = await run(ffmpeg, args, { maxBytes: maxSeconds * sampleRate * 4, timeoutMs: DECODE_TIMEOUT_MS });
  const samples = new Float32Array(Math.floor(bytes.length / 4));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = bytes.readFloatLE(index * 4);
  }
  return samples;
}

/**
 * The title, artist, album and genre tags, when the file has them.
 * @param {string} file an absolute path
 * @param {{ ffprobe?: string }} [options]
 * @returns {Promise<Record<string, string>>}
 */
export async function readTags(file, { ffprobe = 'ffprobe' } = {}) {
  const args = [
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-show_entries',
    'format_tags=title,artist,album,genre',
    '-of',
    'json',
    file,
  ];
  const output = await run(ffprobe, args, { maxBytes: 64 * 1024, timeoutMs: 20_000 });
  const tags = JSON.parse(output.toString('utf8'))?.format?.tags ?? {};
  /** @type {Record<string, string>} */
  const result = {};
  for (const name of ['title', 'artist', 'album', 'genre']) {
    const value = tags[name] ?? tags[name.toUpperCase()];
    if (typeof value === 'string' && value.trim()) {
      result[name] = value.trim().slice(0, TAG_LENGTH);
    }
  }
  return result;
}
