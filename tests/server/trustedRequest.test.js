// Tests for the request guard: requests addressed to someone else's name (DNS rebinding) and changes sent from other
// sites' pages (cross-site requests) are refused; this app's own pages, phones at this computer's address, and tools
// such as curl keep working.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { errorHandler } from '../../server/middleware/errorHandler.js';
import { hostnameOf, trustedRequest } from '../../server/middleware/trustedRequest.js';

let server;
let port;

before(async () => {
  const app = express();
  app.use(trustedRequest(['http://localhost:5173', 'http://stage-mac.local:4000', 'http://[::1]:4000']));
  app.all('/thing', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(() => new Promise((resolve) => server.close(resolve)));

/** Sends a request with exactly these headers (fetch does not allow setting Host). */
function send(method, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/thing', method, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('hostnameOf', () => {
  it('takes the name or address from a host, with or without a port', () => {
    assert.equal(hostnameOf('Stage-Mac.local:4000'), 'stage-mac.local');
    assert.equal(hostnameOf('192.168.1.20'), '192.168.1.20');
    assert.equal(hostnameOf('[::1]:4000'), '::1');
    assert.equal(hostnameOf('fe80::1'), 'fe80::1');
  });
});

describe('trustedRequest', () => {
  it('accepts this computer by address, by name or as localhost', async () => {
    for (const host of [
      `127.0.0.1:${port}`,
      '192.168.1.20:4000',
      'stage-mac.local:4000',
      'localhost:5173',
      '[::1]:4000',
    ]) {
      assert.equal((await send('GET', { host })).status, 200, `${host} is this computer`);
    }
  });

  it('refuses a request addressed to another name, as DNS rebinding does', async () => {
    const answer = await send('GET', { host: 'evil.example:4000' });
    assert.equal(answer.status, 403);
    assert.match(answer.body.error, /this computer’s address/);
  });

  it('takes changes from the app’s own pages and from tools that send no origin', async () => {
    assert.equal((await send('POST', { host: 'localhost:4000', origin: 'http://localhost:5173' })).status, 200);
    assert.equal((await send('POST', { host: 'localhost:4000' })).status, 200, 'curl');
    assert.equal((await send('DELETE', { host: 'localhost:4000', 'sec-fetch-site': 'same-origin' })).status, 200);
  });

  it('refuses changes sent from another site’s page', async () => {
    const answer = await send('POST', { host: 'localhost:4000', origin: 'https://evil.example' });
    assert.equal(answer.status, 403);
    assert.match(answer.body.error, /own pages/);
    assert.equal((await send('PUT', { host: 'localhost:4000', 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal(
      (await send('GET', { host: 'localhost:4000', origin: 'https://evil.example' })).status,
      200,
      'reads are left to CORS',
    );
  });
});
