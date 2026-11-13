// Single error middleware: a safe message plus the request id as a correlation id, never raw exception text to clients.
// 5xx errors are logged with the stack; 4xx are one-line warnings.
import { randomUUID } from 'node:crypto';

import { logger } from '../logger.js';

const log = logger.child({ module: 'http' });

/**
 * @param {Error & { status?: number, expose?: boolean }} err
 * @param {import('express').Request & { id?: string }} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  const correlationId = req.id ?? randomUUID();
  const status = Number.isInteger(err.status) ? /** @type {number} */ (err.status) : 500;
  if (status >= 500 && !err.expose) {
    log.error({ err, method: req.method, path: req.path, correlationId }, 'Request failed');
  } else {
    log.warn({ method: req.method, path: req.path, status, message: err.message }, 'Request rejected');
  }
  const message = status >= 500 && !err.expose ? 'Internal server error' : err.message;
  res.status(status).json({ error: message, correlationId });
}
