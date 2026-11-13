// Wraps an async Express handler so rejected promises reach the error middleware.
/**
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => unknown} handler
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
