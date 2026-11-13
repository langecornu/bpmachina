// HTTP API for the Machina Engine (the AI composer): the Anthropic API key (write-only: no route ever returns it) and composing or revising
// the song. The result goes back to the browser, which shows it and keeps it (with undo) rather than the server saving
// it over the person's work. Each composition spends money on the person's key, so they are rate limited and run one
// at a time.
import { randomUUID } from 'node:crypto';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { validateBody } from '../middleware/validate.js';
import { aiKeySchema, composeRequestSchema } from '../schemas/songSchema.js';
import { checkApiKey, compose } from '../services/machinaEngine.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';

/**
 * @param {{
 *   songService: import('../services/songService.js').SongService,
 *   aiKeys: import('../services/aiKeyStore.js').AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 * }} options `aiClient` replaces the Anthropic client, for tests
 * @returns {import('express').Router}
 */
export function createMachinaRouter({ songService, aiKeys, aiClient }) {
  const router = Router();

  router.get(
    '/settings/ai',
    asyncHandler(async (_req, res) => {
      res.json(await aiKeys.status());
    }),
  );

  router.put(
    '/settings/ai',
    validateBody(aiKeySchema),
    asyncHandler(async (req, res) => {
      await checkApiKey(req.body.apiKey, aiClient);
      await aiKeys.save(req.body.apiKey);
      res.json(await aiKeys.status());
    }),
  );

  router.delete(
    '/settings/ai',
    asyncHandler(async (_req, res) => {
      await aiKeys.remove();
      res.json(await aiKeys.status());
    }),
  );

  const aiLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: true, legacyHeaders: false });
  // Two tabs pressing Compose together would pay twice.
  let isComposing = false;
  /** @type {import('express').RequestHandler} */
  const oneAtATime = (_req, _res, next) => {
    next(isComposing ? httpError(409, 'The Machina is already writing. Wait for it to finish.') : undefined);
  };
  router.post(
    '/machina/compose',
    oneAtATime,
    aiLimiter,
    validateBody(composeRequestSchema),
    asyncHandler(async (req, res) => {
      const apiKey = await aiKeys.read();
      if (!apiKey) {
        throw httpError(400, 'Add your Anthropic API key in Settings first.');
      }
      isComposing = true;
      try {
        res.json(
          await compose({
            apiKey,
            song: songService.get(),
            request: req.body,
            makeId: () => randomUUID(),
            ...(aiClient ? { createClient: aiClient } : {}),
          }),
        );
      } finally {
        isComposing = false;
      }
    }),
  );

  return router;
}
