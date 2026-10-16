const crypto = require('crypto');

const QR_SECRET = process.env.QR_SECRET || 'zovikpos_qr_cryptographic_secret_2026';

/**
 * Safe buffer equality check that doesn't throw if lengths differ
 */
const safeCompare = (a, b) => {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Generate a cryptographically signed, URL-safe QR token for a physical table
 * @param {string|number} tableNumber e.g. "1", "4", "VIP-1"
 * @param {number} [branchId=1]
 * @returns {string} Signed token
 */
const generateTableToken = (tableNumber, branchId = 1) => {
  const cleanNumber = String(tableNumber).trim();
  const nonce = crypto.randomBytes(6).toString('hex');
  const payload = `tbl:${cleanNumber}:${branchId}:${nonce}`;
  const signature = crypto
    .createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}:${signature}`;
};

/**
 * Verify a table QR token (supports both raw and URL-encoded formats)
 * @param {string} token
 * @returns {{ valid: boolean, tableNumber?: string, branchId?: number, normalizedToken?: string, error?: string }}
 */
const verifyTableToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing or invalid token format.' };
  }

  // Clean and decode URL encoding if present (e.g. tbl%3A2%3A1%3A...)
  let cleanToken = token.trim();
  if (cleanToken.includes('%')) {
    try {
      cleanToken = decodeURIComponent(cleanToken);
    } catch {
      // Keep original if decode fails
    }
  }

  const parts = cleanToken.split(':');
  if (parts.length !== 5 || parts[0] !== 'tbl') {
    return { valid: false, error: 'Malformed table token structure.' };
  }

  const [, tableNumber, branchIdStr, nonce, receivedSig] = parts;
  const payload = `tbl:${tableNumber}:${branchIdStr}:${nonce}`;
  const expectedSig = crypto
    .createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('base64url');

  if (safeCompare(receivedSig, expectedSig)) {
    return {
      valid: true,
      tableNumber,
      branchId: parseInt(branchIdStr, 10) || 1,
      normalizedToken: cleanToken,
    };
  }

  return { valid: false, error: 'Cryptographic signature mismatch. Invalid table token.' };
};

/**
 * Generate a unique dynamic order tracking token
 * @param {number} orderId
 * @param {string} orderNumber
 * @returns {string} Signed tracking token
 */
const generateOrderTrackingToken = (orderId, orderNumber) => {
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `ord:${orderId}:${orderNumber}:${nonce}`;
  const signature = crypto
    .createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}:${signature}`;
};

/**
 * Verify an order tracking token (supports URL-encoded formats)
 * @param {string} token
 * @returns {{ valid: boolean, orderId?: number, orderNumber?: string, normalizedToken?: string, error?: string }}
 */
const verifyOrderTrackingToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing or invalid tracking token.' };
  }

  let cleanToken = token.trim();
  if (cleanToken.includes('%')) {
    try {
      cleanToken = decodeURIComponent(cleanToken);
    } catch {
      // Invalid percent encoding is rejected by the token structure check below.
    }
  }

  const parts = cleanToken.split(':');
  if (parts.length !== 5 || parts[0] !== 'ord') {
    return { valid: false, error: 'Malformed order tracking token structure.' };
  }

  const [, orderIdStr, orderNumber, nonce, receivedSig] = parts;
  const payload = `ord:${orderIdStr}:${orderNumber}:${nonce}`;
  const expectedSig = crypto
    .createHmac('sha256', QR_SECRET)
    .update(payload)
    .digest('base64url');

  if (safeCompare(receivedSig, expectedSig)) {
    return {
      valid: true,
      orderId: parseInt(orderIdStr, 10),
      orderNumber,
      normalizedToken: cleanToken,
    };
  }

  return { valid: false, error: 'Invalid tracking token signature.' };
};

module.exports = {
  generateTableToken,
  verifyTableToken,
  generateOrderTrackingToken,
  verifyOrderTrackingToken,
};
