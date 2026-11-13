// Process shutdown: close the HTTP server, wait for pending saves, then exit. A deadline makes sure the process always
// ends, so a restart (node --watch, Ctrl+C) never leaves the port held by a stuck process.

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * @param {{
 *   server: { close: (done: () => void) => unknown, closeAllConnections: () => void },
 *   songService: { writeQueue: Promise<unknown> },
 *   log: { info: Function, warn: Function, error: Function },
 *   exit?: (code: number) => void,
 *   timeoutMs?: number,
 * }} options
 * @returns {(signal: string) => Promise<void>} call on SIGTERM or SIGINT
 */
export function createShutdown({ server, songService, log, exit = process.exit, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let isShuttingDown = false;

  return async function shutdown(signal) {
    if (isShuttingDown) {
      log.warn({ signal }, 'Second stop signal, quitting now');
      exit(1);
      return;
    }
    isShuttingDown = true;
    log.info({ signal }, 'Shutting down');

    const deadline = setTimeout(() => {
      log.error({ timeoutMs }, 'Shutdown did not finish in time, quitting anyway');
      exit(1);
    }, timeoutMs);
    deadline.unref();

    const closed = new Promise((resolve) => server.close(() => resolve(undefined)));
    server.closeAllConnections();
    try {
      await songService.writeQueue;
    } catch (error) {
      log.warn({ err: error }, 'The last save did not finish cleanly');
    }
    await closed;
    clearTimeout(deadline);
    exit(0);
  };
}
