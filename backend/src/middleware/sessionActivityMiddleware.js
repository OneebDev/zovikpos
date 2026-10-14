const { prisma } = require('../config/db');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessionActivityMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId || req.headers['x-session-id'];
    if (sessionId && typeof sessionId === 'string' && sessionId.length > 10) {
      // Fire-and-forget: refresh the session expiry without blocking the request
      prisma.session.updateMany({
        where: { id: sessionId, status: 'ACTIVE' },
        data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      }).catch(() => {}); // silently ignore errors
    }
  } catch {}
  next();
};

module.exports = sessionActivityMiddleware;
