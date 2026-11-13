// Tests for the error middleware: raw 5xx text never reaches the client unless the message was written to be shown.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { errorHandler } from '../../server/middleware/errorHandler.js';
import { httpError } from '../../server/utils/httpError.js';

function run(error) {
  const result = {};
  const res = {
    status(code) {
      result.status = code;
      return res;
    },
    json(body) {
      result.body = body;
    },
  };
  errorHandler(error, { id: 'req-1', method: 'GET', path: '/x' }, res, () => {});
  return result;
}

describe('errorHandler', () => {
  it('shows the message of a client error', () => {
    const { status, body } = run(httpError(400, 'Bad input'));
    assert.equal(status, 400, 'status is kept');
    assert.equal(body.error, 'Bad input', 'the message is shown');
    assert.equal(body.correlationId, 'req-1', 'with a correlation id');
  });

  it('hides the message of an ordinary server error, so internals never leak', () => {
    const { status, body } = run(Object.assign(new Error('ECONNREFUSED 10.0.0.5:5432'), { status: 500 }));
    assert.equal(status, 500, 'status is kept');
    assert.equal(body.error, 'Internal server error', 'a generic message replaces the raw text');
    assert.equal(run(new Error('boom')).body.error, 'Internal server error', 'an error with no status is generic too');
    assert.equal(
      run(httpError(502, 'secret detail')).body.error,
      'Internal server error',
      'a 5xx is hidden by default',
    );
  });

  it('shows a server error message only when it was marked safe to show', () => {
    const { status, body } = run(httpError(502, 'Could not reach the library.', { expose: true }));
    assert.equal(status, 502, 'status is kept');
    assert.equal(body.error, 'Could not reach the library.', 'the marked message is shown');
  });
});
