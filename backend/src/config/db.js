const { PrismaClient } = require('@prisma/client');
const exceptionLogger = require('../utils/exceptionLogger');

// Heroku Postgres Essential-0 connection pool configuration:
// Plan connection limit: 20 max connections.
// Formula: Math.floor((20 total - 3 reserved) / WEB_CONCURRENCY) => 10 connections per dyno.
// Acquire timeout: 15s via pool_timeout query parameter to absorb bursts without P2024 errors.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma.$use(async (params, next) => {
  const startedAt = Date.now();
  try {
    return await next(params);
  } catch (error) {
    exceptionLogger.exception('db.query', error, {
      context: {
        model: params.model,
        action: params.action,
        durationMs: Date.now() - startedAt,
        code: error.code,
      },
    });
    throw error;
  }
});

module.exports = { prisma };
