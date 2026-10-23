// backend/test/realPostgres.sessionHardening.test.js
// Dedicated real-Postgres test suite for session hardening and sweep jobs.
// Runs with zero mocks against the active database when host is localhost.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');

describe('Real-Postgres Session Hardening & Sweep (No Mocks)', () => {
  test('Real-Postgres: sweep must cancel stale PENDING UNPAID order and keep accepted order unchanged', async (t) => {
    const rawUrl = process.env.DATABASE_URL;
    let host = '';
    try {
      if (rawUrl) host = new URL(rawUrl).hostname;
    } catch {}

    const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    if (!isLocalhost) {
      t.skip(`Skipping real-Postgres test: DATABASE_URL host is "${host || 'not set'}", not localhost`);
      return;
    }

    const { prisma: realPrisma } = require('../src/config/db');
    const { runSweep } = require('../src/services/sweepJob');

    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let testUser = null;
    let staleOrder = null;
    let acceptedOrder = null;

    try {
      testUser = await realPrisma.user.create({
        data: {
          email: `sweep-test-${rand}@test.local`,
          name: 'Sweep Test Customer',
          password: 'test-hashed-password',
          role: 'CUSTOMER',
        },
      });

      // 1. Create a stale PENDING UNPAID order older than timeout (should be cancelled by sweep)
      staleOrder = await realPrisma.order.create({
        data: {
          orderNumber: `TEST-STALE-${rand}`,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago (older than timeout)
          subtotal: 10,
          tax: 0,
          total: 10,
          userId: testUser.id,
        },
      });

      // 2. Create another stale order for the concurrent accept vs sweep race
      acceptedOrder = await realPrisma.order.create({
        data: {
          orderNumber: `TEST-ACCEPTED-${rand}`,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago (older than timeout)
          subtotal: 10,
          tax: 0,
          total: 10,
          userId: testUser.id,
        },
      });

      // Run acceptance and sweep concurrently
      const acceptPromise = realPrisma.order.update({
        where: { id: acceptedOrder.id },
        data: { status: 'PREPARING' }, // Cashier accepted!
      });
      const sweepPromise = runSweep({ db: realPrisma });

      await Promise.all([acceptPromise, sweepPromise]);

      // 4. Assertions:
      // Sweep must cancel the PENDING UNPAID order older than timeout
      const afterStaleOrder = await realPrisma.order.findUnique({ where: { id: staleOrder.id } });
      assert.equal(afterStaleOrder.status, 'CANCELLED', 'Stale PENDING UNPAID order must be cancelled by runSweep');

      // Concurrent accept vs sweep: accepted status survives
      const afterAcceptedOrder = await realPrisma.order.findUnique({ where: { id: acceptedOrder.id } });
      assert.equal(afterAcceptedOrder.status, 'PREPARING', 'Order accepted concurrently with sweep must remain PREPARING, not CANCELLED');
    } finally {
      // Clean up using only test ids
      const orderIds = [staleOrder?.id, acceptedOrder?.id].filter(Boolean);
      if (orderIds.length > 0) {
        await realPrisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
        await realPrisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
      }
      if (testUser?.id) {
        await realPrisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
      }
    }
  });

  test('Real-Postgres: transfer-table returns 409 SESSION_HAS_ORDERS when an order exists', async (t) => {
    const rawUrl = process.env.DATABASE_URL;
    let host = '';
    try {
      if (rawUrl) host = new URL(rawUrl).hostname;
    } catch {}

    const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    if (!isLocalhost) {
      t.skip(`Skipping real-Postgres test: DATABASE_URL host is "${host || 'not set'}", not localhost`);
      return;
    }

    const { prisma: realPrisma } = require('../src/config/db');
    const { transferSessionTable } = require('../src/controllers/sessionController');
    const { generateTableToken } = require('../src/services/qrSecurityService');

    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let testBranch = null;
    let testUser = null;
    let tableA = null;
    let tableB = null;
    let session = null;
    let order = null;

    try {
      testBranch = await realPrisma.branch.create({
        data: {
          name: `Branch-${rand}`,
          address: 'Test Address',
          phone: '+92 300 0000000',
          isActive: true,
        },
      });

      testUser = await realPrisma.user.create({
        data: {
          email: `sweep-test-${rand}@test.local`,
          name: 'Transfer Test Customer',
          password: 'test-hashed-password',
          role: 'CUSTOMER',
          branchId: testBranch.id,
        },
      });

      const tableNumA = `Table A-${rand}`;
      const tableNumB = `Table B-${rand}`;
      const tokenA = generateTableToken(tableNumA, testBranch.id);
      const tokenB = generateTableToken(tableNumB, testBranch.id);

      tableA = await realPrisma.table.create({
        data: {
          tableNumber: tableNumA,
          qrToken: tokenA,
          branchId: testBranch.id,
          isActive: true,
        },
      });
      tableB = await realPrisma.table.create({
        data: {
          tableNumber: tableNumB,
          qrToken: tokenB,
          branchId: testBranch.id,
          isActive: true,
        },
      });

      session = await realPrisma.session.create({
        data: {
          id: 'sess-real-' + rand,
          tableId: tableA.id,
          tableLabel: tableA.tableNumber,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          customerId: testUser.id,
        },
      });
      order = await realPrisma.order.create({
        data: {
          orderNumber: 'ORD-REAL-' + rand,
          sessionId: session.id,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          subtotal: 10,
          tax: 0,
          total: 10,
          userId: testUser.id,
        },
      });

      const realApp = express();
      realApp.use(express.json());
      realApp.use((req, _res, next) => {
        req.user = { id: testUser.id, role: 'CUSTOMER' };
        next();
      });
      realApp.post('/transfer-real', transferSessionTable);
      const realServer = http.createServer(realApp);
      await new Promise((resolve) => realServer.listen(0, '127.0.0.1', resolve));
      const realBase = `http://127.0.0.1:${realServer.address().port}`;

      try {
        const resp = await fetch(`${realBase}/transfer-real`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, qrToken: tokenB }),
        });
        const data = await resp.json();
        assert.equal(resp.status, 409);
        assert.equal(data.code, 'SESSION_HAS_ORDERS');
      } finally {
        await new Promise((resolve) => realServer.close(resolve));
      }
    } finally {
      if (order?.id) {
        await realPrisma.orderStatusHistory.deleteMany({ where: { orderId: order.id } }).catch((e) => console.error('[Cleanup] orderStatusHistory error:', e.message));
        await realPrisma.order.delete({ where: { id: order.id } }).catch((e) => console.error('[Cleanup] order error:', e.message));
      }
      if (session?.id) {
        await realPrisma.session.delete({ where: { id: session.id } }).catch((e) => console.error('[Cleanup] session error:', e.message));
      }
      const tableIds = [tableA?.id, tableB?.id].filter(Boolean);
      if (tableIds.length > 0) {
        await realPrisma.table.deleteMany({ where: { id: { in: tableIds } } }).catch((e) => console.error('[Cleanup] table error:', e.message));
      }
      if (testUser?.id) {
        await realPrisma.user.delete({ where: { id: testUser.id } }).catch((e) => console.error('[Cleanup] user error:', e.message));
      }
      if (testBranch?.id) {
        await realPrisma.branch.delete({ where: { id: testBranch.id } }).catch((e) => console.error('[Cleanup] branch error:', e.message));
      }
    }
  });

  test('Real-Postgres: two concurrent status updates, only one wins (409 conflict)', async (t) => {
    const rawUrl = process.env.DATABASE_URL;
    let host = '';
    try {
      if (rawUrl) host = new URL(rawUrl).hostname;
    } catch {}

    const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    if (!isLocalhost) {
      t.skip(`Skipping real-Postgres test: DATABASE_URL host is "${host || 'not set'}", not localhost`);
      return;
    }

    const { prisma: realPrisma } = require('../src/config/db');

    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let testUser = null;
    let realOrder = null;

    const realApp = express();
    realApp.use(express.json());
    realApp.use((req, _res, next) => {
      const role = req.headers['x-role'] || 'CUSTOMER';
      req.user = { id: testUser?.id || 10, role, email: testUser?.email || 'test@example.com' };
      next();
    });
    const { updateOrderStatus } = require('../src/controllers/orderController');
    realApp.put('/api/orders/:id/status', updateOrderStatus);

    const realServer = http.createServer(realApp);
    await new Promise((resolve) => realServer.listen(0, '127.0.0.1', resolve));
    const realBase = `http://127.0.0.1:${realServer.address().port}`;

    try {
      testUser = await realPrisma.user.create({
        data: {
          email: `sweep-test-${rand}@test.local`,
          name: 'Race Test Customer',
          password: 'test-hashed-password',
          role: 'CUSTOMER',
        },
      });

      // Create real test order
      realOrder = await realPrisma.order.create({
        data: {
          orderNumber: 'ORD-RACE-' + rand,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          subtotal: 20,
          tax: 0,
          total: 20,
          userId: testUser.id,
        },
      });

      // Simulate two concurrent updates targeting from PENDING
      const p1 = fetch(`${realBase}/api/orders/${realOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-role': 'KITCHEN' },
        body: JSON.stringify({ status: 'PREPARING' }),
      });
      const p2 = fetch(`${realBase}/api/orders/${realOrder.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-role': 'VENDOR' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      const statuses = [res1.status, res2.status].sort();
      // One must succeed (200) and the other must get 409 conflict
      assert.equal(statuses[0], 200);
      assert.equal(statuses[1], 409);
    } finally {
      await new Promise((resolve) => realServer.close(resolve));
      if (realOrder?.id) {
        await realPrisma.orderStatusHistory.deleteMany({ where: { orderId: realOrder.id } }).catch(() => {});
        await realPrisma.order.delete({ where: { id: realOrder.id } }).catch(() => {});
      }
      if (testUser?.id) {
        await realPrisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
      }
    }
  });

  test('Real-Postgres: session expiry edge cases (Rule B5 real DB validation)', async (t) => {
    const rawUrl = process.env.DATABASE_URL;
    let host = '';
    try {
      if (rawUrl) host = new URL(rawUrl).hostname;
    } catch {}

    const isLocalhost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    if (!isLocalhost) {
      t.skip(`Skipping real-Postgres test: DATABASE_URL host is "${host || 'not set'}", not localhost`);
      return;
    }

    const { prisma: realPrisma } = require('../src/config/db');
    const { runSweep } = require('../src/services/sweepJob');

    const origIdle = process.env.SESSION_IDLE_MINUTES;
    const origAbandon = process.env.CART_ABANDON_MINUTES;
    process.env.SESSION_IDLE_MINUTES = '10';
    process.env.CART_ABANDON_MINUTES = '30';

    const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    let branch = null;
    let user = null;
    let table = null;
    let category = null;
    let menuItem = null;

    let sEmptyIdle = null;
    let sCart20m = null;
    let sCart31m = null;
    let sUnfinishedOrder = null;
    let sCompletedOrderIdle = null;
    let sRecentActivity = null;

    let cart20m = null;
    let cart31m = null;
    let cartItem31m = null;
    let unfinishedOrder = null;
    let completedOrder = null;

    try {
      branch = await realPrisma.branch.create({
        data: { name: `Branch-B5-${rand}`, isActive: true },
      });
      user = await realPrisma.user.create({
        data: {
          email: `b5-${rand}@test.local`,
          name: 'B5 Test Customer',
          password: 'test-password',
          role: 'CUSTOMER',
          branchId: branch.id,
        },
      });
      table = await realPrisma.table.create({
        data: {
          tableNumber: `Table-B5-${rand}`,
          qrToken: `tok-b5-${rand}`,
          branchId: branch.id,
          isActive: true,
        },
      });
      category = await realPrisma.category.create({
        data: { name: `Cat-${rand}`, slug: `cat-${rand}` },
      });
      menuItem = await realPrisma.menuItem.create({
        data: {
          name: `Item-${rand}`,
          price: 50,
          category: category.name,
          branchId: branch.id,
        },
      });

      // 1. empty-cart session idle >10 min (15 min ago) -> expires
      sEmptyIdle = await realPrisma.session.create({
        data: {
          id: `sess-empty-idle-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 15 * 60 * 1000),
          lastActivityAt: new Date(now - 15 * 60 * 1000),
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });

      // 2. cart-with-items idle 20 min (under 30 min) -> does NOT expire
      sCart20m = await realPrisma.session.create({
        data: {
          id: `sess-cart-20m-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 20 * 60 * 1000),
          lastActivityAt: new Date(now - 20 * 60 * 1000),
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });
      cart20m = await realPrisma.cart.create({
        data: { sessionId: sCart20m.id },
      });
      await realPrisma.cartItem.create({
        data: {
          cartId: cart20m.id,
          menuItemId: menuItem.id,
          quantity: 1,
          price: menuItem.price,
        },
      });

      // 3. cart-with-items idle >30 min (35 min ago) -> expires and cart items deleted
      sCart31m = await realPrisma.session.create({
        data: {
          id: `sess-cart-31m-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 35 * 60 * 1000),
          lastActivityAt: new Date(now - 35 * 60 * 1000),
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });
      cart31m = await realPrisma.cart.create({
        data: { sessionId: sCart31m.id },
      });
      cartItem31m = await realPrisma.cartItem.create({
        data: {
          cartId: cart31m.id,
          menuItemId: menuItem.id,
          quantity: 2,
          price: menuItem.price,
        },
      });

      // 4. session with an unfinished order (PREPARING) idle 2 hours -> never expires
      sUnfinishedOrder = await realPrisma.session.create({
        data: {
          id: `sess-unfin-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 120 * 60 * 1000),
          lastActivityAt: new Date(now - 120 * 60 * 1000),
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });
      unfinishedOrder = await realPrisma.order.create({
        data: {
          orderNumber: `ORD-UNFIN-${rand}`,
          sessionId: sUnfinishedOrder.id,
          status: 'PREPARING',
          paymentStatus: 'PAID',
          subtotal: 50,
          tax: 0,
          total: 50,
          userId: user.id,
        },
      });

      // 5. session whose orders are all COMPLETED and idle >10 min (15 min ago) -> expires
      sCompletedOrderIdle = await realPrisma.session.create({
        data: {
          id: `sess-comp-idle-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 15 * 60 * 1000),
          lastActivityAt: new Date(now - 15 * 60 * 1000),
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });
      completedOrder = await realPrisma.order.create({
        data: {
          orderNumber: `ORD-COMP-${rand}`,
          sessionId: sCompletedOrderIdle.id,
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          subtotal: 50,
          tax: 0,
          total: 50,
          userId: user.id,
        },
      });

      // 6. session with activity in the last minute -> does not expire
      sRecentActivity = await realPrisma.session.create({
        data: {
          id: `sess-recent-${rand}`,
          tableId: table.id,
          status: 'ACTIVE',
          startedAt: new Date(now - 60 * 60 * 1000), // started 1h ago
          lastActivityAt: new Date(now - 30 * 1000), // active 30s ago
          expiresAt: new Date(now + 3600000),
          customerId: user.id,
        },
      });

      // Run sweep on real DB at current timestamp `now`
      const sweepResult = await runSweep({ db: realPrisma, nowMs: now });
      assert.ok(sweepResult !== null && typeof sweepResult === 'object', 'runSweep must return a result object');
      assert.notEqual(sweepResult.skipped, true, 'runSweep must not be skipped in test');

      // Verifications:
      // (1) empty-cart session idle >10 min expires
      const afterEmptyIdle = await realPrisma.session.findUnique({ where: { id: sEmptyIdle.id } });
      assert.equal(afterEmptyIdle.status, 'EXPIRED', 'Empty-cart session idle >10 min must expire');

      // (2) cart-with-items idle 20 min does NOT expire
      const afterCart20m = await realPrisma.session.findUnique({ where: { id: sCart20m.id } });
      assert.equal(afterCart20m.status, 'ACTIVE', 'Cart-with-items idle 20m must remain ACTIVE');

      // (3) cart-with-items idle >30 min expires and its cart items are deleted
      const afterCart31m = await realPrisma.session.findUnique({ where: { id: sCart31m.id } });
      assert.equal(afterCart31m.status, 'EXPIRED', 'Cart-with-items idle >30m must expire');
      const remainingCartItems31m = await realPrisma.cartItem.count({ where: { cartId: cart31m.id } });
      assert.equal(remainingCartItems31m, 0, 'Cart items of expired cart must be deleted');

      // (4) session with an unfinished order never expires
      const afterUnfinished = await realPrisma.session.findUnique({ where: { id: sUnfinishedOrder.id } });
      assert.equal(afterUnfinished.status, 'ACTIVE', 'Session with unfinished order must never expire');

      // (5) session whose orders are all COMPLETED and idle >10 min expires
      const afterCompletedIdle = await realPrisma.session.findUnique({ where: { id: sCompletedOrderIdle.id } });
      assert.equal(afterCompletedIdle.status, 'EXPIRED', 'Session with all completed orders idle >10m must expire');

      // (6) session with activity in the last minute does not expire
      const afterRecent = await realPrisma.session.findUnique({ where: { id: sRecentActivity.id } });
      assert.equal(afterRecent.status, 'ACTIVE', 'Session with activity in the last minute must not expire');
    } finally {
      // Clean up in reverse dependency order using only test IDs
      const orderIds = [unfinishedOrder?.id, completedOrder?.id].filter(Boolean);
      if (orderIds.length > 0) {
        await realPrisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }).catch((e) => console.error('[Cleanup] orderStatusHistory error:', e.message));
        await realPrisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch((e) => console.error('[Cleanup] order error:', e.message));
      }

      const cartIds = [cart20m?.id, cart31m?.id].filter(Boolean);
      if (cartIds.length > 0) {
        await realPrisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } }).catch((e) => console.error('[Cleanup] cartItem error:', e.message));
        await realPrisma.cart.deleteMany({ where: { id: { in: cartIds } } }).catch((e) => console.error('[Cleanup] cart error:', e.message));
      }

      const sessionIds = [
        sEmptyIdle?.id,
        sCart20m?.id,
        sCart31m?.id,
        sUnfinishedOrder?.id,
        sCompletedOrderIdle?.id,
        sRecentActivity?.id,
      ].filter(Boolean);
      if (sessionIds.length > 0) {
        await realPrisma.session.deleteMany({ where: { id: { in: sessionIds } } }).catch((e) => console.error('[Cleanup] session error:', e.message));
      }

      if (menuItem?.id) {
        await realPrisma.menuItem.delete({ where: { id: menuItem.id } }).catch((e) => console.error('[Cleanup] menuItem error:', e.message));
      }
      if (category?.id) {
        await realPrisma.category.delete({ where: { id: category.id } }).catch((e) => console.error('[Cleanup] category error:', e.message));
      }
      if (table?.id) {
        await realPrisma.table.delete({ where: { id: table.id } }).catch((e) => console.error('[Cleanup] table error:', e.message));
      }
      if (user?.id) {
        await realPrisma.user.delete({ where: { id: user.id } }).catch((e) => console.error('[Cleanup] user error:', e.message));
      }
      if (branch?.id) {
        await realPrisma.branch.delete({ where: { id: branch.id } }).catch((e) => console.error('[Cleanup] branch error:', e.message));
      }
      if (origIdle === undefined) delete process.env.SESSION_IDLE_MINUTES;
      else process.env.SESSION_IDLE_MINUTES = origIdle;
      if (origAbandon === undefined) delete process.env.CART_ABANDON_MINUTES;
      else process.env.CART_ABANDON_MINUTES = origAbandon;
    }
  });
});
