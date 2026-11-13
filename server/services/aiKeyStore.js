// The Anthropic API key for AI composition. It is written once from Settings and never sent back to any page: the
// app only says whether a key is there. It lives in `secrets.json` in the data folder, readable by this user only. An
// ANTHROPIC_API_KEY environment variable, when set, is used instead.
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class AiKeyStore {
  /** @param {{ dataDir: string, env?: NodeJS.ProcessEnv }} options */
  constructor({ dataDir, env = process.env }) {
    this.file = path.join(dataDir, 'secrets.json');
    this.env = env;
  }

  /** @returns {Promise<string | null>} the key, for the server's own calls to the API only */
  async read() {
    if (this.env.ANTHROPIC_API_KEY) {
      return this.env.ANTHROPIC_API_KEY;
    }
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      return typeof saved.anthropicApiKey === 'string' && saved.anthropicApiKey ? saved.anthropicApiKey : null;
    } catch {
      return null;
    }
  }

  /** @returns {Promise<{ hasKey: boolean, source: 'environment' | 'saved' | null }>} never the key itself */
  async status() {
    if (this.env.ANTHROPIC_API_KEY) {
      return { hasKey: true, source: 'environment' };
    }
    return (await this.read()) ? { hasKey: true, source: 'saved' } : { hasKey: false, source: null };
  }

  /** @param {string} key */
  async save(key) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify({ anthropicApiKey: key }), { encoding: 'utf8', mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, this.file);
  }

  async remove() {
    await rm(this.file, { force: true });
  }
}
