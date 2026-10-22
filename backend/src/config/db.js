const { PrismaClient } = require('@prisma/client');
const exceptionLogger = require('../utils/exceptionLogger');

const prisma = new PrismaClient();

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
