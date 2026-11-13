// Persists the song being worked on as one JSON file. A first start opens the starter song, so Play makes music at
// once. Saving writes atomically (temp file then rename) and keeps the previous save as a backup. A saved file that
// cannot be read is moved aside, never overwritten; one written by a newer version is left alone and saving is refused;
// one written by an older version is migrated first (songMigrations.js).
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SONG_SCHEMA_VERSION, createStarterSong } from '../../shared/song.js';
import { logger } from '../logger.js';
import { songSchema } from '../schemas/songSchema.js';
import { httpError } from '../utils/httpError.js';
import { migrateSong } from './songMigrations.js';

const log = logger.child({ module: 'song' });

/** @typedef {import('../../shared/types.js').Song} Song */

export class SongService {
  /** @param {{ dataDir: string, makeId?: () => string }} options */
  constructor({ dataDir, makeId = () => randomUUID() }) {
    this.dataDir = dataDir;
    this.makeId = makeId;
    this.filePath = path.join(dataDir, 'song.json');
    this.backupPath = `${this.filePath}.bak`;
    /** @type {Song} */
    this.song = createStarterSong(makeId);
    this.writeQueue = Promise.resolve();
    /** @type {string | null} set when the saved song was written by a newer app, so it is never overwritten */
    this.lockedReason = null;
  }

  /** @returns {Promise<Song>} */
  async load() {
    let raw;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') {
        log.error({ err: error }, 'Could not read the saved song, starting with the starter song');
      }
      return this.song;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (Number(parsed?.schemaVersion) > SONG_SCHEMA_VERSION) {
      this.lockedReason =
        'The saved song was made by a newer version of BPMachina. Update the app to open it; it was left untouched.';
      log.error({ schemaVersion: parsed.schemaVersion }, 'The saved song is from a newer version; saving is disabled');
      return this.song;
    }
    const result = songSchema.safeParse(migrateSong(parsed));
    if (result.success) {
      this.song = /** @type {Song} */ (result.data);
      return this.song;
    }
    // Keep the unreadable file next to the new one instead of letting the next save overwrite it.
    const asideName = `${this.filePath}.unreadable-${Date.now()}`;
    await rename(this.filePath, asideName).catch((renameError) => {
      log.error({ err: renameError }, 'Could not move the unreadable song aside');
    });
    log.error(
      { issues: result.error.issues.length, movedTo: asideName },
      'The saved song is not valid, starting fresh',
    );
    return this.song;
  }

  /** @returns {Song} */
  get() {
    return this.song;
  }

  /**
   * @param {Song} song already validated by the caller
   * @returns {Promise<Song>}
   * @throws {Error & { status: number }} 409 while the saved song is from a newer version
   */
  async save(song) {
    if (this.lockedReason) {
      throw httpError(409, this.lockedReason);
    }
    this.song = song;
    const write = async () => {
      await mkdir(this.dataDir, { recursive: true });
      await copyFile(this.filePath, this.backupPath).catch((error) => {
        if (error.code !== 'ENOENT') {
          log.warn({ err: error }, 'Could not update the song backup');
        }
      });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(song, null, 2), 'utf8');
      await rename(tempPath, this.filePath);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
    return song;
  }
}
