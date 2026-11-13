// Validates a request body against a zod schema and replaces it with the parsed value.
import { httpError } from '../utils/httpError.js';

/**
 * @param {import('zod').ZodType} schema
 * @returns {import('express').RequestHandler}
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      next(httpError(400, `Invalid request: ${detail}`));
      return;
    }
    req.body = result.data;
    next();
  };
}
