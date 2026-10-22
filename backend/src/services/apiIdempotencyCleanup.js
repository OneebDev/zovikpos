const { prisma } = require('../config/db');
const exceptionLogger = require('../utils/exceptionLogger');

const DAY_MS = 24 * 60 * 60 * 1000;

const cleanupExpiredApiIdempotency = async () => {
  try {
    const result = await prisma.apiIdempotency.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    exceptionLogger.log('info', 'idempotency.cleanup', 'Expired API idempotency records removed', {
      context: { removed: result.count },
    });
    return result.count;
  } catch (error) {
    exceptionLogger.exception('idempotency.cleanup', error, { level: 'error' });
    return null;
  }
};

const startApiIdempotencyCleanup = () => {
  void cleanupExpiredApiIdempotency();
  const timer = setInterval(() => void cleanupExpiredApiIdempotency(), DAY_MS);
  timer.unref?.();
  return timer;
};

module.exports = { cleanupExpiredApiIdempotency, startApiIdempotencyCleanup };
