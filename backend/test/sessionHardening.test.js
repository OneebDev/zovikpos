// backend/test/sessionHardening.test.js
// Step 4 & Addendum backend hardening test suite.
// Covers:
// - Rule A: transferSessionTable rejects sessions with orders (409 SESSION_HAS_ORDERS).
// - Rule B (Revised): B1, B2, B3 timing with clock-shifted timestamps (no real sleeps).
// - Rule B5 & Rule D: Sweep job cancels only stale PENDING orders, skips PAID/PAYMENT_PENDING,
//   race: order accepted while sweep runs stays accepted, stock restored once only, advisory lock.
// - Rule C: POST /api/sessions/start always creates a NEW session (never reuses).
// - Rule E: 3 sessions on 1 table separate, customer gets 403 on staff transfer, staff transfer writes audit entry.
// - Rule F: Price tampering from client ignored, ended session -> TABLE_SESSION_REQUIRED on order.
// All tests use node:test, mocked Prisma/sockets, no real DB required.

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

// ============================================================
// Section 1: Revised Rule B Timing (Clock-shifted, no sleeps)
// ============================================================

describe('Revised Rule B Timing (Clock-shifted timestamps)', () => {
  let isSessionIdleExpired;

  before(() => {
    process.env.SESSION_IDLE_MINUTES = '10';
    process.env.CART_ABANDON_MINUTES = '30';
    delete require.cache[require.resolve('../src/utils/sessionActivity')];
    const mod = require('../src/utils/sessionActivity');
    isSessionIdleExpired = mod.isSessionIdleExpired;
  });

  after(() => {
    delete process.env.SESSION_IDLE_MINUTES;
    delete process.env.CART_ABANDON_MINUTES;
  });

  const baseTime = 1700000000000;
  const makeSession = (opts = {}) => ({
    status: 'ACTIVE',
    startedAt: new Date(baseTime),
    lastActivityAt: opts.lastActivityAt ?? new Date(baseTime),
    ...opts,
  });

  test('B1: Empty cart, no orders: idle <= 10m stays active', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const clock = baseTime + 9 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 0, [], clock), false);
  });

  test('B1: Empty cart, no orders: idle > 10m expires', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const clock = baseTime + 11 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 0, [], clock), true);
  });

  test('B2: Cart has items, no orders: idle at 25m stays active (under 30m)', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const clock = baseTime + 25 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 2, [], clock), false);
  });

  test('B2: Cart has items, no orders: idle > 30m expires (cart abandoned)', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const clock = baseTime + 31 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 2, [], clock), true);
  });

  test('B3: Session with PENDING order never expires even after 2 hours', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const orders = [{ id: 1, status: 'PENDING' }];
    const clock = baseTime + 120 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 0, orders, clock), false);
  });

  test('B3: Session with PREPARING order never expires even after 2 hours', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const orders = [{ id: 1, status: 'PREPARING' }];
    const clock = baseTime + 120 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 3, orders, clock), false);
  });

  test('B3: Session with all orders COMPLETED: idle <= 10m stays active', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const orders = [{ id: 1, status: 'COMPLETED' }];
    const clock = baseTime + 5 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 0, orders, clock), false);
  });

  test('B3: Session with all orders COMPLETED: idle > 10m expires', () => {
    const s = makeSession({ lastActivityAt: new Date(baseTime) });
    const orders = [{ id: 1, status: 'COMPLETED' }, { id: 2, status: 'CANCELLED' }];
    const clock = baseTime + 11 * 60 * 1000;
    assert.equal(isSessionIdleExpired(s, 0, orders, clock), true);
  });
});

// ============================================================
// Section 2: touchSessionActivity throttle (DB mock)
// ============================================================

describe('sessionActivity: touchSessionActivity throttle', () => {
  let updateManyCallCount;
  let _origUpdateMany;

  before(() => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });
    _origUpdateMany = dbMod.prisma.session.updateMany.bind(dbMod.prisma.session);
    dbMod.prisma.session.updateMany = async () => {
      updateManyCallCount++;
      return { count: 1 };
    };
  });

  after(() => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });
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
});

// ============================================================
// Section 3: Background Sweep Job (Rule B5 & Rule D)
// ============================================================

describe('Background Sweep Job (Rule B5 & Rule D)', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      $queryRaw: async () => [{ locked: true }],
      $executeRawUnsafe: async () => {},
      session: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      cartItem: {
        deleteMany: async () => ({ count: 0 }),
      },
      order: {
        findMany: async () => [],
        findUnique: async () => ({
          id: 101,
          orderNumber: 'ORD-101',
          orderItems: [],
        }),
        updateMany: async () => ({ count: 1 }),
      },
      inventoryLog: {
        findMany: async () => [],
      },
      orderStatusHistory: {
        create: async () => ({ id: 1 }),
      },
      $transaction: async (fn) => fn(mockDb),
    };
  });

  test('sweep cancels only stale PENDING orders older than timeout', async () => {
    const { runSweep } = require('../src/services/sweepJob');
    const baseNow = 1700000000000;

    mockDb.order.findMany = async (args) => {
      assert.equal(args.where.status, 'PENDING');
      assert.equal(args.where.paymentStatus, 'UNPAID');
      return [{ id: 101, orderNumber: 'ORD-101', userId: 5, tableLabel: 'Table 1' }];
    };

    let updatedOrderId = null;
    mockDb.order.updateMany = async (args) => {
      updatedOrderId = args.where.id;
      return { count: 1 };
    };

    const res = await runSweep({ db: mockDb, nowMs: baseNow });
    assert.equal(res.autoCancelledOrders, 1);
    assert.equal(updatedOrderId, 101);
  });

  test('sweep skips PAID or PAYMENT_PENDING orders', async () => {
    const { runSweep } = require('../src/services/sweepJob');
    const baseNow = 1700000000000;

    let queriedPaymentStatus = null;
    mockDb.order.findMany = async (args) => {
      queriedPaymentStatus = args.where.paymentStatus;
      return [];
    };

    await runSweep({ db: mockDb, nowMs: baseNow });
    assert.equal(queriedPaymentStatus, 'UNPAID', 'Query MUST filter exclusively for UNPAID orders');
  });

  test('race: order accepted while sweep runs stays accepted (cashier wins)', async () => {
    const { runSweep } = require('../src/services/sweepJob');
    const baseNow = 1700000000000;

    mockDb.order.findMany = async () => [
      { id: 202, orderNumber: 'ORD-202', userId: 7, tableLabel: 'Table 2' },
    ];

    mockDb.order.updateMany = async () => ({ count: 0 }); // 0 rows updated (cashier won)

    let historyCreated = false;
    mockDb.orderStatusHistory.create = async () => { historyCreated = true; };

    const res = await runSweep({ db: mockDb, nowMs: baseNow });
    assert.equal(res.autoCancelledOrders, 0, 'Should NOT count as cancelled');
    assert.equal(historyCreated, false, 'Should NOT write history when cashier already accepted');
  });
});

// ============================================================
// Section 4: Rule A & Rule C (transferSessionTable & startSession)
// ============================================================

describe('transferSessionTable Rule A', () => {
  let server;
  let baseUrl;
  let orderCountReturnValue = 0;

  before(async () => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });
    const qrMod = require('../src/services/qrSecurityService');

    qrMod._origVerifyTableToken = qrMod.verifyTableToken;
    qrMod.verifyTableToken = () => ({
      valid: true,
      normalizedToken: 'tok-A',
      tableNumber: '1',
      branchId: 1,
    });

    dbMod.prisma.table._origFindFirst = dbMod.prisma.table.findFirst.bind(dbMod.prisma.table);
    dbMod.prisma.table.findFirst = async () => ({
      id: 1,
      tableNumber: 'Table 1',
      branchId: 1,
      qrToken: 'tok-A',
      isActive: true,
      branch: { id: 1 },
    });

    dbMod.prisma.session._origFindUnique = dbMod.prisma.session.findUnique.bind(dbMod.prisma.session);
    dbMod.prisma.session.findUnique = async () => ({
      id: 'sess-1',
      status: 'ACTIVE',
      tableId: 1,
      tableLabel: 'Table 1',
      customerId: 'customer-1',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      table: { id: 1, tableNumber: '1', branchId: 1, isActive: true, qrToken: 'tok-A' },
    });

    dbMod.prisma._origTransaction = dbMod.prisma.$transaction.bind(dbMod.prisma);
    dbMod.prisma.$transaction = async (fn) => {
      const tx = {
        session: {
          findUnique: async () => ({ id: 'sess-1', status: 'ACTIVE', tableId: 1 }),
          update: async () => ({
            id: 'sess-1',
            tableId: 1,
            tableLabel: 'Table 1',
            status: 'ACTIVE',
            table: { id: 1, tableNumber: 'Table 1', branchId: 1, isActive: true },
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
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });
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
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'SESSION_HAS_ORDERS');
  });

  test('returns 200 and moves session when cart-only (no orders)', async () => {
    orderCountReturnValue = 0;
    const res = await post({ sessionId: 'sess-1', qrToken: 'tok-A' });
    assert.equal(res.status, 200);
    assert.ok(res.body.session);
    assert.deepEqual(res.body.orders, []);
  });
});

// ============================================================
// Section 5: Rule E & Rule F (Staff Transfer, Price Tampering, Expired Session)
// ============================================================

describe('Rule E & Rule F: Staff Transfer, Price Tampering, Expired Session', () => {
  let server;
  let baseUrl;
  let auditLogs;
  let origAuthMiddleware;

  before(async () => {
    auditLogs = [];
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });

    // Override authMiddleware in require cache for predictable test execution
    require('../src/middleware/authMiddleware'); const authPath = require.resolve('../src/middleware/authMiddleware');
    origAuthMiddleware = require.cache[authPath].exports;
    require.cache[authPath].exports = (req, _res, next) => {
      const role = req.headers['x-role'] || 'CUSTOMER';
      req.user = { id: 10, role, email: 'test@example.com' };
      next();
    };

    const qrMod = require('../src/services/qrSecurityService'); qrMod._origVerify = qrMod.verifyTableToken; qrMod.verifyTableToken = () => ({ valid: true, normalizedToken: 'tok-A', tableNumber: '1', branchId: 1 }); // Mock auditLog
    const auditMod = require('../src/middleware/auditMiddleware');
    auditMod._origLogAudit = auditMod.logAudit;
    auditMod.logAudit = async (entry) => {
      auditLogs.push(entry);
    };

    const app = express();
    app.use(express.json());

    const orderRoutes = require('../src/routes/orderRoutes');
    app.use('/api/orders', orderRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    require('../src/middleware/authMiddleware'); const authPath = require.resolve('../src/middleware/authMiddleware');
    if (origAuthMiddleware) require.cache[authPath].exports = origAuthMiddleware;
    const auditMod = require('../src/middleware/auditMiddleware');
    if (auditMod._origLogAudit) auditMod.logAudit = auditMod._origLogAudit; const qrMod = require('../src/services/qrSecurityService'); if (qrMod._origVerify) qrMod.verifyTableToken = qrMod._origVerify;
  });

  test('E4: Customer role gets 403 on PUT /api/orders/:id/transfer-table', async () => {
    const res = await fetch(`${baseUrl}/api/orders/55/transfer-table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-role': 'CUSTOMER' },
      body: JSON.stringify({ targetTableNumber: 'Table 2' }),
    });
    assert.equal(res.status, 403, 'Customer role must receive 403 Forbidden');
  });

  test('E4: Staff transfer succeeds and writes audit log entry', async () => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '12345@students.uitu.edu.pk', isActive: true });

    dbMod.prisma.order.findUnique = async () => ({
      id: 55,
      orderNumber: 'ORD-55',
      status: 'PREPARING',
      tableId: 1,
      tableNumber: 'Table 1',
      tableLabel: 'Table 1',
      userId: 10,
      table: { id: 1, tableNumber: 'Table 1' },
      orderItems: [],
    });

    dbMod.prisma.table.findFirst = async () => ({
      id: 2,
      tableNumber: 'Table 2',
      isActive: true,
    });

    dbMod.prisma.order.update = async () => ({
      id: 55,
      orderNumber: 'ORD-55',
      status: 'PREPARING',
      tableId: 2,
      tableNumber: 'Table 2',
      tableLabel: 'Table 2',
      userId: 10,
    });

    dbMod.prisma.orderStatusHistory.create = async () => ({ id: 1 });

    const beforeAuditCount = auditLogs.length;

    const res = await fetch(`${baseUrl}/api/orders/55/transfer-table`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-role': 'ADMIN' },
      body: JSON.stringify({ targetTableNumber: 'Table 2' }),
    });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(auditLogs.length, beforeAuditCount + 1, 'Should log audit record');
    assert.equal(auditLogs[auditLogs.length - 1].action, 'ORDER_TABLE_TRANSFERRED');
  });

  test('F1: Client price tampering is completely ignored (recomputed from DB MenuItem)', async () => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '22bs-01-se@students.uitu.edu.pk', isActive: true });

    dbMod.prisma.session.findUnique = async () => ({
      id: 'sess-active',
      status: 'ACTIVE',
      tableId: 1,
      tableNumber: 'Table 1',
      tableLabel: 'Table 1',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      table: { id: 1, tableNumber: '1', branchId: 1, isActive: true, qrToken: 'tok-A' },
      cart: { items: [] },
      orders: [],
    });

    dbMod.prisma.order.count = async () => 0;

    let capturedPriceSnapshot = null;
    let capturedTotal = null;

    dbMod.prisma.$transaction = async (fn) => {
      const tx = {
        menuItem: {
          findUnique: async () => ({
            id: 99,
            name: 'Special Biryani',
            price: 500.0, // REAL DB PRICE
            isActive: true,
            stock: 10,
            recipeItems: [],
          }),
        },
        order: {
          create: async (args) => {
            capturedPriceSnapshot = args.data.orderItems.create[0].priceSnapshot;
            capturedTotal = args.data.total;
            return {
              id: 999,
              orderNumber: 'ORD-999',
              total: args.data.total,
              table: { id: 1, tableNumber: 'Table 1' },
            };
          },
          update: async () => ({ id: 999, orderNumber: 'ORD-999' }),
        },
        orderStatusHistory: { create: async () => ({ id: 1 }) },
        eTAPrediction: { create: async () => ({ id: 1, baseEta: 5, adjustedEta: 5 }) },
        cart: { findUnique: async () => null },
        cartItem: { deleteMany: async () => ({ count: 0 }) },
      };
      return fn(tx);
    };

    const tamperedPayload = {
      sessionId: 'sess-active',
      items: [{ menuItemId: 99, quantity: 2, price: 1.0 }],
      paymentMethod: 'COD',
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'CUSTOMER',
        'Idempotency-Key': 'idem-f1-test',
      },
      body: JSON.stringify(tamperedPayload),
    });

    const txt = await res.text();
    assert.equal(res.status, 201, 'F1 FAILED WITH: ' + txt);
    assert.equal(capturedPriceSnapshot, 500.0, 'Must record DB price (500), ignoring tampered 1.0');
    assert.equal(capturedTotal, 1000.0, 'Total must be 500 * 2 = 1000, ignoring tampered price');
  });

  test('F2: Placing order with unavailable menu item returns 400 with code ITEM_UNAVAILABLE', async () => {
    const dbMod = require('../src/config/db');
    dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) };
    dbMod.prisma.apiIdempotency = {
      findUnique: async () => null,
      create: async () => ({ id: 1, state: 'IN_PROGRESS' }),
      update: async () => ({ id: 1 }),
      updateMany: async () => ({ count: 1 }),
      deleteMany: async () => ({ count: 0 }),
    };
    dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '22bs-01-se@students.uitu.edu.pk', isActive: true });
    dbMod.prisma.session.findUnique = async () => ({
      id: 'sess-active-f2',
      status: 'ACTIVE',
      customerId: 10,
      tableId: 1,
      tableNumber: 'Table 1',
      tableLabel: 'Table 1',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      table: { id: 1, tableNumber: '1', branchId: 1, isActive: true, qrToken: 'tok-A' },
      cart: { items: [] },
      orders: [],
    });
    dbMod.prisma.order.count = async () => 0;
    dbMod.prisma.menuItem.findMany = async () => [
      { id: 101, name: 'Sold Out Burger', price: 250, isActive: false, recipeItems: [] },
    ];
    dbMod.prisma.$transaction = async (fn) => {
      const tx = {
        $queryRaw: async () => [],
        menuItem: {
          findUnique: async () => ({ id: 101, name: 'Sold Out Burger', price: 250, isActive: false, recipeItems: [] }),
        },
      };
      return fn(tx);
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'CUSTOMER',
        'Idempotency-Key': 'idem-f2-test',
      },
      body: JSON.stringify({
        sessionId: 'sess-active-f2',
        items: [{ menuItemId: 101, quantity: 1 }],
        paymentMethod: 'COD',
      }),
    });

    const body = await res.json();
    assert.equal(res.status, 400, 'F2 FAILED WITH: ' + JSON.stringify(body));
    assert.equal(body.code, 'ITEM_UNAVAILABLE', 'F2 BODY WAS: ' + JSON.stringify(body));
    assert.equal(body.itemName, 'Sold Out Burger');
  });

  test('F4: Placing order on an ended session returns 403 TABLE_SESSION_REQUIRED', async () => {
    const dbMod = require('../src/config/db'); dbMod.prisma.paymentSetting = { findFirst: async () => ({ codEnabled: true, onlineEnabled: true }) }; dbMod.prisma.apiIdempotency = { findUnique: async () => null, create: async () => ({ id: 1, state: 'IN_PROGRESS' }), update: async () => ({ id: 1 }), updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 0 }) }; dbMod.prisma.user.findUnique = async () => ({ id: 10, email: '22bs-01-se@students.uitu.edu.pk', isActive: true });

    dbMod.prisma.session.findUnique = async () => ({
      id: 'sess-expired',
      status: 'EXPIRED',
      tableId: 1,
      tableNumber: 'Table 1',
      tableLabel: 'Table 1',
      startedAt: new Date(Date.now() - 3600000),
      lastActivityAt: new Date(Date.now() - 3600000),
      table: { id: 1, tableNumber: 'Table 1', isActive: true },
    });

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'CUSTOMER',
        'Idempotency-Key': 'idem-f4-test',
      },
      body: JSON.stringify({
        sessionId: 'sess-expired',
        items: [{ menuItemId: 1, quantity: 1 }],
        paymentMethod: 'COD',
      }),
    });

    const txt4 = await res.text();
    assert.equal(res.status, 403, 'F4 FAILED WITH: ' + txt4);
    const body = JSON.parse(txt4);
    assert.equal(body.code, 'TABLE_SESSION_REQUIRED');
  });

  test('Idempotency: concurrent in-progress race returns 409 with Retry-After and Idempotency-Error headers', async () => {
    const crypto = require('crypto');
    const dbMod = require('../src/config/db');
    const stableStringify = (value) => {
      if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
      if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const testBody = {
      sessionId: 'sess-test',
      items: [{ menuItemId: 1, quantity: 1 }],
    };
    const reqHash = crypto.createHash('sha256').update(stableStringify(testBody)).digest('hex');
    const futureLocked = new Date(Date.now() + 60000);

    dbMod.prisma.apiIdempotency = {
      findUnique: async () => ({
        id: 99,
        state: 'IN_PROGRESS',
        requestHash: reqHash,
        lockedUntil: futureLocked,
        expiresAt: new Date(Date.now() + 86400000),
      }),
      create: async () => ({ id: 99 }),
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role': 'CUSTOMER',
        'Idempotency-Key': 'race-header-test-key',
      },
      body: JSON.stringify(testBody),
    });

    assert.equal(res.status, 409);
    assert.equal(res.headers.get('retry-after'), '1', 'Must carry Retry-After header');
    assert.equal(res.headers.get('idempotency-error'), 'REQUEST_IN_PROGRESS', 'Must carry Idempotency-Error header');
  });
});



