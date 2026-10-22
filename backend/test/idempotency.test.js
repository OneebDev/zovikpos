'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// ---- Safety guard: refuse to run unless DATABASE_URL points to localhost ----
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is not set. Refusing to run.');
let dbHost;
try { dbHost = new URL(dbUrl).hostname; } catch { throw new Error('DATABASE_URL is invalid. Refusing to run.'); }
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbHost)) {
  throw new Error(`DATABASE_URL host is "${dbHost}", not localhost. Refusing to run.`);
}

const express = require('express');
const { prisma } = require('../src/config/db');
const redis = require('../src/config/redis');
const { idempotencyMiddleware } = require('../src/middleware/idempotencyMiddleware');

const startedAt = new Date(Date.now() - 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const startApp = async (register) => {
  const app = express();
  app.use(express.json());
  register(app, idempotencyMiddleware);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      if (server.closeAllConnections) server.closeAllConnections();
    }),
  };
};

const post = (base, path, key, body) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  body: JSON.stringify(body),
});

const read = async (res) => ({
  status: res.status,
  replayed: res.headers.get('idempotent-replayed'),
  err: res.headers.get('idempotency-error'),
  retryAfter: res.headers.get('retry-after'),
  body: await res.json(),
});

test.after(async () => {
  // delete only rows created during this test run (local test DB)
  await prisma.apiIdempotency.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.$disconnect();
});

test('1. parallel requests with the same key run the handler exactly once', async () => {
  let calls = 0;
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    await sleep(300);
    res.status(201).json({ orderId: calls });
  }));
  try {
    const key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(app.base, '/api/orders', key, { item: 'tea', qty: 1 }).then(read)),
    );
    assert.equal(calls, 1, 'handler must run once');
    for (const r of results) assert.ok([201, 409].includes(r.status), `unexpected status ${r.status}`);
    const created = results.filter((r) => r.status === 201);
    assert.ok(created.length >= 1);
    for (const r of created) assert.equal(r.body.orderId, 1);
  } finally { await app.close(); }
});

test('2. replay returns identical body and Idempotent-Replayed: true', async () => {
  let calls = 0;
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    res.status(201).json({ orderId: 100 + calls, total: 12.5 });
  }));
  try {
    const key = crypto.randomUUID();
    const first = await read(await post(app.base, '/api/orders', key, { item: 'tea' }));
    const second = await read(await post(app.base, '/api/orders', key, { item: 'tea' }));
    assert.equal(first.status, 201);
    assert.equal(first.replayed, null);
    assert.equal(second.status, 201);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.replayed, 'true');
    assert.equal(calls, 1);
  } finally { await app.close(); }
});

test('3. same key + changed body = 422 (IDEMPOTENCY_KEY_REUSED)', async () => {
  let calls = 0;
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    res.status(201).json({ orderId: calls });
  }));
  try {
    const key = crypto.randomUUID();
    await post(app.base, '/api/orders', key, { item: 'tea', qty: 1 }).then(read);
    const r = await read(await post(app.base, '/api/orders', key, { item: 'tea', qty: 2 }));
    assert.equal(r.status, 422);
    assert.equal(r.err, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(calls, 1);
  } finally { await app.close(); }
});

test('4. concurrent duplicate while first is running = 409 (REQUEST_IN_PROGRESS)', async () => {
  let calls = 0;
  let markStarted;
  const started = new Promise((r) => { markStarted = r; });
  let release;
  const gate = new Promise((r) => { release = r; });
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    markStarted();
    await gate;
    res.status(201).json({ orderId: calls });
  }));
  try {
    const key = crypto.randomUUID();
    const body = { item: 'tea' };
    const firstPromise = post(app.base, '/api/orders', key, body).then(read);
    await started; // first request is inside the handler now
    const dup = await read(await post(app.base, '/api/orders', key, body));
    assert.equal(dup.status, 409);
    assert.equal(dup.err, 'REQUEST_IN_PROGRESS');
    assert.equal(dup.retryAfter, '1');
    release();
    const first = await firstPromise;
    assert.equal(first.status, 201);
    assert.equal(calls, 1);
  } finally { release(); await app.close(); }
});

test('5. Redis down = still exactly one order', async () => {
  const saved = {
    hasRedis: redis.hasRedis,
    get: redis.getIdempotencyCache,
    set: redis.setIdempotencyCache,
    del: redis.deleteIdempotencyCache,
  };
  const boom = async () => { throw new Error('redis down (simulated)'); };
  redis.hasRedis = true;
  redis.getIdempotencyCache = boom;
  redis.setIdempotencyCache = boom;
  redis.deleteIdempotencyCache = boom;
  let calls = 0;
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    await sleep(200);
    res.status(201).json({ orderId: calls });
  }));
  try {
    const key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => post(app.base, '/api/orders', key, { item: 'tea' }).then(read)),
    );
    assert.equal(calls, 1);
    for (const r of results) assert.ok([201, 409].includes(r.status));
    const replay = await read(await post(app.base, '/api/orders', key, { item: 'tea' }));
    assert.equal(replay.status, 201);
    assert.equal(replay.replayed, 'true');
    assert.equal(calls, 1);
  } finally {
    redis.hasRedis = saved.hasRedis;
    redis.getIdempotencyCache = saved.get;
    redis.setIdempotencyCache = saved.set;
    redis.deleteIdempotencyCache = saved.del;
    await app.close();
  }
});

test('6. a 5xx response releases the key so a retry can run again', async () => {
  let calls = 0;
  const app = await startApp((a, idem) => a.post('/api/orders', idem, async (req, res) => {
    calls += 1;
    if (calls === 1) return res.status(500).json({ error: 'boom' });
    return res.status(201).json({ orderId: calls });
  }));
  try {
    const key = crypto.randomUUID();
    const first = await read(await post(app.base, '/api/orders', key, { item: 'tea' }));
    assert.equal(first.status, 500);
    const second = await read(await post(app.base, '/api/orders', key, { item: 'tea' }));
    assert.equal(second.status, 201);
    assert.equal(second.replayed, null, 'must be a fresh run, not a replay');
    assert.equal(calls, 2);
  } finally { await app.close(); }
});

test('7. POST /api/sessions/start replay returns the same session', async () => {
  let created = 0;
  const app = await startApp((a, idem) => a.post('/api/sessions/start', idem, async (req, res) => {
    created += 1;
    res.status(200).json({ sessionId: `fake-session-${created}` });
  }));
  try {
    const key = crypto.randomUUID();
    const body = { token: 'fake-table-token' };
    const first = await read(await post(app.base, '/api/sessions/start', key, body));
    const second = await read(await post(app.base, '/api/sessions/start', key, body));
    assert.equal(second.replayed, 'true');
    assert.deepEqual(second.body, first.body);
    assert.equal(created, 1);
    const other = await read(await post(app.base, '/api/sessions/start', crypto.randomUUID(), body));
    assert.equal(created, 2, 'a different key is a new request');
    assert.notEqual(other.body.sessionId, first.body.sessionId);
  } finally { await app.close(); }
});