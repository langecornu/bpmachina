// Checks taste profiles against their schema (ADR 0012), so a profile written by hand or in a chat is known to load
// before the app needs it. Prints what is wrong, path by path.
//   node scripts/check-taste.js                     (every taste in server/data/tastes/)
//   node scripts/check-taste.js docs/taste.example.json
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTasteFile } from '../server/services/tasteLibrary.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = path.join(ROOT, 'server', 'data', 'tastes');

const files = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : (await readdir(LIBRARY).catch(() => []))
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(LIBRARY, name));
if (files.length === 0) {
  console.error(`No taste profiles in ${path.relative(process.cwd(), LIBRARY)}.`);
  process.exit(1);
}
let failed = 0;
for (const file of files) {
  const state = await readTasteFile(file);
  const label = path.basename(file);
  if (state.status === 'ok') {
    console.log(`OK    ${label}: "${state.profile.name}" (${state.profile.style})`);
  } else {
    failed += 1;
    console.error(`ERROR ${label}: ${state.status === 'none' ? 'no such file' : state.problems.join('; ')}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
