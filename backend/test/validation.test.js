// test/validation.test.js
// Tests for Step 1 shared validation helpers (validation.js + validate.js).
// node:test + plain http client (no DB required).

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { z, parseId, parsePagination, parseSort } = require('../src/utils/validation');
const { validateBody } = require('../src/middleware/validate');

describe('Validation Helpers & Middleware', () => {
  describe('parseId helper', () => {
    test('accepts valid positive integer strings and numbers', () => {
      assert.equal(parseId('1'), 1);
      assert.equal(parseId(42), 42);
      assert.equal(parseId('2147483647'), 2147483647);
    });

    test('rejects 0, negative numbers, decimals, NaN, non-numeric strings', () => {
      assert.equal(parseId('0'), null);
      assert.equal(parseId('-5'), null);
      assert.equal(parseId('3.14'), null);
      assert.equal(parseId('abc'), null);
      assert.equal(parseId(NaN), null);
      assert.equal(parseId(null), null);
      assert.equal(parseId(undefined), null);
      assert.equal(parseId('2147483648'), null); // exceeds default max
    });
  });

  describe('parsePagination helper', () => {
    test('returns default page and limit when query is empty', () => {
      const res = parsePagination({});
      assert.equal(res.page, 1);
      assert.equal(res.limit, 20);
      assert.equal(res.skip, 0);
    });

    test('respects custom page and limit within bounds', () => {
      const res = parsePagination({ page: '3', limit: '15' });
      assert.equal(res.page, 3);
      assert.equal(res.limit, 15);
      assert.equal(res.skip, 30);
    });

    test('caps limit to maxLimit (e.g. 100)', () => {
      const res = parsePagination({ page: '1', limit: '500' }, 20, 100);
      assert.equal(res.limit, 100);
    });

    test('supports pageSize synonym', () => {
      const res = parsePagination({ page: '2', pageSize: '25' });
      assert.equal(res.limit, 25);
      assert.equal(res.skip, 25);
    });
  });

  describe('parseSort helper', () => {
    test('allows allowed fields and sorts', () => {
      const res = parseSort('name', 'desc', ['name', 'price', 'createdAt']);
      assert.deepEqual(res, { name: 'desc' });
    });

    test('falls back to defaultField on unallowed field', () => {
      const res = parseSort('malicious_field', 'asc', ['name', 'price'], 'createdAt', 'desc');
      assert.deepEqual(res, { createdAt: 'asc' });
    });
  });

  describe('validateBody middleware', () => {
    let server;
    const testSchema = z.object({
      name: z.string().min(2).max(50),
      count: z.number().int().positive(),
    });

    before((_, done) => {
      const app = express();
      app.use(express.json());
      app.post('/test', validateBody(testSchema), (req, res) => {
        res.json({ ok: true, data: req.body });
      });
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', done);
    });

    after((_, done) => {
      server.close(done);
    });

    function post(payload) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const addr = server.address();
        const req = http.request({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/test',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        }, (res) => {
          let raw = '';
          res.on('data', c => raw += c);
          res.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(raw); } catch { parsed = raw; }
            resolve({ status: res.statusCode, body: parsed });
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }

    test('valid input passes and extra unknown fields are preserved (lenient passthrough)', async () => {
      const res = await post({ name: 'Coffee', count: 5, extraUnknownField: 'allowed' });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.data.extraUnknownField, 'allowed');
    });

    test('invalid input returns 400 with VALIDATION_ERROR code', async () => {
      const res = await post({ name: 'A', count: -1 });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
      assert.ok(typeof res.body.error === 'string');
    });
  });

  describe('Real Frontend-Shaped Schemas (apiSchemas.js)', () => {
    const {
      registerSchema,
      loginSchema,
      verifyOtpSchema,
      sessionStartSchema,
      createOrderSchema,
      submitPaymentSchema,
      createMenuItemSchema,
    } = require('../src/schemas/apiSchemas');

    test('login: valid frontend payload passes', () => {
      const payload = { email: 'student@students.uitu.edu.pk', password: 'secretPassword123' };
      const parsed = loginSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test('register: valid frontend payload passes', () => {
      const payload = {
        name: 'Jane Doe',
        email: '23sp-001-se@students.uitu.edu.pk',
        password: 'securePassword!',
        role: 'CUSTOMER',
      };
      const parsed = registerSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test('verify-otp: accepts both string and numeric OTP codes', () => {
      const strPayload = { email: 'user@students.uitu.edu.pk', otp: '123456' };
      const numPayload = { email: 'user@students.uitu.edu.pk', otp: 123456 };
      assert.equal(verifyOtpSchema.safeParse(strPayload).success, true);
      assert.equal(verifyOtpSchema.safeParse(numPayload).success, true);
    });

    test('session-start: accepts missing or optional qrToken so controller returns TABLE_QR_REQUIRED', () => {
      const emptyPayload = {};
      const withToken = { qrToken: 'tbl:1:1:nonce:sig' };
      assert.equal(sessionStartSchema.safeParse(emptyPayload).success, true);
      assert.equal(sessionStartSchema.safeParse(withToken).success, true);
    });

    test('create-order: valid frontend orderPayload passes with items array', () => {
      const payload = {
        sessionId: 'sess_123456',
        tableId: 1,
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        customerEmail: 'student@students.uitu.edu.pk',
        items: [
          { menuItemId: 10, quantity: 2 },
          { menuItemId: '12', quantity: 1 },
        ],
      };
      const parsed = createOrderSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test('create-order: rejects empty items array with message', () => {
      const payload = {
        sessionId: 'sess_123456',
        items: [],
      };
      const parsed = createOrderSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    test('payment-submit: valid payload passes with orderId and paymentTxId', () => {
      const payload = {
        orderId: 45,
        paymentMethod: 'Easypaisa',
        paymentTxId: 'EP-9876543210',
      };
      const parsed = submitPaymentSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test('menu-create: valid frontend modalData passes', () => {
      const payload = {
        name: 'Club Sandwich',
        price: 350.0,
        type: 'food',
        category: 'Fast Food',
        stock: 50,
        prepTime: 10,
        imageUrl: '/uploads/sandwich.jpg',
        description: 'Triple layer toasted sandwich with fries',
        isActive: true,
      };
      const parsed = createMenuItemSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });
  });
});
