// test/orderCartCaps.test.js
// Tests for Task 2: Order and Cart caps (ORDER_MAX_ITEMS, ORDER_MAX_QTY,
// ORDER_MAX_OPEN_PER_SESSION, CART_MAX_ITEMS, CART_MAX_QTY).
// No database, no Prisma required (Prisma and helpers are stubbed).
// node:test + plain http client.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Set test env caps
process.env.ORDER_MAX_ITEMS = '3';
process.env.ORDER_MAX_QTY = '5';
process.env.ORDER_MAX_OPEN_PER_SESSION = '2';
process.env.CART_MAX_ITEMS = '3';
process.env.CART_MAX_QTY = '5';

// ---------------------------------------------------------------------------
// Stub heavy modules before requiring controllers
// ---------------------------------------------------------------------------
const Module = require('node:module');
const origLoad = Module._load;

let mockOpenOrderCount = 0;
let mockCartItemsCount = 0;

Module._load = function (request, parent, isMain) {
  const tail = request.split('/').pop().replace(/\.js$/, '');
  if (tail === 'db' || request.endsWith('/config/db')) {
    return {
      prisma: {
        user: {
          findUnique: async () => ({ id: 1, email: '23sp-051-se@students.uitu.edu.pk', isActive: true }),
        },
        paymentSetting: {
          findFirst: async () => ({ codEnabled: true, onlineEnabled: true }),
          create: async () => ({ codEnabled: true, onlineEnabled: true }),
        },
        session: {
          findUnique: async () => ({
            id: 'mock-session-1',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 3600000),
            tableId: 1,
            table: { id: 1, isActive: true, branchId: 1, qrToken: 'token' },
          }),
        },
        order: {
          count: async () => mockOpenOrderCount,
        },
        cart: {
          findUnique: async () => ({ id: 100, sessionId: 'mock-session-1', items: [] }),
          create: async () => ({ id: 100, sessionId: 'mock-session-1', items: [] }),
          update: async () => ({ id: 100 }),
        },
        cartItem: {
          findFirst: async (args) => {
            // For distinct item check, if menuItemId is 99 (new item), return null
            if (args?.where?.menuItemId === 99) return null;
            if (args?.where?.menuItemId === 100) {
              return { id: 10, cartId: 100, menuItemId: 100, quantity: 4, price: 150 };
            }
            return { id: 1, cartId: 100, menuItemId: 1, quantity: 1, price: 150 };
          },
          count: async () => mockCartItemsCount,
          create: async () => ({ id: 201 }),
          update: async () => ({ id: 201 }),
          delete: async () => ({ id: 201 }),
        },
        menuItem: {
          findUnique: async (args) => ({
            id: args?.where?.id || 1,
            isActive: true,
            price: 150,
            recipeItems: [],
          }),
        },
        $transaction: async (cb) => cb({
          menuItem: {
            findUnique: async () => ({ id: 1, isActive: true, price: 150, stock: 100, recipeItems: [] }),
          },
          order: {
            create: async () => ({ id: 555, orderNumber: 'ORD-2026-999', status: 'PENDING', totalAmount: 150 }),
            update: async () => ({ id: 555, orderNumber: 'ORD-2026-999', status: 'PENDING', totalAmount: 150 }),
          },
          orderStatusHistory: {
            create: async () => ({ id: 1 }),
          },
          eTAPrediction: {
            create: async () => ({ id: 1 }),
          },
          cart: {
            findUnique: async () => null,
          },
          cartItem: {
            deleteMany: async () => ({ count: 0 }),
          },
        }),
      },
    };
  }
  if (tail === 'adminController') {
    return { clearDashboardStatsCache: async () => {} };
  }
  if (tail === 'socket' || tail === 'sockets') {
    return { emitToVendor: () => {}, emitToKitchen: () => {}, emitToUser: () => {}, emitToAdmin: () => {} };
  }
  if (tail === 'emailService') {
    return {
      sendOrderPlacementEmail: async () => {},
      sendOrderCompletionEmail: async () => {},
      sendOrderReadyEmail: async () => {},
      sendOrderCancellationEmail: async () => {},
      sendPaymentConfirmedEmail: async () => {},
    };
  }
  if (tail === 'auditMiddleware') {
    return { logAudit: () => {} };
  }
  if (tail === 'unitConverter') {
    return { convertUnit: () => 1 };
  }
  if (tail === 'tableLabel') {
    return {
      COUNTER_TABLE_LABEL: 'Counter',
      formatTableLabel: (source) => 'Table 1',
      withTableLabel: (order) => order,
      isPhysicalTable: () => true,
    };
  }
  if (tail === 'etaService') {
    return { calculateETA: async () => ({ baseEta: 5, adjustedEta: 5 }) };
  }
  if (tail === 'aiService') {
    return { estimateOrderPreparationTime: async () => 15 };
  }
  if (tail === 'exceptionLogger') {
    return { log: () => {}, exception: () => {} };
  }
  return origLoad.apply(this, arguments);
};

const { createOrder } = require('../src/controllers/orderController');
const { addItemToCart, updateCartItem } = require('../src/controllers/cartController');

function post(server, path, body) {
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
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function put(server, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const addr = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('Order and Cart Caps', () => {
  let server;

  before((_, done) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      const role = req.headers['x-role'] || 'CUSTOMER';
      req.user = { id: 1, role };
      next();
    });

    app.post('/orders', createOrder);
    app.post('/cart/:sessionId/items', addItemToCart);
    app.put('/cart/:sessionId/items/:itemId', updateCartItem);

    server = http.createServer(app);
    server.listen(0, '127.0.0.1', done);
  });

  after((_, done) => {
    server.close(done);
  });

  test('Order: rejects when items array exceeds ORDER_MAX_ITEMS (4 > 3)', async () => {
    const res = await post(server, '/orders', {
      sessionId: 'mock-session-1',
      paymentMethod: 'COD',
      items: [
        { menuItemId: 1, quantity: 1 },
        { menuItemId: 2, quantity: 1 },
        { menuItemId: 3, quantity: 1 },
        { menuItemId: 4, quantity: 1 },
      ],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ORDER_TOO_LARGE');
  });

  test('Order: rejects when item quantity exceeds ORDER_MAX_QTY (6 > 5)', async () => {
    const res = await post(server, '/orders', {
      sessionId: 'mock-session-1',
      paymentMethod: 'COD',
      items: [
        { menuItemId: 1, quantity: 6 },
      ],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_QUANTITY');
  });

  test('Order: rejects with 429 TOO_MANY_OPEN_ORDERS when session open orders >= max', async () => {
    mockOpenOrderCount = 2; // equals ORDER_MAX_OPEN_PER_SESSION
    const res = await post(server, '/orders', {
      sessionId: 'mock-session-1',
      paymentMethod: 'COD',
      items: [{ menuItemId: 1, quantity: 1 }],
    });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'TOO_MANY_OPEN_ORDERS');
    mockOpenOrderCount = 0;
  });

  test('Cart: rejects add when quantity exceeds CART_MAX_QTY (6 > 5)', async () => {
    const res = await post(server, '/cart/mock-session-1/items', {
      menuItemId: 1,
      quantity: 6,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_QUANTITY');
  });

  test('Cart: rejects add when distinct items reaches CART_MAX_ITEMS', async () => {
    mockCartItemsCount = 3; // equals CART_MAX_ITEMS
    const res = await post(server, '/cart/mock-session-1/items', {
      menuItemId: 99,
      quantity: 1,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ORDER_TOO_LARGE');
    mockCartItemsCount = 0;
  });

  test('Order: staff/cashier role is EXEMPT from open order cap', async () => {
    mockOpenOrderCount = 10; // high open orders
    // Send request with staff/admin role
    const payload = JSON.stringify({
      sessionId: 'mock-session-1',
      paymentMethod: 'COD',
      items: [{ menuItemId: 1, quantity: 1 }],
    });
    const addr = server.address();
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: addr.port,
        path: '/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-role': 'ADMIN',
        },
      }, (r) => {
        let raw = '';
        r.on('data', c => raw += c);
        r.on('end', () => resolve({ status: r.statusCode }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    // Staff should bypass the 429 check (it proceeds past open orders cap)
    assert.notEqual(res.status, 429);
    mockOpenOrderCount = 0;
  });

  test('Cart: rejects add when existing quantity + incoming quantity exceeds CART_MAX_QTY (4 + 3 > 5)', async () => {
    // cartItem.findFirst for menuItemId 100 returns item with quantity 4
    const res = await post(server, '/cart/mock-session-1/items', {
      menuItemId: 100,
      quantity: 3,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_QUANTITY');
  });
});
