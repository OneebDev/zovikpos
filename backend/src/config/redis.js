const Redis = require('ioredis');
const crypto = require('crypto');
const exceptionLogger = require('../utils/exceptionLogger');

const REDIS_TIMEOUT_MS = 300;
const PREFIX = `zovikpos:${process.env.NODE_ENV || 'development'}:`;
let client;
let connectPromise;

const redisUrl = process.env.REDIS_URL;
const hasRedis = Boolean(redisUrl);

const getClient = () => {
  if (!hasRedis) return null;
  if (!client) {
    let tls;
    if (redisUrl.startsWith('rediss://')) {
      // Heroku KVS currently uses a self-signed certificate. Keep this exception
      // limited to the documented Heroku dyno + Heroku KVS host combination.
      let host = '';
      try { host = new URL(redisUrl).hostname; } catch { /* ioredis will report malformed URLs */ }
      const isHerokuKvs = Boolean(process.env.DYNO) && (
        host.endsWith('.compute.amazonaws.com') || host.endsWith('.compute-1.amazonaws.com')
      );
      tls = isHerokuKvs ? { rejectUnauthorized: false } : { rejectUnauthorized: true };
    }
    client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 250, 5000),
      ...(tls ? { tls } : {}),
    });
    client.on('error', (error) => exceptionLogger.exception('redis.connection', error, {
      level: 'warn', context: { action: 'client error', code: error.code },
    }));
    client.on('connect', () => exceptionLogger.log('info', 'redis.connection', 'Redis connected'));
    client.on('close', () => exceptionLogger.log('warn', 'redis.connection', 'Redis connection closed'));
  }
  return client;
};

const withTimeout = (promise, timeoutMs = REDIS_TIMEOUT_MS) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Redis operation timed out'), { code: 'REDIS_TIMEOUT' })), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
};

const ensureConnected = async (redis = getClient()) => {
  if (!redis) throw Object.assign(new Error('REDIS_URL is not configured'), { code: 'REDIS_NOT_CONFIGURED' });
  if (redis.status === 'ready') return redis;
  if (redis.status === 'end') {
    client = null;
    redis = getClient();
  }
  if (!connectPromise) {
    const ready = redis.status === 'wait'
      ? redis.connect()
      : new Promise((resolve, reject) => {
        const cleanup = () => { redis.off('ready', onReady); redis.off('end', onEnd); };
        const onReady = () => { cleanup(); resolve(redis); };
        const onEnd = () => { cleanup(); reject(Object.assign(new Error('Redis connection ended'), { code: 'REDIS_ENDED' })); };
        redis.once('ready', onReady);
        redis.once('end', onEnd);
      });
    connectPromise = withTimeout(ready).finally(() => { connectPromise = null; });
  }
  await connectPromise;
  if (redis.status !== 'ready') throw Object.assign(new Error('Redis is not ready'), { code: 'REDIS_NOT_READY' });
  return redis;
};

const namespaceKey = (rawKey) => {
  const digest = crypto.createHash('sha256').update(String(rawKey)).digest('hex');
  return `${PREFIX}rl:${digest}`;
};

// Sliding window, atomically counted in Redis. The member is random and contains
// no IP, email, or other request data. PEXPIRE bounds every limiter key.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window + 1000)
local count = redis.call('ZCARD', key)
if count > max then
  redis.call('ZREM', key, member)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 1
  if oldest[2] then retry = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000)) end
  return {0, count - 1, retry}
end
return {1, count, 0}
`;

const checkRateLimit = async ({ rawKey, windowMs, max }) => {
  const redis = await ensureConnected();
  const result = await withTimeout(redis.eval(
    SLIDING_WINDOW_SCRIPT, 1, namespaceKey(rawKey), Date.now(), windowMs, max, crypto.randomUUID(),
  ));
  return { allowed: Number(result[0]) === 1, count: Number(result[1]), retryAfterSeconds: Number(result[2]) };
};

const ping = async () => {
  const redis = await ensureConnected();
  return withTimeout(redis.ping());
};

const idempotencyCacheKey = (scopeKey) => `${PREFIX}idem:${crypto.createHash('sha256').update(String(scopeKey)).digest('hex')}`;
const getIdempotencyCache = async (scopeKey) => {
  const redis = await ensureConnected();
  return withTimeout(redis.get(idempotencyCacheKey(scopeKey)));
};
const setIdempotencyCache = async (scopeKey, value, ttlSeconds) => {
  const redis = await ensureConnected();
  return withTimeout(redis.set(idempotencyCacheKey(scopeKey), value, 'EX', ttlSeconds));
};
const deleteIdempotencyCache = async (scopeKey) => {
  const redis = await ensureConnected();
  return withTimeout(redis.del(idempotencyCacheKey(scopeKey)));
};

const closeRedis = async () => {
  if (client && client.status !== 'end') {
    try { await withTimeout(client.quit(), REDIS_TIMEOUT_MS); }
    catch { client.disconnect(); }
  }
};

module.exports = {
  hasRedis, checkRateLimit, ping, closeRedis, withTimeout, REDIS_TIMEOUT_MS,
  getIdempotencyCache, setIdempotencyCache, deleteIdempotencyCache,
};
