// HTTP API under /api/v1: one router per area (the song, the Machina Engine that composes it, and the library of taste
// profiles it can compose to). Routes parse and validate; services do the
// work.
import { Router } from 'express';

import { AiKeyStore } from '../services/aiKeyStore.js';
import { TasteLibrary } from '../services/tasteLibrary.js';
import { createMachinaRouter } from './machinaRoutes.js';
import { createSongRouter } from './songRoutes.js';
import { createTasteRouter } from './tasteRoutes.js';

/**
 * @param {{
 *   songService: import('../services/songService.js').SongService,
 *   aiKeys?: AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 *   tastes?: TasteLibrary,
 * }} options `aiKeys`, `aiClient` and `tastes` replace the key store, the Anthropic client and the taste library,
 *   for tests
 * @returns {import('express').Router}
 */
export function createApiRouter({
  songService,
  aiKeys = new AiKeyStore({ dataDir: songService.dataDir }),
  aiClient = undefined,
  tastes = new TasteLibrary({ dataDir: songService.dataDir }),
}) {
  const router = Router();
  router.use(createSongRouter({ songService }));
  router.use(createMachinaRouter({ songService, aiKeys, aiClient, tastes }));
  router.use(createTasteRouter({ tastes }));
  return router;
}
