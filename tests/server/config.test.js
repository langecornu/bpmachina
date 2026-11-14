// Tests for configuration and shutdown: safe defaults, validation that fails fast, and a shutdown that always ends.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isLoopback, loadConfig } from '../../server/config.js';
import { createShutdown } from '../../server/lifecycle.js';

describe('configuration', () => {
  it('stays on this computer by default and trusts its own address and the dev server', () => {
    const config = loadConfig({});
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 6100);
    assert.ok(isLoopback(config.host));
    assert.ok(config.allowedOrigins.includes('http://localhost:6180'));
    assert.ok(config.allowedOrigins.includes('http://localhost:6100'));
    assert.equal(config.logFormat, 'text');
  });

  it('logs JSON in production and refuses an invalid port', () => {
    assert.equal(loadConfig({ NODE_ENV: 'production' }).logFormat, 'json');
    assert.throws(() => loadConfig({ PORT: '99999' }), /Invalid environment/);
  });
});

describe('shutdown', () => {
  /** @param {{ waitForSave?: Promise<unknown> }} [options] */
  const setUp = ({ waitForSave = Promise.resolve() } = {}) => {
    const calls = [];
    const shutdown = createShutdown({
      server: {
        close: (done) => {
          calls.push('close');
          done();
        },
        closeAllConnections: () => calls.push('connections'),
      },
      songService: { writeQueue: waitForSave },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      exit: (code) => calls.push(`exit ${code}`),
      timeoutMs: 50,
    });
    return { calls, shutdown };
  };

  it('closes the server, waits for the last save and exits cleanly', async () => {
    const { calls, shutdown } = setUp();
    await shutdown('SIGTERM');
    assert.deepEqual(calls, ['close', 'connections', 'exit 0']);
  });

  it('quits at once on a second signal', async () => {
    const { calls, shutdown } = setUp({ waitForSave: new Promise(() => {}) });
    shutdown('SIGINT');
    await shutdown('SIGINT');
    assert.ok(calls.includes('exit 1'));
  });

  it('carries on when the last save failed', async () => {
    const { calls, shutdown } = setUp({ waitForSave: Promise.reject(new Error('disk full')) });
    await shutdown('SIGTERM');
    assert.ok(calls.includes('exit 0'));
  });
});
