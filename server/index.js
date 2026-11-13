// Entry point: wires config, the song store and HTTP, and handles process lifecycle.
import { createServer } from 'node:http';

import { createApp } from './app.js';
import { isLoopback, loadConfig } from './config.js';
import { createShutdown } from './lifecycle.js';
import { configureLogger, logger } from './logger.js';
import { SongService } from './services/songService.js';

const config = loadConfig();
configureLogger({ level: config.logLevel, format: config.logFormat });
const log = logger.child({ module: 'server' });
const songService = new SongService({ dataDir: config.dataDir });
await songService.load();

const server = createServer(createApp({ config, songService }));
server.listen(config.port, config.host, () => {
  log.info({ host: config.host, port: config.port }, 'BPMachina is listening');
  if (!isLoopback(config.host)) {
    log.warn('Listening beyond this computer. The app has no login, so use a network you trust.');
  }
});

const shutdown = createShutdown({ server, songService, log });
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  log.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});
