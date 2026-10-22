const { prisma } = require('../config/db');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessionActivityMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId || req.headers['x-session-id'];
    if (sessionId && typeof sessionId === 'string' && sessionId.length > 10) {
      // Fire-and-forget: refresh the session expiry without blocking the request
      prisma.session.updateMany({
        where: { id: sessionId, status: 'ACTIVE', tableId: { not: null } },
        data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      }).catch(() => {
        // Session activity refresh is best effort and must not delay the request.
      });
    }
  } catch {
    // Invalid request metadata should not prevent the main request from proceeding.
  }
  next();
};

module.exports = sessionActivityMiddleware;
