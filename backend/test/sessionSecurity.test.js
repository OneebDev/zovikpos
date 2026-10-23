const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateSessionSecret,
  hashSessionSecret,
  verifySessionSecret,
} = require('../src/utils/sessionSecurity');

describe('Session Security Utilities (generate, hash, verify)', () => {
  test('generateSessionSecret produces 64-char hex string with high entropy', () => {
    const s1 = generateSessionSecret();
    const s2 = generateSessionSecret();
    assert.equal(typeof s1, 'string');
    assert.equal(s1.length, 64);
    assert.match(s1, /^[0-9a-f]{64}$/);
    assert.notEqual(s1, s2, 'Consecutive secrets must be distinct');
  });

  test('hashSessionSecret produces deterministic SHA-256 hash', () => {
    const secret = 'test-session-secret-12345';
    const h1 = hashSessionSecret(secret);
    const h2 = hashSessionSecret(secret);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  test('verifySessionSecret returns true for matching secret and hash', () => {
    const secret = generateSessionSecret();
    const hash = hashSessionSecret(secret);
    assert.equal(verifySessionSecret(secret, hash), true);
  });

  test('verifySessionSecret returns false for incorrect secret or corrupted hash', () => {
    const secret = generateSessionSecret();
    const hash = hashSessionSecret(secret);
    assert.equal(verifySessionSecret('wrong-secret', hash), false);
    assert.equal(verifySessionSecret(secret, 'corrupted_hash'), false);
    assert.equal(verifySessionSecret(null, hash), false);
    assert.equal(verifySessionSecret(secret, null), false);
    assert.equal(verifySessionSecret('', hash), false);
  });
});
