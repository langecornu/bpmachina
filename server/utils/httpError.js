// Shared HTTP error factory so every route fails the same way.
/**
 * @param {number} status HTTP status code
 * @param {string} message safe to show to the client
 * @param {{ expose?: boolean }} [options] `expose` lets a 5xx message reach the client. Use it only for messages we wrote
 *   ourselves (for example "the online library is unreachable"); 5xx messages are otherwise replaced by a generic one.
 * @returns {Error & { status: number, expose?: boolean }}
 */
export function httpError(status, message, { expose = false } = {}) {
  const error = /** @type {Error & { status: number, expose?: boolean }} */ (new Error(message));
  error.status = status;
  if (expose) {
    error.expose = true;
  }
  return error;
}
