const configuredOrigins = new Set();

const addConfiguredOrigins = (value) => {
  if (!value) return;
  value.split(',').forEach((raw) => {
    if (!raw) return;
    let candidate = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (!candidate) return;
    try {
      if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
        candidate = `https://${candidate}`;
      }
      configuredOrigins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed optional origins; valid configured entries still apply.
    }
  });
};

// Production default origins
configuredOrigins.add('https://zovik-pos.vercel.app');
addConfiguredOrigins('https://zovik-pos.vercel.app');

// Environment-configured origins
addConfiguredOrigins(process.env.FRONTEND_URL);
addConfiguredOrigins(process.env.CORS_ORIGINS);

const isAllowedVercelOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'zovik-pos.vercel.app') return true;
    // Allow project preview deployments (e.g. zovik-pos-git-main.vercel.app, zovik-pos-xyz.vercel.app)
    if (/^zovik-pos(-[a-z0-9-]+)?\.vercel\.app$/.test(parsed.hostname)) return true;
  } catch {
    return false;
  }
  return false;
};

const isPrivateIpv4 = (hostname) => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
};

const normalizeOrigin = (origin) => {
  if (!origin) return '';
  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim().replace(/\/+$/, '');
  }
};

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);

  const cleanOrigin = normalizeOrigin(origin);

  if (configuredOrigins.has(cleanOrigin) || configuredOrigins.has(origin)) {
    return callback(null, true);
  }

  if (isAllowedVercelOrigin(origin) || isAllowedVercelOrigin(cleanOrigin)) {
    return callback(null, true);
  }

  // Allow local development and local LAN origins
  try {
    const parsed = new URL(cleanOrigin);
    const isHttpOrigin = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    const isLocalNetwork = isPrivateIpv4(parsed.hostname) || parsed.hostname.endsWith('.local');
    if (isHttpOrigin && (isLocalHost || isLocalNetwork)) return callback(null, true);
  } catch {
    // Invalid Origin values are denied below.
  }

  return callback(null, false);
};

module.exports = corsOrigin;
