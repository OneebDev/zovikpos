const crypto = require('crypto');
const { prisma } = require('../config/db');
const redis = require('../config/redis');
const exceptionLogger = require('../utils/exceptionLogger');

const RETENTION_MS = 24 * 60 * 60 * 1000;
const LOCK_MS = 2 * 60 * 1000;

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hmac = (value) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'development-idempotency-key').update(value).digest('hex');
const encryptionKey = () => crypto.createHash('sha256').update(process.env.JWT_SECRET || 'development-idempotency-key').update(':api-idempotency-response:v1').digest();
const encryptResponse = (body) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};
const decryptResponse = (encrypted) => {
  if (!encrypted || encrypted.version !== 1) throw new Error('Unsupported idempotency response format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
};

const errorResponse = (res, status, error) => res.status(status).json({ error });

const runIdempotency = async (req, res, next) => {
  const clientKey = String(req.get('Idempotency-Key') || '').trim();
  if (!clientKey || clientKey.length > 200) return errorResponse(res, 400, 'A valid Idempotency-Key header is required.');

  const identity = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip || 'unknown'}`;
  const scopeKey = hmac(`${identity}\n${req.method}\n${req.baseUrl}${req.path}\n${clientKey}`);
  const requestHash = crypto.createHash('sha256').update(stableStringify(req.body || {})).digest('hex');
  const now = new Date();
  const encryptedReplay = (entry) => decryptResponse(entry.responseBody);

  const replyFromCache = (serialized) => {
    if (!serialized) return false;
    const cached = JSON.parse(serialized);
    if (cached.requestHash !== requestHash) {
      errorResponse(res, 422, 'This idempotency key was already used with a different request body.');
      return true;
    }
    const body = decryptResponse(cached.responseBody);
    res.setHeader('Idempotent-Replayed', 'true');
    res.status(cached.responseStatus).json(body);
    return true;
  };

  if (redis.hasRedis) {
    try {
      const cached = await redis.getIdempotencyCache(scopeKey);
      if (replyFromCache(cached)) return;
    } catch (error) {
      exceptionLogger.exception('idempotency.redis_fallback', error, {
        level: 'warn', context: { method: req.method, route: req.baseUrl + req.path, action: 'database fallback', code: error.code },
      });
    }
  }

  let row = await prisma.apiIdempotency.findUnique({ where: { scopeKey } });
  if (row && row.expiresAt <= now) {
    await prisma.apiIdempotency.deleteMany({ where: { scopeKey, expiresAt: { lte: now } } });
    row = null;
  }

  if (row && row.requestHash !== requestHash) {
      res.setHeader('Idempotency-Error', 'IDEMPOTENCY_KEY_REUSED');
      return errorResponse(res, 422, 'This idempotency key was already used with a different request body.');
  }
  if (row?.state === 'COMPLETED') {
    try {
      const body = encryptedReplay(row);
      if (redis.hasRedis) {
        const ttl = Math.max(1, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000));
        redis.setIdempotencyCache(scopeKey, JSON.stringify({ requestHash, responseStatus: row.responseStatus, responseBody: row.responseBody }), ttl).catch(() => {});
      }
      res.setHeader('Idempotent-Replayed', 'true');
      return res.status(row.responseStatus).json(body);
    } catch (error) {
      exceptionLogger.exception('idempotency.replay_decrypt', error, { level: 'error', context: { route: req.baseUrl + req.path } });
      return errorResponse(res, 500, 'Unable to replay this request safely.');
    }
  }
  if (row && row.lockedUntil > now) {
    res.setHeader('Retry-After', '1');
    res.setHeader('Idempotency-Error', 'REQUEST_IN_PROGRESS');
    return errorResponse(res, 409, 'A request with this idempotency key is already in progress.');
  }

  const expiresAt = new Date(now.getTime() + RETENTION_MS);
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  try {
    if (row) {
      const claimed = await prisma.apiIdempotency.updateMany({
        where: { scopeKey, state: 'IN_PROGRESS', lockedUntil: { lte: now } },
        data: { requestHash, lockedUntil, expiresAt },
      });
      if (!claimed.count) {
        const current = await prisma.apiIdempotency.findUnique({ where: { scopeKey } });
        if (current?.state === 'COMPLETED') {
          res.setHeader('Idempotent-Replayed', 'true');
          return res.status(current.responseStatus).json(encryptedReplay(current));
        }
        res.setHeader('Retry-After', '1');
        res.setHeader('Idempotency-Error', 'REQUEST_IN_PROGRESS');
        return errorResponse(res, 409, 'A request with this idempotency key is already in progress.');
      }
    } else {
      await prisma.apiIdempotency.create({ data: { scopeKey, requestHash, state: 'IN_PROGRESS', lockedUntil, expiresAt } });
    }
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const current = await prisma.apiIdempotency.findUnique({ where: { scopeKey } });
    if (current?.requestHash !== requestHash) {
      res.setHeader('Idempotency-Error', 'IDEMPOTENCY_KEY_REUSED');
      return errorResponse(res, 422, 'This idempotency key was already used with a different request body.');
    }
    if (current?.state === 'COMPLETED') {
      res.setHeader('Idempotent-Replayed', 'true');
      return res.status(current.responseStatus).json(encryptedReplay(current));
    }
    res.setHeader('Retry-After', '1');
    res.setHeader('Idempotency-Error', 'REQUEST_IN_PROGRESS');
    return errorResponse(res, 409, 'A request with this idempotency key is already in progress.');
  }

  const originalJson = res.json.bind(res);
  let finalized = false;
  res.json = (body) => {
    if (finalized) return originalJson(body);
    finalized = true;
    const status = res.statusCode;
    void (async () => {
      if (status >= 500) {
        await prisma.apiIdempotency.deleteMany({ where: { scopeKey, state: 'IN_PROGRESS' } });
        if (redis.hasRedis) await redis.deleteIdempotencyCache(scopeKey).catch(() => {});
      } else {
        const responseBody = encryptResponse(body);
        const completed = await prisma.apiIdempotency.updateMany({
          where: { scopeKey, requestHash, state: 'IN_PROGRESS' },
          data: { state: 'COMPLETED', responseStatus: status, responseBody, lockedUntil: now },
        });
        if (completed.count && redis.hasRedis) {
          const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
          await redis.setIdempotencyCache(scopeKey, JSON.stringify({ requestHash, responseStatus: status, responseBody }), ttl).catch(() => {});
        }
      }
    })().catch((error) => {
      exceptionLogger.exception('idempotency.persist', error, { level: 'error', context: { route: req.baseUrl + req.path, status } });
    }).finally(() => originalJson(body));
    return res;
  };

  next();
};

const idempotencyMiddleware = (req, res, next) => {
  runIdempotency(req, res, next).catch(next);
};

module.exports = { idempotencyMiddleware };
