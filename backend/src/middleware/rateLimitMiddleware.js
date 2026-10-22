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

module.exports = { createRateLimiter, authLimiter, otpLimiter, otpVerificationLimiter, generalLimiter, fallbackCheck };
