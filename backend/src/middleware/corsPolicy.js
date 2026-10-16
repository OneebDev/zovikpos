const configuredOrigins = new Set();

const addConfiguredOrigins = (value) => {
  if (!value) return;
  value.split(',').forEach((candidate) => {
    try {
      configuredOrigins.add(new URL(candidate.trim()).origin);
    } catch {
      // Ignore malformed optional origins; valid configured entries still apply.
    }
  });
};

addConfiguredOrigins(process.env.FRONTEND_URL);
addConfiguredOrigins(process.env.CORS_ORIGINS);

const isPrivateIpv4 = (hostname) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
};

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (configuredOrigins.has(origin)) return callback(null, true);

  if (process.env.NODE_ENV !== 'production') {
    try {
      const parsed = new URL(origin);
      const isHttpOrigin = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      const isLocalNetwork = isPrivateIpv4(parsed.hostname) || parsed.hostname.endsWith('.local');
      if (isHttpOrigin && (isLocalHost || isLocalNetwork)) return callback(null, true);
    } catch {
      // Invalid Origin values are denied below.
    }
  }

  return callback(null, false);
};

module.exports = corsOrigin;
