// Shared Redis sliding windows with the previous in-memory limiter as a fallback.
const crypto = require('crypto');
const requestBuckets = new Map();
const exceptionLogger = require('../utils/exceptionLogger');
const redis = require('../config/redis');

const fallbackCheck = (key, windowMs, max, now = Date.now()) => {
  const safeKey = crypto.createHash('sha256').update(String(key)).digest('hex');
  let bucket = requestBuckets.get(safeKey);
  if (!bucket) {
    bucket = { timestamps: [] };
    requestBuckets.set(safeKey, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
  if (bucket.timestamps.length >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000)),
    };
  }
  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
};

const createRateLimiter = ({ windowMs = 60000, max = 100, message = 'Too many requests, please try again later.', keyGenerator }) => {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const isLoopback = req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1';
    if (process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && isLoopback)) return next();

    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown-ip';
    const key = keyGenerator ? keyGenerator(req) : `${ip}:${req.baseUrl || req.path}`;

    // keyGenerator returning null means this tier does not apply to this request; skip it.
    if (key === null) return next();

    void (async () => {
      let result;
      if (redis.hasRedis) {
        try {
          result = await redis.checkRateLimit({ rawKey: key, windowMs, max });
        } catch (error) {
          exceptionLogger.exception('redis.rate_limit.fallback', error, {
            level: 'warn', context: { action: 'using in-memory rate limit', code: error.code },
          });
          result = fallbackCheck(key, windowMs, max);
        }
      } else {
        result = fallbackCheck(key, windowMs, max);
      }

      if (result.allowed) return next();

      const retryAfterSec = result.retryAfterSeconds;
      res.setHeader('Retry-After', retryAfterSec);
      exceptionLogger.log('warn', 'http.rate_limit', 'Rate limit exceeded', {
        context: {
          requestId: req.requestId,
          method: req.method,
          url: req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : (req.baseUrl || req.path || '/'),
          status: 429,
          role: req.user?.role,
          userId: req.user?.id,
          ip,
          code: 'RATE_LIMITED',
        },
      });
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfterSec });
    })().catch((error) => {
      exceptionLogger.exception('http.rate_limit', error, { level: 'error', context: { action: 'middleware failure' } });
      next(error);
    });
  };
};


// Cleanup old local fallback buckets periodically to keep dyno memory bounded.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of requestBuckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < 900000);
    if (!bucket.timestamps.length) requestBuckets.delete(key);
  }
}, 600000);
cleanupTimer.unref?.();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  keyGenerator: (req) => `auth:${req.ip || 'ip'}:${typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : ''}`,
});

const otpLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many OTP requests. Please wait a few minutes before requesting a new code.',
  keyGenerator: (req) => `otp:${req.ip || 'ip'}:${typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : ''}`,
});

const otpVerificationLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Too many verification attempts. Please wait a few minutes and try again.',
  keyGenerator: (req) => `otp-verify:${req.ip || 'ip'}`,
});

const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'High traffic detected. Please slow down.',
});

// --- ORDER CREATE LIMITER ---
// Dual protection:
// 1. Identity cap: req.user.id (when authenticated, forge-proof) or req.body.sessionId.
// 2. IP cap: always applies to protect against flood attacks on the same network.
// Env vars: ORDER_RATE_SESSION_MAX (default 10), ORDER_RATE_IP_MAX (default 60),
//           ORDER_RATE_WINDOW_MS (default 120000 = 2 min).
const orderCreateCombinedLimiter = (() => {
  const windowMs = Number(process.env.ORDER_RATE_WINDOW_MS) || 120000;
  const sessionMax = Number(process.env.ORDER_RATE_SESSION_MAX) || 10;
  const ipMax = Number(process.env.ORDER_RATE_IP_MAX) || 60;

  const identityLimiter = createRateLimiter({
    windowMs,
    max: sessionMax,
    message: 'Too many orders placed. Please wait a moment before placing another order.',
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `order-create:user:${req.user.id}`;
      }
      const sessionId = req.body?.sessionId;
      if (typeof sessionId === 'string' && sessionId.length > 5) {
        return `order-create:session:${sessionId}`;
      }
      return null;
    },
  });

  const ipLimiter = createRateLimiter({
    windowMs,
    max: ipMax,
    message: 'Too many orders from this network. Please wait a moment.',
    keyGenerator: (req) => `order-create:ip:${req.ip || 'unknown'}`,
  });

  return (req, res, next) => {
    identityLimiter(req, res, (err) => {
      if (err) return next(err);
      ipLimiter(req, res, next);
    });
  };
})();

// --- PAYMENT SUBMIT LIMITER ---
// Dual protection:
// 1. Identity cap: req.user.id ONLY (no orderId in key to prevent bypass).
// 2. IP cap: always applies.
// Env vars: PAYMENT_RATE_USER_MAX (default 8), PAYMENT_RATE_IP_MAX (default 60),
//           PAYMENT_RATE_WINDOW_MS (default 300000 = 5 min).
const paymentSubmitLimiter = (() => {
  const windowMs = Number(process.env.PAYMENT_RATE_WINDOW_MS) || 300000;
  const userMax = Number(process.env.PAYMENT_RATE_USER_MAX) || 8;
  const ipMax = Number(process.env.PAYMENT_RATE_IP_MAX) || 60;

  const identityLimiter = createRateLimiter({
    windowMs,
    max: userMax,
    message: 'Too many payment submissions. Please wait before trying again.',
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `payment-submit:user:${req.user.id}`;
      }
      return null;
    },
  });

  const ipLimiter = createRateLimiter({
    windowMs,
    max: ipMax,
    message: 'Too many payment submissions from this network. Please wait.',
    keyGenerator: (req) => `payment-submit:ip:${req.ip || 'unknown'}`,
  });

  return (req, res, next) => {
    identityLimiter(req, res, (err) => {
      if (err) return next(err);
      ipLimiter(req, res, next);
    });
  };
})();

// --- SESSION START LIMITER ---
// Session start is unauthenticated; key is IP only (shared WiFi canteen tables all hit this).
// Env vars: SESSION_RATE_IP_MAX (default 60), SESSION_RATE_WINDOW_MS (default 300000 = 5 min).
const sessionStartLimiter = createRateLimiter({
  windowMs: Number(process.env.SESSION_RATE_WINDOW_MS) || 300000,
  max: Number(process.env.SESSION_RATE_IP_MAX) || 60,
  message: 'Too many session start requests from this network. Please wait a few minutes.',
  keyGenerator: (req) => `session-start:ip:${req.ip || 'unknown'}`,
});

module.exports = {
  createRateLimiter,
  authLimiter,
  otpLimiter,
  otpVerificationLimiter,
  generalLimiter,
  fallbackCheck,
  orderCreateCombinedLimiter,
  paymentSubmitLimiter,
  sessionStartLimiter,
};

