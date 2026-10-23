// test/routeValidation.test.js
// Tests for Step 2 Route Validation Hardening (no DB, node:test).
// Mounts real validateBody/validateParams with real schemas on dummy handlers.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { validateBody, validateParams } = require('../src/middleware/validate');
const {
  idParamSchema,
  sessionStartSchema,
  verifyOtpSchema,
  createOrderSchema,
} = require('../src/schemas/apiSchemas');

let server;
let baseUrl;

const request = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

describe('Route Validation Hardening (Dummy Handler Tests)', () => {
  before(() => {
    const app = express();
    app.use(express.json());

    // 1. idParamSchema on dummy param route
    app.get('/test/param/:id', validateParams(idParamSchema), (req, res) => {
      res.json({ ok: true, params: req.params });
    });

    // 2. sessionStartSchema route
    app.post('/test/session-start', validateBody(sessionStartSchema), (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    // 3. verifyOtpSchema route
    app.post('/test/verify-otp', validateBody(verifyOtpSchema), (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    // 4. createOrderSchema route
    app.post('/test/create-order', validateBody(createOrderSchema), (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    return new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  describe('idParamSchema checks', () => {
    test('"12" ok -> 200', async () => {
      const res = await request('GET', '/test/param/12');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.params.id, '12');
    });

    test('"abc" -> 400 VALIDATION_ERROR', async () => {
      const res = await request('GET', '/test/param/abc');
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error);
    });

    test('"-1" -> 400 VALIDATION_ERROR', async () => {
      const res = await request('GET', '/test/param/-1');
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });

    test('"1.5" -> 400 VALIDATION_ERROR', async () => {
      const res = await request('GET', '/test/param/1.5');
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });
  });

  describe('sessionStartSchema checks', () => {
    test('empty body passes through to handler', async () => {
      const res = await request('POST', '/test/session-start', {});
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    test('body without qrToken passes through to handler (e.g. { validateOnly: true })', async () => {
      const res = await request('POST', '/test/session-start', { validateOnly: true });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.validateOnly, true);
    });
  });

  describe('verifyOtpSchema checks', () => {
    test('otp as string "123456" passes', async () => {
      const res = await request('POST', '/test/verify-otp', {
        email: 'test@example.com',
        otp: '123456',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.otp, '123456');
    });

    test('otp as number 123456 passes', async () => {
      const res = await request('POST', '/test/verify-otp', {
        email: 'test@example.com',
        otp: 123456,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.otp, '123456');
    });

    test('otp "12" fails (too short) -> 400 VALIDATION_ERROR', async () => {
      const res = await request('POST', '/test/verify-otp', {
        email: 'test@example.com',
        otp: '12',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });
  });

  describe('createOrderSchema checks', () => {
    test('items missing -> 400 VALIDATION_ERROR', async () => {
      const res = await request('POST', '/test/create-order', {
        sessionId: 'sess-123',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });

    test('items empty array -> 400 VALIDATION_ERROR', async () => {
      const res = await request('POST', '/test/create-order', {
        sessionId: 'sess-123',
        items: [],
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    });

    test('items with quantity omitted passes', async () => {
      const res = await request('POST', '/test/create-order', {
        sessionId: 'sess-123',
        items: [{ menuItemId: 5 }],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.items[0].menuItemId, 5);
    });

    test('extra unknown field is preserved on req.body', async () => {
      const res = await request('POST', '/test/create-order', {
        sessionId: 'sess-123',
        items: [{ menuItemId: 5, quantity: 2 }],
        customSpecialNote: 'Extra spicy please',
        clientTimestamp: 1698000000,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.customSpecialNote, 'Extra spicy please');
      assert.equal(res.body.body.clientTimestamp, 1698000000);
    });
  });

  describe('trim behavior checks', () => {
    test('sessionId "  abc  " reaches the handler as "abc"', async () => {
      const res = await request('POST', '/test/create-order', {
        sessionId: '  abc  ',
        items: [{ menuItemId: 10, quantity: 1 }],
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.body.sessionId, 'abc');
    });
  });

  describe('400 body shape and raw input privacy', () => {
    test('400 body shape is { error, code: "VALIDATION_ERROR" } and does not echo raw input value', async () => {
      const secretRawValue = 'SUPER_SECRET_BAD_VALUE_999';
      const res = await request('POST', '/test/verify-otp', {
        email: 'invalid-email',
        otp: secretRawValue,
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'VALIDATION_ERROR');
      assert.ok(typeof res.body.error === 'string');
      // Verify raw user input value is not leaked in the error message
      assert.equal(res.body.error.includes(secretRawValue), false, 'Error message should not echo raw secret value');
    });
  });
});
