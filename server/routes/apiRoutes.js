// HTTP API under /api/v1: one router per area (the song, and the Machina Engine that composes it). Routes parse and validate; services do the
// work.
import { Router } from 'express';

import { AiKeyStore } from '../services/aiKeyStore.js';
import { createMachinaRouter } from './machinaRoutes.js';
import { createSongRouter } from './songRoutes.js';

/**
 * @param {{
 *   songService: import('../services/songService.js').SongService,
 *   aiKeys?: AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 * }} options `aiKeys` and `aiClient` replace the key store and the Anthropic client, for tests
 * @returns {import('express').Router}
 */
export function createApiRouter({
  songService,
  aiKeys = new AiKeyStore({ dataDir: songService.dataDir }),
  aiClient = undefined,
}) {
  const router = Router();
  router.use(createSongRouter({ songService }));
  router.use(createMachinaRouter({ songService, aiKeys, aiClient }));
  return router;
}
