// Tests for the logger: levels, JSON and text formats, error serialisation and request ids.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { configureLogger, logger, runWithRequestId } from '../../server/logger.js';

const lines = [];
const capture = (line, level) => lines.push({ line, level });

afterEach(() => {
  lines.length = 0;
  configureLogger({ level: 'info', format: 'text' });
});

describe('logger', () => {
  it('prints errors in text mode as a short message and code, without the stack', () => {
    configureLogger({ level: 'info', format: 'text', write: capture });
    logger.error({ err: Object.assign(new Error('Resource busy'), { code: 'EBUSY' }) }, 'Open failed');
    assert.match(lines[0].line, /err="Resource busy \(EBUSY\)"/, 'the message and code are shown');
    assert.doesNotMatch(lines[0].line, /at .*\.js/, 'the stack is left to the JSON format');
  });

  it('writes one JSON object per line with level, message, module and fields', () => {
    configureLogger({ level: 'info', format: 'json', write: capture });
    logger.child({ module: 'test' }).info({ driver: 'artnet' }, 'Output switched');
    const entry = JSON.parse(lines[0].line);
    assert.equal(entry.level, 'info', 'the level is recorded');
    assert.equal(entry.msg, 'Output switched', 'the message is recorded');
    assert.equal(entry.module, 'test', 'the module tag is recorded');
    assert.equal(entry.driver, 'artnet', 'extra fields are recorded');
    assert.ok(entry.time, 'a timestamp is recorded');
  });

  it('skips lines below the configured level', () => {
    configureLogger({ level: 'warn', format: 'json', write: capture });
    logger.info('quiet');
    logger.debug('quieter');
    logger.warn('loud');
    assert.equal(lines.length, 1, 'only the warning is written');
    assert.equal(lines[0].level, 'warn', 'it is the warning');
  });

  it('serialises errors with their message and code, and tags the request id', () => {
    configureLogger({ level: 'info', format: 'json', write: capture });
    const error = Object.assign(new Error('Resource busy'), { code: 'EBUSY' });
    runWithRequestId('req-1', () => logger.error({ err: error }, 'Open failed'));
    const entry = JSON.parse(lines[0].line);
    assert.equal(entry.err.message, 'Resource busy', 'the error message is kept');
    assert.equal(entry.err.code, 'EBUSY', 'the error code is kept');
    assert.equal(entry.requestId, 'req-1', 'lines made during a request carry its id');
  });

  it('prints readable text with the module tag in development', () => {
    configureLogger({ level: 'info', format: 'text', write: capture });
    logger.child({ module: 'output' }).warn({ port: 4000 }, 'Using the simulator');
    assert.match(lines[0].line, /WARN \[output\] Using the simulator port=4000/, 'text format is readable');
  });

  it('does not let caller fields overwrite the reserved level, message and time', () => {
    configureLogger({ level: 'info', format: 'json', write: capture });
    logger.warn({ msg: 'fake', level: 'debug', time: 'yesterday' }, 'Real message');
    const entry = JSON.parse(lines[0].line);
    assert.equal(entry.msg, 'Real message', 'the real message wins');
    assert.equal(entry.level, 'warn', 'the real level wins');
    assert.notEqual(entry.time, 'yesterday', 'the real timestamp wins');
  });
});
