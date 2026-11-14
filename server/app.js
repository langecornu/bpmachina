// Builds the Express app (no listening) so tests can start it on an ephemeral port.
import { existsSync } from 'node:fs';
import path from 'node:path';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { errorHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { trustedRequest } from './middleware/trustedRequest.js';
import { createApiRouter } from './routes/apiRoutes.js';

// A full song at the limits (32 patterns of 2,048 notes) is a few megabytes of JSON.
const SONG_BODY_LIMIT = '8mb';

/**
 * @param {{
 *   config: { allowedOrigins: string[], distDir: string },
 *   songService: import('./services/songService.js').SongService,
 *   aiKeys?: import('./services/aiKeyStore.js').AiKeyStore,
 *   aiClient?: (apiKey: string) => import('@anthropic-ai/sdk').default,
 * }} options `aiKeys` and `aiClient` replace the API key store and the Anthropic client, for tests
 * @returns {import('express').Express}
 */
export function createApp({ config, songService, aiKeys, aiClient }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          // The synth voices are WebAssembly compiled in the page (docs/adr/0011). 'wasm-unsafe-eval' allows compiling
          // WebAssembly and nothing else: JavaScript eval stays blocked, and scripts still only come from this site.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          // Served over plain http on this computer: asking the browser to upgrade would break a page opened from
          // another address.
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use(cors({ origin: config.allowedOrigins }));
  app.use(trustedRequest(config.allowedOrigins));
  // Mounted first: body-parser skips a body that is already parsed, so everything else keeps 1 MB.
  app.use('/api/v1/song', express.json({ limit: SONG_BODY_LIMIT }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1', createApiRouter({ songService, aiKeys, aiClient }));

  if (existsSync(config.distDir)) {
    app.use(express.static(config.distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
