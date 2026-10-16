const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');

const getAccessSecret = () => process.env.JWT_SECRET || 'pos_system_jwt_access_secret_key_2026';

const demoGuardMiddleware = require('./demoGuardMiddleware');

// Fast In-Memory User Auth Cache (10 seconds TTL) to eliminate DB query overhead on every API call
const userAuthCache = new Map();
const CACHE_TTL_MS = 10000;

const getDbUserCached = async (userId) => {
  const cached = userAuthCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.user;
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, branchId: true, isDemo: true },
  });
  if (dbUser) {
    userAuthCache.set(userId, { user: dbUser, timestamp: Date.now() });
  }
  return dbUser;
};

const clearUserCache = (userId) => {
  if (userId) userAuthCache.delete(userId);
  else userAuthCache.clear();
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access denied. Invalid token format.' });
  }

  try {
    const decoded = jwt.verify(token, getAccessSecret());

    // Check if user is still active in database (using fast cached getter)
    if (decoded.id) {
      const dbUser = await getDbUserCached(decoded.id);

      if (!dbUser) {
        return res.status(401).json({ error: 'Authenticated user account no longer exists.' });
      }

      if (dbUser.isActive === false) {
        return res.status(403).json({ error: 'Your account has been deactivated or disabled by Admin.' });
      }

      // Check if user's role has been updated in database after token issuance
      if (decoded.role && decoded.role !== 'CUSTOMER' && dbUser.role !== decoded.role) {
        return res.status(401).json({
          error: `Your account role has been updated to ${dbUser.role} by Administrator. Please log in again with your updated role credentials.`,
          code: 'ROLE_CHANGED',
          newRole: dbUser.role,
        });
      }

      const isDemo = dbUser.isDemo;

      req.user = {
        ...decoded,
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        branchId: dbUser.branchId,
        isDemo,
      };
    } else {
      req.user = {
        ...decoded,
        isDemo: decoded.isDemo || false,
      };
    }

    // Attach session ID if provided in header
    req.sessionId = req.headers['x-session-id'] || null;

    // Run Demo Sandbox Guard to intercept DB mutations for demo users
    return demoGuardMiddleware(req, res, next);
  } catch (error) {
    console.error('[authMiddleware Error]:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please refresh your session.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid or malformed token.' });
  }
};

/**
 * Optional authentication middleware: if token is present, decode it; if not, proceed as guest
 */
const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  req.sessionId = req.headers['x-session-id'] || null;

  if (!authHeader) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, getAccessSecret());
    if (decoded.id) {
      const dbUser = await getDbUserCached(decoded.id);
      if (dbUser && dbUser.isActive) {
        req.user = {
          ...decoded,
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
          branchId: dbUser.branchId,
        };
      }
    }
  } catch {
    req.user = null;
  }

  next();
};

module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
module.exports.clearUserCache = clearUserCache;
