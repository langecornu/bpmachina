// Central configuration. This is the only module allowed to read process.env; it validates at startup.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  // This computer only by default (ADR 0004): the app has no login and composing spends the saved API key.
  HOST: z.string().min(1).max(253).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['text', 'json']).optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5180'),
  DATA_DIR: z.string().default('server/data'),
});

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/** @param {string} host @returns {boolean} true when the server only listens on this computer */
export const isLoopback = (host) => LOOPBACK.has(host);

/**
 * The browser pages allowed to talk to the API: the ones listed in ALLOWED_ORIGINS, plus this server's own address,
 * which serves the built app.
 * @param {string} listed comma-separated origins
 * @param {number} port
 * @returns {string[]}
 */
function trustedOrigins(listed, port) {
  const configured = listed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const own = ['localhost', '127.0.0.1', '[::1]'].map((host) => `http://${host}:${port}`);
  return [...new Set([...configured, ...own])];
}

/** @param {NodeJS.ProcessEnv} [env] */
export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`[config] Invalid environment: ${parsed.error.message}`);
  }
  const values = parsed.data;
  return {
    port: values.PORT,
    host: values.HOST,
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL,
    logFormat: values.LOG_FORMAT ?? (values.NODE_ENV === 'production' ? 'json' : 'text'),
    allowedOrigins: trustedOrigins(values.ALLOWED_ORIGINS, values.PORT),
    dataDir: path.resolve(ROOT_DIR, values.DATA_DIR),
    distDir: path.join(ROOT_DIR, 'dist'),
  };
}
