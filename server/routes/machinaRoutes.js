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
 * The saved taste profile, or a plain reason why the Machina cannot compose to it.
 * @param {import('../services/tasteService.js').TasteService} taste
 * @returns {Promise<import('../../shared/types.js').TasteProfile>}
 * @throws {Error & { status: number }} 400 when there is no usable profile
 */
async function tasteProfileFor(taste) {
  const state = await taste.read();
  if (state.status === 'ok') {
    return state.profile;
  }
  throw httpError(
    400,
    state.status === 'none'
      ? 'There is no taste profile yet. Make one (see Settings), or compose without your taste.'
      : 'Your taste profile has a problem (see Settings). Fix it, or compose without your taste.',
  );
}

/**
 * @param {{
 *   songService: import('../services/songService.js').SongService,
 *   aiKeys: import('../services/aiKeyStore.js').AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 *   taste: import('../services/tasteService.js').TasteService,
 * }} options `aiClient` replaces the Anthropic client, for tests
 * @returns {import('express').Router}
 */
export function createMachinaRouter({ songService, aiKeys, aiClient, taste }) {
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
  /**
   * @param {import('express').Request} _req
   * @param {import('express').Response} _res
   * @param {import('express').NextFunction} next
   */
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
      const profile = req.body.useTaste ? await tasteProfileFor(taste) : null;
      isComposing = true;
      try {
        res.json(
          await compose({
            apiKey,
            song: songService.get(),
            request: req.body,
            taste: profile,
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
