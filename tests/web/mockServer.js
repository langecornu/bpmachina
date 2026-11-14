// A stand-in for the BPMachina server behind `fetch`, holding a song in memory, so screens are tested end to end in
// the browser code without a network.
import { vi } from 'vitest';

import { createEmptySong, createStarterSong } from '../../shared/song.js';

let counter = 0;
export const makeId = () => `id-${(counter += 1)}`;

/**
 * @param {{ hasKey?: boolean, compose?: (body: any) => any, failSongLoads?: number, taste?: any }} [options]
 *   `compose` answers the Machina; `failSongLoads` makes the first loads fail, like a server still starting; `taste`
 *   is what GET /taste answers (no profile by default, or an Error to fail)
 */
export function installMockServer({
  hasKey = true,
  compose = null,
  failSongLoads = 0,
  taste = { status: 'none' },
} = {}) {
  const server = {
    song: createStarterSong(makeId),
    hasKey,
    saves: [],
    composeRequests: [],
    failSongLoads,
  };
  const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal(
    'fetch',
    vi.fn((url, options = {}) => {
      const route = String(url).replace('/api/v1', '');
      const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(options.body) : undefined;
      if (route === '/song' && method === 'GET') {
        if (server.failSongLoads > 0) {
          server.failSongLoads -= 1;
          return reply(502, { error: 'Bad gateway' });
        }
        return reply(200, server.song);
      }
      if (route === '/song' && method === 'PUT') {
        server.song = body;
        server.saves.push(body);
        return reply(200, body);
      }
      if (route === '/song/new') {
        server.song = body.starter ? createStarterSong(makeId) : createEmptySong(makeId);
        return reply(200, server.song);
      }
      if (route === '/settings/ai') {
        if (method === 'PUT') {
          if (body.apiKey === 'bad-key-0123456789abcdef') {
            return reply(400, { error: 'Anthropic refused the API key.' });
          }
          server.hasKey = true;
        } else if (method === 'DELETE') {
          server.hasKey = false;
        }
        return reply(200, { hasKey: server.hasKey, source: server.hasKey ? 'saved' : null });
      }
      if (route === '/taste') {
        return taste instanceof Error ? reply(500, { error: taste.message }) : reply(200, taste);
      }
      if (route === '/machina/compose') {
        server.composeRequests.push(body);
        return compose ? compose(body, reply) : reply(500, { error: 'No answer set' });
      }
      return reply(404, { error: 'Not found' });
    }),
  );
  return server;
}
