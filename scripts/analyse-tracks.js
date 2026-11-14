// Measures a folder of tracks the person loves, for their taste profile (ADR 0012, docs/TASTE.md). Everything runs on
// this computer with ffmpeg; no audio leaves it. Writes one JSON file of measurements that Claude, in a chat, reads to
// write or update server/data/taste.json.
//   node scripts/analyse-tracks.js ~/Music/Psytrance
//   node scripts/analyse-tracks.js ~/Music/Psytrance --update --out server/data/taste-analysis.json --limit 100
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { analyseFolder } from './lib/analyseFolder.js';
import { decodeAudio, readTags } from './lib/decodeAudio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: path.join(ROOT, 'server', 'data', 'taste-analysis.json') },
    limit: { type: 'string', default: '200' },
    update: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length !== 1) {
  console.log('Usage: node scripts/analyse-tracks.js <folder> [--update] [--out file.json] [--limit 200]');
  process.exit(values.help ? 0 : 1);
}

const limit = Math.max(1, Math.min(500, Number.parseInt(values.limit, 10) || 200));

try {
  const started = Date.now();
  const result = await analyseFolder({
    folder: positionals[0],
    out: path.resolve(values.out),
    limit,
    update: values.update,
    decode: decodeAudio,
    tags: readTags,
    onProgress: (message) => console.log(message),
  });
  const { summary } = result;
  console.log(
    `\nMeasured ${result.measured} tracks${result.kept ? `, kept ${result.kept} from before` : ''}` +
      `${result.failed ? `, ${result.failed} could not be read` : ''} in ${Math.round((Date.now() - started) / 1000)} s.`,
  );
  console.log(
    `Tempo: median ${summary.tempo.median} BPM (most between ${summary.tempo.low} and ${summary.tempo.high}).`,
  );
  console.log(`Keys: ${summary.keys.map((key) => `${key.name} (${key.count})`).join(', ')}.`);
  console.log(`Written to ${path.relative(process.cwd(), result.out)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
