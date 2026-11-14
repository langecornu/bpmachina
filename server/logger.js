// @ts-check
// The one place that writes to stdout and stderr. Everything else imports `logger` and takes a child per module:
//   const log = logger.child({ module: 'output' });
//   log.info({ driver, path }, 'Output switched');
// Output is readable text in development and one JSON object per line in production. Lines made while handling an
// HTTP request carry its request id automatically (AsyncLocalStorage). Log only fields you mean to: never whole request
// bodies, project contents or file contents (Standards 4.1).
import { AsyncLocalStorage } from 'node:async_hooks';

/** @typedef {'debug' | 'info' | 'warn' | 'error' | 'silent'} LogLevel */
/** @typedef {Record<string, unknown>} LogFields */
/** @typedef {(fieldsOrMessage: LogFields | string, message?: string) => void} LogMethod */
/**
 * @typedef {{ debug: LogMethod, info: LogMethod, warn: LogMethod, error: LogMethod,
 *   child: (fields: LogFields) => Logger }} Logger
 */

/** @type {Record<LogLevel, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** @type {AsyncLocalStorage<{ requestId: string }>} */
const requestContext = new AsyncLocalStorage();

const state = {
  /** @type {LogLevel} */
  level: 'info',
  /** @type {'text' | 'json'} */
  format: 'text',
  /** @type {(line: string, level: LogLevel) => void} */
  write: (line, level) => {
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
  },
};

/**
 * Sets the level, the output format and, for tests, where lines go. Called once at start-up from the config.
 * @param {{ level?: LogLevel, format?: 'text' | 'json', write?: (line: string, level: LogLevel) => void }} options
 */
export function configureLogger(options) {
  state.level = options.level ?? state.level;
  state.format = options.format ?? state.format;
  state.write = options.write ?? state.write;
}

/**
 * Runs `callback` so that every log line made inside it includes `requestId`.
 * @template T
 * @param {string} requestId
 * @param {() => T} callback
 * @returns {T}
 */
export function runWithRequestId(requestId, callback) {
  return requestContext.run({ requestId }, callback);
}

/** @returns {string | undefined} the id of the request being handled, if any */
export function currentRequestId() {
  return requestContext.getStore()?.requestId;
}

/**
 * @param {unknown} value
 * @returns {unknown} errors become plain objects so they serialise and print usefully
 */
function serialise(value) {
  if (value instanceof Error) {
    const code = /** @type {{ code?: unknown }} */ (value).code;
    return { message: value.message, code, stack: value.stack };
  }
  return value;
}

/**
 * Text lines stay short: an error prints as its message and code (the full stack goes to the JSON format).
 * @param {unknown} value
 * @returns {string}
 */
function formatForText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'message' in value && 'stack' in value) {
    const { message, code } = /** @type {{ message: string, code?: unknown }} */ (value);
    return JSON.stringify(code ? `${message} (${String(code)})` : message);
  }
  return JSON.stringify(value);
}

/**
 * @param {LogLevel} level
 * @param {LogFields} base
 * @param {LogFields | string} fieldsOrMessage
 * @param {string} [message]
 */
function emit(level, base, fieldsOrMessage, message) {
  if (LEVELS[level] < LEVELS[state.level]) {
    return;
  }
  const fields = typeof fieldsOrMessage === 'string' ? {} : fieldsOrMessage;
  const text = typeof fieldsOrMessage === 'string' ? fieldsOrMessage : (message ?? '');
  const requestId = currentRequestId();
  /** @type {LogFields} */
  const entry = { ...base, ...(requestId ? { requestId } : {}) };
  for (const [key, value] of Object.entries(fields)) {
    entry[key] = serialise(value);
  }
  const time = new Date().toISOString();
  if (state.format === 'json') {
    // The reserved keys come last so a caller's field named `msg`, `level` or `time` cannot overwrite them.
    state.write(JSON.stringify({ ...entry, time, level, msg: text }), level);
    return;
  }
  const { module: moduleName, ...rest } = entry;
  const tag = moduleName ? ` [${String(moduleName)}]` : '';
  const extra = Object.entries(rest)
    .map(([key, value]) => `${key}=${formatForText(value)}`)
    .join(' ');
  state.write(`${time} ${level.toUpperCase()}${tag} ${text}${extra ? ` ${extra}` : ''}`, level);
}

/**
 * @param {LogFields} base fields added to every line from this logger
 * @returns {Logger}
 */
function createLogger(base) {
  return {
    /** @param {LogFields | string} fieldsOrMessage @param {string} [message] */
    debug: (fieldsOrMessage, message) => emit('debug', base, fieldsOrMessage, message),
    /** @param {LogFields | string} fieldsOrMessage @param {string} [message] */
    info: (fieldsOrMessage, message) => emit('info', base, fieldsOrMessage, message),
    /** @param {LogFields | string} fieldsOrMessage @param {string} [message] */
    warn: (fieldsOrMessage, message) => emit('warn', base, fieldsOrMessage, message),
    /** @param {LogFields | string} fieldsOrMessage @param {string} [message] */
    error: (fieldsOrMessage, message) => emit('error', base, fieldsOrMessage, message),
    /** @param {LogFields} fields @returns {Logger} */
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const logger = createLogger({});
