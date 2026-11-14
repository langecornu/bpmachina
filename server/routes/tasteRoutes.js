// HTTP API for the person's library of taste profiles (ADR 0012): list them, read one, save one (a new taste, an edit
// from Settings, a copy), and delete one (moved aside, not erased). Every profile is validated against the schema; an
// id is a plain slug, so a request never names a path.
import { Router } from 'express';

import { validateBody } from '../middleware/validate.js';
import { tasteProfileSchema } from '../schemas/tasteSchema.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @param {{ tastes: import('../services/tasteLibrary.js').TasteLibrary }} options
 * @returns {import('express').Router}
 */
export function createTasteRouter({ tastes }) {
  const router = Router();

  router.get(
    '/tastes',
    asyncHandler(async (_req, res) => {
      res.json(await tastes.list());
    }),
  );

  router.get(
    '/tastes/:id',
    asyncHandler(async (req, res) => {
      res.json(await tastes.read(String(req.params.id)));
    }),
  );

  router.put(
    '/tastes/:id',
    validateBody(tasteProfileSchema),
    asyncHandler(async (req, res) => {
      res.json({ status: 'ok', profile: await tastes.save(String(req.params.id), req.body) });
    }),
  );

  router.delete(
    '/tastes/:id',
    asyncHandler(async (req, res) => {
      await tastes.remove(String(req.params.id));
      res.json(await tastes.list());
    }),
  );

  return router;
}
