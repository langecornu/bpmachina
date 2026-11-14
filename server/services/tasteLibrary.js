// The person's library of taste profiles (ADR 0012): one JSON file per taste in `tastes/` in the data folder, named by
// the taste's id. They are written by hand, by Claude in a chat (docs/TASTE.md) or from Settings, so every file is
// read fresh and validated each time, which picks up an edit without a restart. A broken file is reported with what is
// wrong, never used or overwritten by a list; a deleted taste is moved to `tastes/deleted/`, never erased.
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TASTE_ID_PATTERN, TASTE_LIMITS, TASTE_SCHEMA_VERSION } from '../../shared/taste.js';
import { logger } from '../logger.js';
import { tasteProfileSchema } from '../schemas/tasteSchema.js';
import { httpError } from '../utils/httpError.js';

const log = logger.child({ module: 'taste' });

// A profile is a few kilobytes; anything far bigger is not one.
const MAX_FILE_BYTES = 64 * 1024;
const MAX_ISSUES = 5;

/** @typedef {import('../../shared/types.js').TasteProfile} TasteProfile */
/** @typedef {import('../../shared/taste.js').TasteEntry} TasteEntry */

/**
 * @typedef {{ status: 'none' } | { status: 'ok', profile: TasteProfile } | { status: 'invalid', problems: string[] }}
 *   TasteState
 */

/**
 * Reads and validates one taste file.
 * @param {string} filePath
 * @returns {Promise<TasteState>}
 */
export async function readTasteFile(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return { status: 'none' };
    }
    log.error({ err: error }, 'Could not read a taste profile');
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
    return { status: 'invalid', problems };
  }
  return { status: 'ok', profile: /** @type {TasteProfile} */ (result.data) };
}

/**
 * @param {string} id
 * @returns {string} the id, checked
 * @throws {Error & { status: number }} 400 for anything but a plain id, so a path never reaches the filesystem
 */
function checkedId(id) {
  if (!TASTE_ID_PATTERN.test(id)) {
    throw httpError(400, 'A taste id is lower-case letters, digits and dashes.');
  }
  return id;
}

export class TasteLibrary {
  /** @param {{ dataDir: string, now?: () => Date }} options */
  constructor({ dataDir, now = () => new Date() }) {
    this.folder = path.join(dataDir, 'tastes');
    this.now = now;
  }

  /** @param {string} id */
  fileOf(id) {
    return path.join(this.folder, `${checkedId(id)}.json`);
  }

  /**
   * Every taste in the library, with the ones that cannot be used and why.
   * @returns {Promise<{ tastes: TasteEntry[], problems: { id: string, problems: string[] }[] }>}
   */
  async list() {
    let names;
    try {
      names = await readdir(this.folder);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return { tastes: [], problems: [] };
      }
      throw error;
    }
    const ids = names
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .filter((id) => TASTE_ID_PATTERN.test(id))
      .sort()
      .slice(0, TASTE_LIMITS.library);
    const states = await Promise.all(ids.map((id) => readTasteFile(this.fileOf(id))));
    /** @type {TasteEntry[]} */
    const tastes = [];
    /** @type {{ id: string, problems: string[] }[]} */
    const problems = [];
    states.forEach((state, index) => {
      const id = ids[index];
      if (state.status === 'ok') {
        const { profile } = state;
        tastes.push({
          id,
          name: profile.name,
          style: profile.style,
          moods: profile.moods ?? [],
          ...(profile.intensity === undefined ? {} : { intensity: profile.intensity }),
          ...(profile.updated ? { updated: profile.updated } : {}),
          ...(profile.source ? { tracks: profile.source.tracks } : {}),
        });
      } else if (state.status === 'invalid') {
        problems.push({ id, problems: state.problems });
      }
    });
    if (problems.length > 0) {
      log.warn({ invalid: problems.length }, 'Some taste profiles are not valid');
    }
    return { tastes, problems };
  }

  /**
   * @param {string} id
   * @returns {Promise<TasteState>}
   */
  async read(id) {
    return readTasteFile(this.fileOf(id));
  }

  /**
   * Saves a taste, replacing the one with the same id. Atomic: a temporary file, then rename.
   * @param {string} id
   * @param {TasteProfile} profile validated by tasteProfileSchema
   * @returns {Promise<TasteProfile>}
   * @throws {Error & { status: number }} 409 when the library is full
   */
  async save(id, profile) {
    const file = this.fileOf(id);
    const { tastes } = await this.list();
    if (tastes.length >= TASTE_LIMITS.library && !tastes.some((taste) => taste.id === id)) {
      throw httpError(409, `The library holds ${TASTE_LIMITS.library} tastes. Delete one first.`);
    }
    await mkdir(this.folder, { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    await rename(temp, file);
    return profile;
  }

  /**
   * Moves a taste to `tastes/deleted/`, so a mistaken delete can be undone by moving the file back.
   * @param {string} id
   * @throws {Error & { status: number }} 404 when there is no such taste
   */
  async remove(id) {
    const file = this.fileOf(id);
    const deleted = path.join(this.folder, 'deleted');
    await mkdir(deleted, { recursive: true });
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    try {
      await rename(file, path.join(deleted, `${id}-${stamp}.json`));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        throw httpError(404, 'That taste is no longer in the library.');
      }
      throw error;
    }
  }
}
