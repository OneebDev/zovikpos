// src/utils/sessionActivity.js
// Centralized server-side session activity and idle expiry helper.
// Rules:
// 1. SESSION_IDLE_MINUTES (default 10) from env.
// 2. A session is marked EXPIRED by inactivity ONLY IF:
//    - idle time > SESSION_IDLE_MINUTES (comparing now against lastActivityAt ?? startedAt)
//    - AND server-side cart is empty (items.length === 0 or no cart)
//    - AND session has 0 orders.
// 3. If cart has items OR any order exists, idleness never expires the session.
// 4. lastActivityAt updates are throttled to at most once per 30 seconds.

'use strict';

const { prisma } = require('../config/db');

const getSessionIdleMinutes = () => Number(process.env.SESSION_IDLE_MINUTES) || 10;
const THROTTLE_SECONDS = 30;

/**
 * Checks if an active session has expired due to idleness according to Rule B.
 * Server time only.
 * @param {Object} session - Session object containing startedAt, lastActivityAt, cart (with items) or orders count
 * @param {number} cartItemCount - Number of distinct cart items
 * @param {number} orderCount - Total orders placed in this session
 * @returns {boolean} true if expired due to idleness
 */
const isSessionIdleExpired = (session, cartItemCount = 0, orderCount = 0) => {
  if (!session) return true;
  if (session.status !== 'ACTIVE') return true;

  // Rule B: If cart has items OR any order exists, idle check MUST NOT expire the session
  if (cartItemCount > 0 || orderCount > 0) {
    return false;
  }

  const idleMinutes = getSessionIdleMinutes();
  const lastActive = session.lastActivityAt ? new Date(session.lastActivityAt) : new Date(session.startedAt);
  const now = Date.now();
  const diffMs = now - lastActive.getTime();
  const maxIdleMs = idleMinutes * 60 * 1000;

  return diffMs > maxIdleMs;
};

/**
 * Throttled update of lastActivityAt.
 * Writes to DB only if current lastActivityAt is null or older than 30 seconds.
 * Best effort / fire-and-forget safe.
 * @param {string} sessionId
 * @param {Date|string|null} currentLastActivityAt
 */
const touchSessionActivity = async (sessionId, currentLastActivityAt = null) => {
  if (!sessionId || typeof sessionId !== 'string') return;

  const now = new Date();
  if (currentLastActivityAt) {
    const elapsedMs = now.getTime() - new Date(currentLastActivityAt).getTime();
    if (elapsedMs < THROTTLE_SECONDS * 1000) {
      return; // Throttled
    }
  }

  try {
    const cutoff = new Date(now.getTime() - THROTTLE_SECONDS * 1000);
    const idleTtlMs = getSessionIdleMinutes() * 60 * 1000;
    const newExpiresAt = new Date(now.getTime() + idleTtlMs);

    await prisma.session.updateMany({
      where: {
        id: sessionId,
        status: 'ACTIVE',
        OR: [
          { lastActivityAt: null },
          { lastActivityAt: { lt: cutoff } },
        ],
      },
      data: {
        lastActivityAt: now,
        expiresAt: newExpiresAt,
      },
    });
  } catch (err) {
    // Best-effort update must never crash caller
  }
};

module.exports = {
  getSessionIdleMinutes,
  isSessionIdleExpired,
  touchSessionActivity,
};
