// test/requestTimeout.test.js
// Unit tests for requestTimeout middleware using node:test and a tiny Express app.
// No database, no Prisma, no Redis required.

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// ---------------------------------------------------------------------------
// Minimal stub for exceptionLogger so we do not need the full module chain.
// ---------------------------------------------------------------------------
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (
    request === '../utils/exceptionLogger' ||
    request.endsWith('exceptionLogger')
  ) {
    return {
      log: () => {},
      exception: () => {},
    };
  }
  return originalLoad.apply(this, arguments);
};

// Now require the middleware (exceptionLogger is already stubbed above).
const { requestTimeout } = require('../src/middleware/requestTimeout');

// ---------------------------------------------------------------------------
// Helper: make a plain http GET request and return { status, body }.
// ---------------------------------------------------------------------------
function get(server, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request(
      { hostname: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let body;
          try { body = JSON.parse(raw); } catch { body = raw; }
          resolve({ status: res.statusCode, body });
        });
      }
    );
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('CLIENT_TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('requestTimeout middleware', () => {
  let server;

  before((ctx, done) => {
    const app = express();

    // Use env to set a short timeout for the tests.
    process.env.REQUEST_TIMEOUT_MS = '100';

    app.use(requestTimeout);

    // Test A route: sleeps 300ms then tries to call res.json.
    app.get('/slow', (req, res) => {
      setTimeout(() => {
        // This must NOT throw ERR_HTTP_HEADERS_SENT.
        // After silenceResponse, res.json is a no-op.
        res.json({ slow: true });
      }, 300);
    });

    // Test B route: responds immediately.
    app.get('/fast', (req, res) => {
      res.json({ fast: true });
    });

    // Test C route: /health with a slow handler; must NOT be cut by middleware.
    app.get('/health', (req, res) => {
      setTimeout(() => {
        res.json({ status: 'healthy' });
      }, 200);
    });

    server = http.createServer(app);
    server.listen(0, '127.0.0.1', done);
  });

  after((ctx, done) => {
    delete process.env.REQUEST_TIMEOUT_MS;
    server.close(done);
  });

  // -------------------------------------------------------------------------
  // Test A: slow route hits the 100ms timeout, client gets 504.
  //         Late res.json in the handler must not crash the process.
  // -------------------------------------------------------------------------
  test('A: slow route gets 504 REQUEST_TIMEOUT and late res.json does not throw', async () => {
    let unhandledRejection = null;
    const onUnhandled = (err) => { unhandledRejection = err; };
    process.on('unhandledRejection', onUnhandled);

    // Wait 400ms to let the slow handler's late res.json also complete.
    const result = await get(server, '/slow', 5000);

    // Give the late-handler setTimeout (300ms) time to fire and call the stubbed res.json.
    await new Promise((r) => setTimeout(r, 400));

    process.off('unhandledRejection', onUnhandled);

    assert.equal(result.status, 504, `Expected 504, got ${result.status}`);
    assert.equal(result.body.code, 'REQUEST_TIMEOUT', `Expected code REQUEST_TIMEOUT`);
    assert.equal(unhandledRejection, null, `Unexpected unhandled rejection: ${unhandledRejection}`);
  });

  // -------------------------------------------------------------------------
  // Test B: fast route is not affected by the middleware.
  // -------------------------------------------------------------------------
  test('B: fast route returns 200 normally', async () => {
    const result = await get(server, '/fast', 2000);
    assert.equal(result.status, 200, `Expected 200, got ${result.status}`);
    assert.deepEqual(result.body, { fast: true });
  });

  // -------------------------------------------------------------------------
  // Test C: /health is in the skip list; a slow handler completes normally.
  // -------------------------------------------------------------------------
  test('C: /health with slow handler is never cut by the middleware', async () => {
    const result = await get(server, '/health', 2000);
    assert.equal(result.status, 200, `Expected 200, got ${result.status}`);
    assert.equal(result.body.status, 'healthy');
  });
});
