// @ts-check
// Gives every request an id (reusing a sane incoming X-Request-Id), returns it in the response header, and runs the
// rest of the request inside a logging context so every log line includes it. Errors return the same id to the client.
import { randomUUID } from 'node:crypto';

import { logger, runWithRequestId } from '../logger.js';

const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/;
const log = logger.child({ module: 'http' });

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestId(req, res, next) {
  const incoming = req.header('x-request-id');
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  /** @type {{ id?: string }} */ (req).id = id;
  const startedAt = Date.now();
  res.on('finish', () => {
    // Health checks are polled often and would drown the log.
    if (!req.path.startsWith('/healthz') && !req.path.startsWith('/readyz')) {
      log.debug({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - startedAt }, 'Request');
    }
  });
  runWithRequestId(id, next);
}
