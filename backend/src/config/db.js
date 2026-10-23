const { PrismaClient } = require('@prisma/client');
const exceptionLogger = require('../utils/exceptionLogger');

// Heroku / Production Postgres connection pool configuration:
// Formula: Math.floor((plan connection limit - reserve) / dynos)
const rawDbUrl = process.env.DATABASE_URL || '';
let effectiveUrl = rawDbUrl;

// DB_POOL_MAX defaults to 5 if unset
const poolMax = parseInt(process.env.DB_POOL_MAX, 10) || 5;
const poolTimeoutSec = parseInt(process.env.DB_POOL_TIMEOUT_SECONDS, 10);

if (rawDbUrl) {
  try {
    const parsed = new URL(rawDbUrl);
    if (!parsed.searchParams.has('connection_limit')) {
      parsed.searchParams.set('connection_limit', String(poolMax));
    }
    if (Number.isFinite(poolTimeoutSec) && poolTimeoutSec > 0 && !parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', String(poolTimeoutSec));
    }
    // Heroku Postgres self-signed cert handling: ensure sslmode=no-verify if connecting to remote postgres
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && !parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'no-verify');
    }
    effectiveUrl = parsed.toString();
  } catch {
    // Leave URL intact if parsing fails
  }
}

// Log effective pool configuration safely without printing credentials
const poolLimitDisplay = rawDbUrl.match(/connection_limit=(\d+)/)?.[1] || (Number.isFinite(poolMax) ? poolMax : 'default');
const poolTimeoutDisplay = rawDbUrl.match(/pool_timeout=(\d+)/)?.[1] || (Number.isFinite(poolTimeoutSec) ? poolTimeoutSec : 'default');
console.log(`[Database] Connection pool initialized (connection_limit: ${poolLimitDisplay}, pool_timeout: ${poolTimeoutDisplay}s)`);

const prisma = new PrismaClient({
  datasources: effectiveUrl ? { db: { url: effectiveUrl } } : undefined,
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
