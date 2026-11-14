// Shared test setup: an app on an ephemeral port with a temporary data folder, and a stand-in for Anthropic's client
// that records what it was asked and answers what the test sets.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createApp } from '../../server/app.js';
import { AiKeyStore } from '../../server/services/aiKeyStore.js';
import { SongService } from '../../server/services/songService.js';

export const ORIGIN = 'http://localhost:5180';

/** @returns {{ keys: string[], requests: any[], answer: any, error: any, stopReason: string, gate: Promise<void> | null, client: (key: string) => any }} */
export function createMockAnthropic() {
  const mock = {
    keys: [],
    requests: [],
    answer: null,
    error: null,
    stopReason: 'end_turn',
    gate: null,
    client: (apiKey) => {
      mock.keys.push(apiKey);
      return {
        models: {
          retrieve: async (model) => {
            if (mock.error) {
              throw mock.error;
            }
            return { id: model };
          },
        },
        beta: {
          messages: {
            stream: (body) => {
              mock.requests.push(body);
              return {
                finalMessage: async () => {
                  await mock.gate;
                  if (mock.error) {
                    throw mock.error;
                  }
                  return {
                    model: 'answered-by',
                    stop_reason: mock.stopReason,
                    content: [
                      {
                        type: 'text',
                        text: typeof mock.answer === 'string' ? mock.answer : JSON.stringify(mock.answer),
                      },
                    ],
                    usage: { input_tokens: 1500, output_tokens: 4200 },
                  };
                },
              };
            },
          },
        },
      };
    },
  };
  return mock;
}

/**
 * @param {{ aiClient?: (key: string) => any, env?: NodeJS.ProcessEnv, withBuild?: boolean }} [options] `withBuild`
 *   gives the app a built front end to serve (a small dist folder), as `npm start` has
 */
export async function startApp({ aiClient, env = {}, withBuild = false } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'bpmachina-'));
  const distDir = path.join(dataDir, withBuild ? 'dist' : 'no-build');
  if (withBuild) {
    await mkdir(path.join(distDir, 'assets'), { recursive: true });
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>BPMachina</title>', 'utf8');
    await writeFile(path.join(distDir, 'assets', 'app.js'), 'export {};', 'utf8');
  }
  const songService = new SongService({ dataDir });
  await songService.load();
  const aiKeys = new AiKeyStore({ dataDir, env });
  const config = { allowedOrigins: [ORIGIN], distDir };
  const server = createServer(createApp({ config, songService, aiKeys, aiClient }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  const baseUrl = `http://127.0.0.1:${address.port}`;

  /** @param {string} route @param {string} method @param {unknown} [body] @param {Record<string, string>} [headers] */
  const call = async (route, method = 'GET', body = undefined, headers = {}) => {
    const res = await fetch(`${baseUrl}/api/v1${route}`, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  return {
    dataDir,
    songService,
    baseUrl,
    call,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
