const crypto = require('crypto');

/**
 * Generate a cryptographically secure random session secret token.
 * 32 bytes (256 bits) encoded as a 64-character hex string.
 * @returns {string}
 */
function generateSessionSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a session secret using SHA-256 for persistent database storage.
 * @param {string} secret
 * @returns {string}
 */
function hashSessionSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Constant-time comparison of a plaintext secret with its stored SHA-256 hash.
 * @param {string} secret - Plaintext secret provided by client
 * @param {string} storedHash - Stored hex SHA-256 hash
 * @returns {boolean}
 */
function verifySessionSecret(secret, storedHash) {
  if (!secret || !storedHash || typeof secret !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const secretHash = hashSessionSecret(secret);
  if (secretHash.length !== storedHash.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(secretHash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  generateSessionSecret,
  hashSessionSecret,
  verifySessionSecret,
};
