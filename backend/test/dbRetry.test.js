// test/dbRetry.test.js
// Mock unit tests for withDeadlockRetry and isDeadlockOrSerializationError (no DB needed).

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { withDeadlockRetry, isDeadlockOrSerializationError, TX_OPTIONS } = require('../src/utils/dbRetry');

describe('dbRetry utility', () => {
  test('TX_OPTIONS provides sane defaults', () => {
    assert.equal(TX_OPTIONS.maxWait, 5000);
    assert.equal(TX_OPTIONS.timeout, 15000);
  });

  test('isDeadlockOrSerializationError identifies Prisma P2034', () => {
    assert.equal(isDeadlockOrSerializationError({ code: 'P2034' }), true);
  });

  test('isDeadlockOrSerializationError identifies Postgres 40P01 and 40001', () => {
    assert.equal(isDeadlockOrSerializationError({ originalError: { code: '40P01' } }), true);
    assert.equal(isDeadlockOrSerializationError({ meta: { code: '40001' } }), true);
    assert.equal(isDeadlockOrSerializationError(new Error('deadlock detected')), true);
    assert.equal(isDeadlockOrSerializationError(new Error('could not serialize access')), true);
  });

  test('isDeadlockOrSerializationError rejects non-deadlock errors', () => {
    assert.equal(isDeadlockOrSerializationError(new Error('Item not found')), false);
    assert.equal(isDeadlockOrSerializationError({ code: 'P2002' }), false);
    assert.equal(isDeadlockOrSerializationError(null), false);
  });

  test('withDeadlockRetry succeeds on first attempt if no error', async () => {
    let runs = 0;
    const result = await withDeadlockRetry(async () => {
      runs++;
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(runs, 1);
  });

  test('withDeadlockRetry retries on deadlock and recovers', async () => {
    let attempts = 0;
    const result = await withDeadlockRetry(async () => {
      attempts++;
      if (attempts < 3) {
        const err = new Error('deadlock detected');
        err.code = '40P01';
        throw err;
      }
      return 'recovered';
    }, { retries: 3, minBackoff: 5, maxBackoff: 10 });

    assert.equal(result, 'recovered');
    assert.equal(attempts, 3);
  });

  test('withDeadlockRetry throws immediately on non-retryable error without retrying', async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withDeadlockRetry(async () => {
          attempts++;
          throw new Error('Unique constraint violation P2002');
        }, { retries: 3 });
      },
      /Unique constraint violation/
    );
    assert.equal(attempts, 1);
  });

  test('withDeadlockRetry throws after exceeding maxRetries', async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withDeadlockRetry(async () => {
          attempts++;
          const err = new Error('deadlock detected');
          err.code = '40P01';
          throw err;
        }, { retries: 2, minBackoff: 5, maxBackoff: 10 });
      },
      /deadlock detected/
    );
    assert.equal(attempts, 3); // 1 initial + 2 retries
  });
});
