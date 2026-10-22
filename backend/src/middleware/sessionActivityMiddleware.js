const { prisma } = require('../config/db');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessionActivityMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId || req.headers['x-session-id'];
    const isCustomerMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isCustomerMutation && sessionId && typeof sessionId === 'string' && sessionId.length > 10) {
      // Fire-and-forget: refresh the session expiry without blocking the request
      prisma.session.updateMany({
        // API traffic must not resurrect a session that already expired.
        where: { id: sessionId, status: 'ACTIVE', tableId: { not: null }, expiresAt: { gt: new Date() } },
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
