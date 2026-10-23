const { touchSessionActivity } = require('../utils/sessionActivity');

// Throttled session activity heartbeat for cart/order mutation routes.
// Reads lastActivityAt from DB to honour the 30-second throttle so several
// dynos never race to write the same field on every request.
const sessionActivityMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId || req.headers['x-session-id'];
    const isCustomerMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isCustomerMutation && sessionId && typeof sessionId === 'string' && sessionId.length > 10) {
      // Read current lastActivityAt for throttle check, then let touchSessionActivity decide.
      // Fire-and-forget: must not delay the actual request.
      const { prisma } = require('../config/db');
      prisma.session.findUnique({
        where: { id: sessionId },
        select: { lastActivityAt: true, status: true },
      }).then((s) => {
        if (s && s.status === 'ACTIVE') {
          return touchSessionActivity(sessionId, s.lastActivityAt);
        }
      }).catch(() => {});
    }
  } catch {
    // Invalid request metadata must not prevent the main request from proceeding.
  }
  next();
};

module.exports = sessionActivityMiddleware;
