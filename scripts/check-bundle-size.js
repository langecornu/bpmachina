// Fails when the JavaScript the browser needs on first load grows past a budget. "Initial" means the scripts and
// preloaded modules that dist/index.html references; lazily loaded chunks are reported but not counted against it.
// Run after `npm run build`:  npm run size  (optionally: node scripts/check-bundle-size.js 180)
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const budgetKilobytes = Number(process.argv[2] ?? 200);

/** @param {string} file path inside dist/ @returns {Promise<number>} */
async function gzipKilobytes(file) {
  return gzipSync(await readFile(path.join(DIST, file))).length / 1024;
}

async function main() {
  const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
  const initial = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((match) => match[1]));
  const assets = (await readdir(path.join(DIST, 'assets'))).filter((name) => name.endsWith('.js'));

  let initialKilobytes = 0;
  for (const name of assets.sort()) {
    const file = `assets/${name}`;
    const size = await gzipKilobytes(file);
    const isInitial = initial.has(file);
    if (isInitial) {
      initialKilobytes += size;
    }
    console.log(`${isInitial ? 'initial' : 'lazy   '} ${size.toFixed(1).padStart(7)} kB gzip  ${file}`);
  }

  console.log(`Initial JavaScript: ${initialKilobytes.toFixed(1)} kB gzip (budget ${budgetKilobytes} kB)`);
  if (initialKilobytes > budgetKilobytes) {
    console.error('Bundle budget exceeded. Split the code or remove a dependency.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Bundle size check failed: ${error.message}`);
  process.exitCode = 1;
});
