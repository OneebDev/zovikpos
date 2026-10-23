// backend/test/sessionHardening.test.js
// Step 4 backend hardening tests.
// Rule A: transferSessionTable rejects sessions with orders (409 SESSION_HAS_ORDERS).
// Rule B: isSessionIdleExpired never expires sessions with cart items or orders.
// Rule C: POST /api/sessions/start always creates a NEW session (never reuses).
// All tests use node:test, mock prisma/qrSecurityService, no real DB.

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

// ============================================================
// Section 1: sessionActivity unit tests (pure, no DB)
// ============================================================

describe('sessionActivity: isSessionIdleExpired', () => {
  let isSessionIdleExpired;

  before(() => {
    process.env.SESSION_IDLE_MINUTES = '1';
    delete require.cache[require.resolve('../src/utils/sessionActivity')];
    const mod = require('../src/utils/sessionActivity');
    isSessionIdleExpired = mod.isSessionIdleExpired;
  });

  after(() => {
    delete process.env.SESSION_IDLE_MINUTES;
  });

  const makeSession = (opts = {}) => ({
    status: 'ACTIVE',
    startedAt: opts.startedAt ?? new Date(Date.now() - 5 * 60 * 1000),
    lastActivityAt: opts.lastActivityAt ?? null,
    ...opts,
  });

  test('returns false when cart has items even if idle', () => {
    const s = makeSession({ lastActivityAt: new Date(Date.now() - 2 * 60 * 1000) });
    assert.equal(isSessionIdleExpired(s, 2, 0), false);
  });

  test('returns false when session has orders even if idle', () => {
    const s = makeSession({ lastActivityAt: new Date(Date.now() - 2 * 60 * 1000) });
    assert.equal(isSessionIdleExpired(s, 0, 3), false);
  });

  test('returns false when both cart and orders exist', () => {
    const s = makeSession({ lastActivityAt: new Date(Date.now() - 2 * 60 * 1000) });
    assert.equal(isSessionIdleExpired(s, 1, 1), false);
  });

  test('returns true for empty session idle beyond SESSION_IDLE_MINUTES', () => {
    const s = makeSession({ lastActivityAt: new Date(Date.now() - 2 * 60 * 1000) });
    assert.equal(isSessionIdleExpired(s, 0, 0), true);
  });

  test('returns false for empty session idle within SESSION_IDLE_MINUTES', () => {
    const s = makeSession({ lastActivityAt: new Date(Date.now() - 30 * 1000) });
    assert.equal(isSessionIdleExpired(s, 0, 0), false);
  });

  test('falls back to startedAt when lastActivityAt is null', () => {
    const s = makeSession({ startedAt: new Date(Date.now() - 2 * 60 * 1000), lastActivityAt: null });
    assert.equal(isSessionIdleExpired(s, 0, 0), true);
  });

  test('returns true for non-ACTIVE status regardless of cart/orders', () => {
    const s = makeSession({ status: 'EXPIRED' });
    assert.equal(isSessionIdleExpired(s, 5, 5), true);
  });

  test('returns true when session is null', () => {
    assert.equal(isSessionIdleExpired(null, 0, 0), true);
  });
});

// ============================================================
// Section 2: touchSessionActivity throttle (DB mock)
// ============================================================

describe('sessionActivity: touchSessionActivity throttle', () => {
  let updateManyCallCount;
  let _origUpdateMany;

  before(() => {
    const dbMod = require('../src/config/db');
    _origUpdateMany = dbMod.prisma.session.updateMany.bind(dbMod.prisma.session);
    dbMod.prisma.session.updateMany = async () => {
      updateManyCallCount++;
      return { count: 1 };
    };
  });

  after(() => {
    const dbMod = require('../src/config/db');
    dbMod.prisma.session.updateMany = _origUpdateMany;
  });

  beforeEach(() => { updateManyCallCount = 0; });

  test('writes to DB when lastActivityAt is null', async () => {
    const { touchSessionActivity } = require('../src/utils/sessionActivity');
    await touchSessionActivity('session-abc', null);
    assert.equal(updateManyCallCount, 1);
  });

  test('skips DB write when lastActivityAt < 30s ago', async () => {
    const { touchSessionActivity } = require('../src/utils/sessionActivity');
    await touchSessionActivity('session-abc', new Date(Date.now() - 10 * 1000));
    assert.equal(updateManyCallCount, 0);
  });

  test('writes to DB when lastActivityAt > 30s ago', async () => {
    const { touchSessionActivity } = require('../src/utils/sessionActivity');
    await touchSessionActivity('session-abc', new Date(Date.now() - 35 * 1000));
    assert.equal(updateManyCallCount, 1);
  });

  test('does nothing for empty sessionId', async () => {
    const { touchSessionActivity } = require('../src/utils/sessionActivity');
    await touchSessionActivity('', null);
    assert.equal(updateManyCallCount, 0);
  });
});

// ============================================================
// Section 3: transferSessionTable Rule A (HTTP integration, mock prisma)
// ============================================================

describe('transferSessionTable Rule A', () => {
  let server;
  let baseUrl;
  let orderCountReturnValue = 0;

  before(async () => {
    const dbMod = require('../src/config/db');
    const qrMod = require('../src/services/qrSecurityService');

    // Mock verifyTableToken
    qrMod._origVerifyTableToken = qrMod.verifyTableToken;
    qrMod.verifyTableToken = () => ({
      valid: true,
      normalizedToken: 'tok-A',
      tableNumber: '1',
      branchId: '1',
    });

    // Mock table.findFirst
    dbMod.prisma.table._origFindFirst = dbMod.prisma.table.findFirst.bind(dbMod.prisma.table);
    dbMod.prisma.table.findFirst = async () => ({
      id: 'table-1',
      tableNumber: 'Table 1',
      branchId: '1',
      qrToken: 'tok-A',
      isActive: true,
      branch: { id: '1' },
    });

    // Mock session.findUnique
    dbMod.prisma.session._origFindUnique = dbMod.prisma.session.findUnique.bind(dbMod.prisma.session);
    dbMod.prisma.session.findUnique = async () => ({
      id: 'sess-1',
      status: 'ACTIVE',
      tableId: 'table-old',
      tableLabel: 'Table Old',
      customerId: 'customer-1',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      table: { id: 'table-old', tableNumber: '1', branchId: '1', isActive: true, qrToken: 'tok-A' },
    });

    // Mock $transaction
    dbMod.prisma._origTransaction = dbMod.prisma.$transaction.bind(dbMod.prisma);
    dbMod.prisma.$transaction = async (fn) => {
      const tx = {
        session: {
          findUnique: async () => ({ id: 'sess-1', status: 'ACTIVE', tableId: 'table-old' }),
          update: async () => ({
            id: 'sess-1',
            tableId: 'table-1',
            tableLabel: 'Table 1',
            status: 'ACTIVE',
            table: { id: 'table-1', tableNumber: 'Table 1', branchId: '1', isActive: true },
          }),
        },
        order: {
          count: async () => orderCountReturnValue,
        },
      };
      return fn(tx);
    };

    const { transferSessionTable } = require('../src/controllers/sessionController');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'customer-1', role: 'CUSTOMER' };
      next();
    });
    app.post('/transfer', transferSessionTable);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const dbMod = require('../src/config/db');
    const qrMod = require('../src/services/qrSecurityService');
    if (qrMod._origVerifyTableToken) qrMod.verifyTableToken = qrMod._origVerifyTableToken;
    if (dbMod.prisma.table._origFindFirst) dbMod.prisma.table.findFirst = dbMod.prisma.table._origFindFirst;
    if (dbMod.prisma.session._origFindUnique) dbMod.prisma.session.findUnique = dbMod.prisma.session._origFindUnique;
    if (dbMod.prisma._origTransaction) dbMod.prisma.$transaction = dbMod.prisma._origTransaction;
  });

  const post = (body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${baseUrl}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  test('returns 409 SESSION_HAS_ORDERS when session has any order', async () => {
    orderCountReturnValue = 2;
    const res = await post({ sessionId: 'sess-1', qrToken: 'tok-A' });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'SESSION_HAS_ORDERS');
  });

  test('returns 200 and moves session when cart-only (no orders)', async () => {
    orderCountReturnValue = 0;
    const res = await post({ sessionId: 'sess-1', qrToken: 'tok-A' });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.session, 'Response should include session');
    assert.deepEqual(res.body.orders, []);
  });

  test('returns 400 when sessionId is missing', async () => {
    orderCountReturnValue = 0;
    const res = await post({ qrToken: 'tok-A' });
    assert.equal(res.status, 400);
  });
});

// ============================================================
// Section 4: Rule C - startSession always calls session.create
// ============================================================

describe('startSession Rule C: always creates a new session', () => {
  let createCallCount = 0;
  let _origCreate;
  let _origTableFindFirst;
  let _origVerify;

  before(() => {
    const dbMod = require('../src/config/db');
    const qrMod = require('../src/services/qrSecurityService');

    _origCreate = dbMod.prisma.session.create.bind(dbMod.prisma.session);
    dbMod.prisma.session.create = async () => {
      createCallCount++;
      return {
        id: `fake-sess-${createCallCount}`,
        tableId: 'table-1',
        status: 'ACTIVE',
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivityAt: new Date(),
        cart: { id: 'cart-1', items: [] },
        tableLabel: 'Table 1',
        customerId: null,
        customer: null,
        table: {
          id: 'table-1',
          tableNumber: 'Table 1',
          qrToken: 'tok-A',
          branchId: '1',
          isActive: true,
          branch: { id: '1', name: 'Main', restaurantId: 'r-1', isOpen: true },
        },
        _count: { orders: 0 },
      };
    };

    _origTableFindFirst = dbMod.prisma.table.findFirst.bind(dbMod.prisma.table);
    dbMod.prisma.table.findFirst = async () => ({
      id: 'table-1',
      tableNumber: 'Table 1',
      branchId: '1',
      qrToken: 'tok-A',
      isActive: true,
      branch: { id: '1', name: 'Main', restaurantId: 'r-1', isOpen: true },
    });

    _origVerify = qrMod.verifyTableToken;
    qrMod.verifyTableToken = () => ({
      valid: true,
      normalizedToken: 'tok-A',
      tableNumber: '1',
      branchId: '1',
    });
  });

  after(() => {
    const dbMod = require('../src/config/db');
    const qrMod = require('../src/services/qrSecurityService');
    if (_origCreate) dbMod.prisma.session.create = _origCreate;
    if (_origTableFindFirst) dbMod.prisma.table.findFirst = _origTableFindFirst;
    if (_origVerify) qrMod.verifyTableToken = _origVerify;
  });

  test('startSession calls session.create exactly once per invocation', async () => {
    const { startSession } = require('../src/controllers/sessionController');

    const before = createCallCount;
    let responseBody;
    const req = {
      body: { qrToken: 'tok-A' },
      user: null,
      headers: {},
      get: () => null,
      ip: '127.0.0.1',
    };
    const res = {
      status() { return this; },
      json(body) { responseBody = body; return this; },
    };

    await startSession(req, res);

    const delta = createCallCount - before;
    assert.equal(delta, 1, `Expected session.create called once, got ${delta}`);
    assert.ok(!responseBody?.error, `startSession returned error: ${JSON.stringify(responseBody)}`);
    assert.ok(responseBody?.session?.id, 'Response must include session.id');
  });

  test('calling startSession twice creates two distinct sessions (never reused)', async () => {
    const { startSession } = require('../src/controllers/sessionController');

    const before = createCallCount;
    const ids = [];
    for (let i = 0; i < 2; i++) {
      let responseBody;
      const req = {
        body: { qrToken: 'tok-A' },
        user: null,
        headers: {},
        get: () => null,
        ip: '127.0.0.1',
      };
      const res = {
        status() { return this; },
        json(body) { responseBody = body; return this; },
      };
      await startSession(req, res);
      if (responseBody?.session?.id) ids.push(responseBody.session.id);
    }

    const delta = createCallCount - before;
    assert.equal(delta, 2, `Expected 2 session.create calls for 2 invocations, got ${delta}`);
    assert.equal(ids.length, 2, 'Should have two session ids');
    assert.notEqual(ids[0], ids[1], 'Session ids must be distinct (no reuse)');
  });
});
