// HTTP API for the taste profile (ADR 0010): the browser reads it to show it on Settings and to offer "Compose to my
// taste". It is read-only here: the profile is written by hand or by Claude in a chat (docs/TASTE.md).
import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @param {{ taste: import('../services/tasteService.js').TasteService }} options
 * @returns {import('express').Router}
 */
export function createTasteRouter({ taste }) {
  const router = Router();

  router.get(
    '/taste',
    asyncHandler(async (_req, res) => {
      res.json(await taste.read());
    }),
  );

  return router;
}
