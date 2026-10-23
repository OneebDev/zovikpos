// test/uploadImage.test.js
// Tests for menuController.uploadImage (no DB, node:test).
// Verifies image validation, base64 decoding, magic bytes, size limits, and local write.

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Ensure supabase client does not attempt external network upload during test
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';

const menuController = require('../src/controllers/menuController');

const uploadsDir = path.join(__dirname, '../uploads');
const createdFiles = [];

// Helper 1x1 PNG data URL
const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const validPngDataUrl = `data:image/png;base64,${validPngBase64}`;

let server;
let baseUrl;

const postUpload = (body) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL('/api/menu/upload-image', baseUrl);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
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
    req.write(data);
    req.end();
  });
};

describe('uploadImage Controller Hardening Tests', () => {
  before(() => {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.post('/api/menu/upload-image', menuController.uploadImage);

    return new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
    // Clean up any files created during test
    for (const file of createdFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {
        // ignore cleanup error
      }
    }
  });

  test('valid 1x1 PNG data URL -> 200 and file is written with server-generated name (menu_<hex>.png)', async () => {
    const res = await postUpload({ imageBase64: validPngDataUrl });
    assert.equal(res.status, 200);
    assert.ok(res.body.imageUrl);
    assert.match(res.body.imageUrl, /^\/uploads\/menu_[a-f0-9]{32}\.png$/);

    const writtenPath = path.join(__dirname, '..', res.body.imageUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(writtenPath), 'Uploaded file should exist on disk');
    createdFiles.push(writtenPath);

    const fileContent = fs.readFileSync(writtenPath);
    assert.ok(fileContent.length > 0);
    assert.equal(fileContent[0], 0x89);
    assert.equal(fileContent[1], 0x50);
  });

  test('declared image/png but bytes are not PNG (magic-byte mismatch) -> 400', async () => {
    // "SGVsbG8gV29ybGQ=" is base64 for "Hello World"
    const fakePng = 'data:image/png;base64,SGVsbG8gV29ybGQ=';
    const res = await postUpload({ imageBase64: fakePng });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /does not match its declared file type/i);
  });

  test('mime not in jpeg/png/webp (e.g. image/gif) -> 400', async () => {
    const gifData = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const res = await postUpload({ imageBase64: gifData });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Only JPG, JPEG, PNG, and WEBP/i);
  });

  test('base64 length not multiple of 4 -> 400', async () => {
    // validPngBase64 minus 1 char
    const invalidLenBase64 = validPngBase64.slice(0, -1);
    const malformed = `data:image/png;base64,${invalidLenBase64}`;
    const res = await postUpload({ imageBase64: malformed });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /invalid or exceeds/i);
  });

  test('decoded size over MAX_IMAGE_UPLOAD_BYTES -> 400', async () => {
    const oldMax = process.env.MAX_IMAGE_UPLOAD_BYTES;
    try {
      // Set limit to 20 bytes so the 1x1 PNG (~70 bytes) exceeds it
      process.env.MAX_IMAGE_UPLOAD_BYTES = '20';
      const res = await postUpload({ imageBase64: validPngDataUrl });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /size limit|allowed limit/i);
    } finally {
      if (oldMax === undefined) {
        delete process.env.MAX_IMAGE_UPLOAD_BYTES;
      } else {
        process.env.MAX_IMAGE_UPLOAD_BYTES = oldMax;
      }
    }
  });

  test('body missing imageBase64 -> 400', async () => {
    const res = await postUpload({});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /No image data provided/i);
  });
});
