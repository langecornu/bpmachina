// Fails when a production dependency has a licence outside the allowed list, so nothing incompatible with this project's
// licence (GPL-3.0-or-later) slips in. GPL-2.0-only is left out on purpose: it cannot be combined with GPL version 3. Reads package-lock.json and each installed package's package.json.
//   npm run licenses
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'MPL-2.0',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  // The SIL Open Font License covers the bundled Manrope font (assets, not code); it permits redistribution.
  'OFL-1.1',
]);

/** @param {Record<string, any>} manifest a package.json @returns {string} */
function licenseOf(manifest) {
  const value = manifest.license ?? manifest.licenses;
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => entry.type ?? entry).join(' OR ');
  }
  return value?.type ?? 'UNKNOWN';
}

// "(MIT OR Apache-2.0)" is fine if any alternative is allowed; "A AND B" needs both.
/** @param {string} expression an SPDX licence expression @returns {boolean} */
function isAllowed(expression) {
  const cleaned = expression.replace(/[()]/g, '');
  return cleaned
    .split(/\s+OR\s+/i)
    .some((option) => option.split(/\s+AND\s+/i).every((part) => ALLOWED.has(part.trim())));
}

async function main() {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const problems = [];
  let checked = 0;
  let skipped = 0;
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (location === '' || entry.dev) {
      continue;
    }
    const manifestPath = `${location}/package.json`;
    if (!existsSync(manifestPath)) {
      skipped += 1; // platform-specific optional packages that are not installed on this machine
      continue;
    }
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const license = licenseOf(manifest);
    checked += 1;
    if (!isAllowed(license)) {
      problems.push(`${manifest.name}@${manifest.version}: ${license}`);
    }
  }
  console.log(`Checked ${checked} production packages (${skipped} optional packages not installed here).`);
  if (problems.length > 0) {
    console.error(`Packages with a licence outside the allowed list:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Licence check failed: ${error.message}`);
  process.exitCode = 1;
});
