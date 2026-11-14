// HTTP API under /api/v1: one router per area (the song, the Machina Engine that composes it, and the taste profile it
// can compose to). Routes parse and validate; services do the
// work.
import { Router } from 'express';

import { AiKeyStore } from '../services/aiKeyStore.js';
import { TasteService } from '../services/tasteService.js';
import { createMachinaRouter } from './machinaRoutes.js';
import { createSongRouter } from './songRoutes.js';
import { createTasteRouter } from './tasteRoutes.js';

/**
 * @param {{
 *   songService: import('../services/songService.js').SongService,
 *   aiKeys?: AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 *   taste?: TasteService,
 * }} options `aiKeys`, `aiClient` and `taste` replace the key store, the Anthropic client and the taste profile, for
 *   tests
 * @returns {import('express').Router}
 */
export function createApiRouter({
  songService,
  aiKeys = new AiKeyStore({ dataDir: songService.dataDir }),
  aiClient = undefined,
  taste = new TasteService({ dataDir: songService.dataDir }),
}) {
  const router = Router();
  router.use(createSongRouter({ songService }));
  router.use(createMachinaRouter({ songService, aiKeys, aiClient, taste }));
  router.use(createTasteRouter({ taste }));
  return router;
}
