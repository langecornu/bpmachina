// Reads the person's taste profile (ADR 0010) from `taste.json` in the data folder. The file is written by hand or by
// Claude in a chat (docs/TASTE.md), so it is read fresh on each request, which picks up an edit without a restart,
// and validated every time. A missing file is normal; an unreadable one is reported with where it went wrong, so the
// person can fix a hand edit, and is never overwritten or used.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { TASTE_SCHEMA_VERSION } from '../../shared/taste.js';
import { logger } from '../logger.js';
import { tasteProfileSchema } from '../schemas/tasteSchema.js';

const log = logger.child({ module: 'taste' });

// A profile is a few kilobytes; anything far bigger is not one.
const MAX_FILE_BYTES = 64 * 1024;
const MAX_ISSUES = 5;

/** @typedef {import('../../shared/types.js').TasteProfile} TasteProfile */

/**
 * @typedef {{ status: 'none' } | { status: 'ok', profile: TasteProfile } | { status: 'invalid', problems: string[] }}
 *   TasteState
 */

export class TasteService {
  /** @param {{ dataDir: string } | { filePath: string }} options `filePath` reads another file (scripts/check-taste.js) */
  constructor(options) {
    this.filePath = 'filePath' in options ? options.filePath : path.join(options.dataDir, 'taste.json');
  }

  /** @returns {Promise<TasteState>} */
  async read() {
    let raw;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return { status: 'none' };
      }
      log.error({ err: error }, 'Could not read the taste profile');
      return { status: 'invalid', problems: ['The file could not be read.'] };
    }
    if (raw.length > MAX_FILE_BYTES) {
      return { status: 'invalid', problems: ['The file is too big to be a taste profile (64 KB at most).'] };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'invalid', problems: ['The file is not valid JSON.'] };
    }
    if (Number(parsed?.schemaVersion) > TASTE_SCHEMA_VERSION) {
      return { status: 'invalid', problems: ['The profile was made by a newer version of BPMachina. Update the app.'] };
    }
    const result = tasteProfileSchema.safeParse(parsed);
    if (!result.success) {
      const problems = result.error.issues
        .slice(0, MAX_ISSUES)
        .map((issue) => `${issue.path.join('.') || 'profile'}: ${issue.message}`);
      log.warn({ issues: result.error.issues.length }, 'The taste profile is not valid');
      return { status: 'invalid', problems };
    }
    return { status: 'ok', profile: /** @type {TasteProfile} */ (result.data) };
  }
}
