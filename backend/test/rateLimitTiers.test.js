// test/rateLimitTiers.test.js
// Tests for orderCreateCombinedLimiter, paymentSubmitLimiter, sessionStartLimiter.
// No database, no Prisma, no Redis required.
// node:test + plain http client.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// ---------------------------------------------------------------------------
// Stub heavy deps before requiring the middleware module.
// ---------------------------------------------------------------------------
const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const tail = request.split('/').pop();
  if (tail === 'exceptionLogger' || request.endsWith('exceptionLogger')) {
    return { log: () => {}, exception: () => {} };
  }
  // Simulate Redis being DOWN so tests exercise the in-memory fallback.
  if (tail === 'redis' || request.endsWith('/config/redis')) {
    return {
      hasRedis: false,
      checkRateLimit: async () => { throw new Error('redis down'); },
    };
  }
  return origLoad.apply(this, arguments);
};

// Force NODE_ENV to 'production' so loopback bypass does not fire.
const savedEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

// Use very short windows so the test runs fast.
process.env.ORDER_RATE_WINDOW_MS = '2000';   // 2 s window
process.env.ORDER_RATE_SESSION_MAX = '10';   // 10 per session
process.env.ORDER_RATE_IP_MAX = '60';        // 60 per IP
process.env.PAYMENT_RATE_WINDOW_MS = '2000';
process.env.PAYMENT_RATE_USER_MAX = '8';
process.env.PAYMENT_RATE_IP_MAX = '60';
process.env.SESSION_RATE_WINDOW_MS = '2000';
process.env.SESSION_RATE_IP_MAX = '60';

const {
  orderCreateCombinedLimiter,
  paymentSubmitLimiter,
  sessionStartLimiter,
} = require('../src/middleware/rateLimitMiddleware');

// ---------------------------------------------------------------------------
// Helper: plain http POST with JSON body, returns { status, body, headers }.
// ---------------------------------------------------------------------------
function post(server, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const addr = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Build a tiny Express app for order create tests.
// Simulate: req.user.id is set by auth, req.body.sessionId comes from body.
// ---------------------------------------------------------------------------
function buildOrderApp() {
  const app = express();
  app.use(express.json());
  // Simulate auth middleware: injects user from header or defaults to user 99.
  app.use((req, res, next) => {
    const headerUserId = req.headers['x-test-user-id'];
    if (headerUserId) {
      req.user = { id: parseInt(headerUserId, 10), role: 'CUSTOMER' };
    } else if (headerUserId === 'none') {
      req.user = null;
    } else {
      req.user = { id: 99, role: 'CUSTOMER' };
    }
    next();
  });
  app.post('/orders', orderCreateCombinedLimiter, (req, res) => {
    res.json({ ok: true });
  });
  return http.createServer(app);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Rate limit tiers', () => {
  let orderServer;

  before((_, done) => {
    orderServer = buildOrderApp();
    orderServer.listen(0, '127.0.0.1', done);
  });

  after((_, done) => {
    orderServer.close(done);
    process.env.NODE_ENV = savedEnv;
  });

  // Test A: 11th order from the SAME user key gets 429 even with 11 DIFFERENT random sessionIds.
  test('A: same user sending 15 orders with DIFFERENT sessionIds gets 429 after 10', async () => {
    const userId = '101';
    let successes = 0;
    let blocked = false;
    for (let i = 0; i < 15; i++) {
      const randomSession = `rand-session-${Date.now()}-${i}-${Math.random()}`;
      const res = await post(orderServer, '/orders', { sessionId: randomSession }, { 'x-test-user-id': userId });
      if (res.status === 200) successes++;
      if (res.status === 429) {
        blocked = true;
        break;
      }
    }
    assert.equal(successes, 10, `Expected exactly 10 successes before rate limit, got ${successes}`);
    assert.ok(blocked, 'Expected 429 on request 11');
  });

  // Test B: two different users on the same IP are both allowed their own 10.
  test('B: two different users on same IP are both allowed their own 10', async () => {
    const userA = '201';
    const userB = '202';

    let countA = 0;
    for (let i = 0; i < 10; i++) {
      const res = await post(orderServer, '/orders', { sessionId: `sess-a-${i}` }, { 'x-test-user-id': userA });
      if (res.status === 200) countA++;
    }
    assert.equal(countA, 10, `User A should get 10 successes, got ${countA}`);

    let countB = 0;
    for (let i = 0; i < 10; i++) {
      const res = await post(orderServer, '/orders', { sessionId: `sess-b-${i}` }, { 'x-test-user-id': userB });
      if (res.status === 200) countB++;
    }
    assert.equal(countB, 10, `User B should get 10 successes on same IP, got ${countB}`);
  });

  // Test C: in-memory fallback works when Redis is down.
  test('C: in-memory fallback works when Redis is down (10 allowed, 11th blocked)', async () => {
    const userId = '301';
    let successes = 0;
    let blocked = false;
    for (let i = 0; i < 11; i++) {
      const res = await post(orderServer, '/orders', { sessionId: 'session-c' }, { 'x-test-user-id': userId });
      if (res.status === 200) successes++;
      if (res.status === 429) { blocked = true; break; }
    }
    assert.equal(successes, 10, `Expected 10 successes, got ${successes}`);
    assert.ok(blocked, 'Expected a 429 on the 11th request');
  });
});
