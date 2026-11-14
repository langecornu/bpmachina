// Checks a taste profile against its schema (ADR 0010), so a profile written by hand or in a chat is known to load
// before the app needs it. Prints what is wrong, path by path.
//   node scripts/check-taste.js                     (server/data/taste.json)
//   node scripts/check-taste.js docs/taste.example.json
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TasteService } from '../server/services/tasteService.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.resolve(process.argv[2] ?? path.join(ROOT, 'server', 'data', 'taste.json'));

const state = await new TasteService({ filePath: file }).read();
if (state.status === 'ok') {
  console.log(`OK: "${state.profile.name}" is a valid taste profile.`);
} else if (state.status === 'none') {
  console.error(`There is no file at ${file}.`);
  process.exit(1);
} else {
  console.error(`Not a valid taste profile:\n- ${state.problems.join('\n- ')}`);
  process.exit(1);
}
