// HTTP API for the song being worked on: read it, save it (the browser autosaves edits), and start a new one.
import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import { createEmptySong, createStarterSong } from '../../shared/song.js';
import { validateBody } from '../middleware/validate.js';
import { newSongSchema, songSchema } from '../schemas/songSchema.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * @param {{ songService: import('../services/songService.js').SongService }} options
 * @returns {import('express').Router}
 */
export function createSongRouter({ songService }) {
  const router = Router();

  router.get('/song', (_req, res) => {
    res.json(songService.get());
  });

  router.put(
    '/song',
    validateBody(songSchema),
    asyncHandler(async (req, res) => {
      res.json(await songService.save(req.body));
    }),
  );

  router.post(
    '/song/new',
    validateBody(newSongSchema),
    asyncHandler(async (req, res) => {
      const makeId = () => randomUUID();
      res.json(await songService.save(req.body.starter ? createStarterSong(makeId) : createEmptySong(makeId)));
    }),
  );

  return router;
}
