// src/utils/dbRetry.js
// Shared retry helper for database concurrency deadlocks and serialization failures.
// Retries ONLY on Prisma P2034, Postgres 40001 (serialization failure), and 40P01 (deadlock detected).

'use strict';

const RETRYABLE_PRISMA_CODES = new Set(['P2034']);
const RETRYABLE_PG_CODES = new Set(['40001', '40P01']);

const parsePositiveInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Sane default transaction options
const getTxOptions = () => ({
  maxWait: parsePositiveInt(process.env.TX_MAX_WAIT_MS, 5000),
  timeout: parsePositiveInt(process.env.TX_TIMEOUT_MS, 15000),
});

const TX_OPTIONS = Object.freeze(getTxOptions());

/**
 * Checks if an error is a retryable database deadlock or serialization conflict.
 */
function isDeadlockOrSerializationError(error) {
  if (!error) return false;
  if (error.code && RETRYABLE_PRISMA_CODES.has(error.code)) return true;
  // Check Postgres error codes on raw or wrapped Prisma errors
  if (error.meta?.code && RETRYABLE_PG_CODES.has(error.meta.code)) return true;
  if (error.originalError?.code && RETRYABLE_PG_CODES.has(error.originalError.code)) return true;
  if (typeof error.message === 'string') {
    if (error.message.includes('deadlock detected') || error.message.includes('40P01')) return true;
    if (error.message.includes('could not serialize access') || error.message.includes('40001')) return true;
    if (error.message.includes('P2034')) return true;
  }
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a transactional database function with automatic retry on deadlocks/serialization conflicts.
 * Non-DB side effects (emails, sockets) MUST be performed AFTER this function resolves.
 *
 * @param {Function} fn - Async function executing the transaction
 * @param {object} [options]
 * @param {number} [options.retries=3] - Maximum retry attempts
 * @param {number} [options.minBackoff=50] - Minimum jittered backoff in ms
 * @param {number} [options.maxBackoff=200] - Maximum jittered backoff in ms
 * @returns {Promise<any>}
 */
async function withDeadlockRetry(fn, options = {}) {
  const maxRetries = options.retries !== undefined ? options.retries : 3;
  const minBackoff = options.minBackoff || 50;
  const maxBackoff = options.maxBackoff || 200;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > maxRetries || !isDeadlockOrSerializationError(error)) {
        throw error;
      }
      // Calculate randomized jitter backoff
      const jitter = Math.floor(Math.random() * (maxBackoff - minBackoff + 1)) + minBackoff;
      await sleep(jitter);
    }
  }
}

module.exports = {
  TX_OPTIONS,
  getTxOptions,
  isDeadlockOrSerializationError,
  withDeadlockRetry,
};
