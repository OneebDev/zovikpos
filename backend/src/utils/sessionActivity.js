// src/utils/sessionActivity.js
// Centralized server-side session activity and idle expiry helper.
// Revised Rule B:
// B1. Cart empty AND no order AND idle > SESSION_IDLE_MINUTES (default 10): session ends -> TABLE_SESSION_REQUIRED
// B2. Cart has items AND no order AND idle > CART_ABANDON_MINUTES (default 30): session ends, server cart cleared -> TABLE_SESSION_REQUIRED
// B3. Session has ANY order that is not finished (PENDING, PREPARING, READY, etc): idleness must NEVER end it.
//     After all its orders are COMPLETED/CANCELLED/REJECTED/EXPIRED and idle > SESSION_IDLE_MINUTES, it may end.
// B4. Idle = now - (lastActivityAt ?? startedAt). Update lastActivityAt throttled to 30s.

'use strict';

const { prisma } = require('../config/db');

const parsePositiveInt = (val, fallback) => {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const getSessionIdleMinutes = () => parsePositiveInt(process.env.SESSION_IDLE_MINUTES, 10);
const getCartAbandonMinutes = () => parsePositiveInt(process.env.CART_ABANDON_MINUTES, 30);
const THROTTLE_SECONDS = 30;

// Terminal statuses: when all orders are in this set, orders are considered finished.
const FINISHED_ORDER_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'PAYMENT_FAILED', 'REFUNDED']);

/**
 * Checks if an active session has expired due to idleness according to Revised Rule B.
 * Server time only.
 * @param {Object} session - Session object containing startedAt, lastActivityAt
 * @param {number} cartItemCount - Number of distinct cart items
 * @param {Array|number} orders - Array of orders (or array of status strings), or order count
 * @param {number} [nowMs] - Optional override for testing clock shift
 * @returns {boolean} true if expired due to idleness
 */
const isSessionIdleExpired = (session, cartItemCount = 0, orders = [], nowMs = null) => {
  if (!session) return true;
  if (session.status !== 'ACTIVE') return true;

  // Normalize orders argument
  let orderList = [];
  if (Array.isArray(orders)) {
    orderList = orders;
  } else if (typeof orders === 'number' && orders > 0) {
    // Legacy numeric order count fallback: assume unfinished for safety
    return false;
  }

  // B3: Any unfinished order means idleness must NEVER end the session.
  const hasUnfinishedOrders = orderList.some((o) => {
    const status = typeof o === 'string' ? o : o?.status;
    return status && !FINISHED_ORDER_STATUSES.has(status);
  });

  if (hasUnfinishedOrders) {
    return false;
  }

  const idleMinutes = getSessionIdleMinutes();
  const cartAbandonMinutes = getCartAbandonMinutes();

  const lastActive = session.lastActivityAt
    ? new Date(session.lastActivityAt)
    : (session.startedAt ? new Date(session.startedAt) : null);
  // If we have no valid timestamp, we cannot determine idle state — treat as NOT expired (safe default)
  const lastActiveMs = lastActive && !Number.isNaN(lastActive.getTime()) ? lastActive.getTime() : null;
  if (lastActiveMs === null) return false;
  const now = nowMs ? new Date(nowMs).getTime() : Date.now();
  const diffMs = now - lastActiveMs;

  const hasOrders = orderList.length > 0;

  if (hasOrders) {
    // B3: All orders finished; expires when idle > SESSION_IDLE_MINUTES
    return diffMs > idleMinutes * 60 * 1000;
  }

  // No orders placed in this session:
  if (cartItemCount > 0) {
    // B2: Cart has items AND no order AND idle > CART_ABANDON_MINUTES (default 30)
    return diffMs > cartAbandonMinutes * 60 * 1000;
  }

  // B1: Cart empty AND no order AND idle > SESSION_IDLE_MINUTES (default 10)
  return diffMs > idleMinutes * 60 * 1000;
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

    // Fetch current session state to determine correct Rule B expiry tier
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        cart: { select: { items: { select: { id: true } } } },
        orders: { select: { status: true } },
      },
    });

    const cartItemCount = session?.cart?.items?.length || 0;
    const orderList = session?.orders || [];
    const hasUnfinishedOrders = orderList.some((o) => !FINISHED_ORDER_STATUSES.has(o.status));

    // Rule B3: If unfinished orders exist, use a generous expiry (never idle-expire)
    // Rule B2: If cart has items, use CART_ABANDON_MINUTES
    // Rule B1: Otherwise use SESSION_IDLE_MINUTES
    let ttlMs;
    if (hasUnfinishedOrders) {
      // Use the longer of cart-abandon or 60 minutes to prevent premature expiry
      ttlMs = Math.max(getCartAbandonMinutes(), 60) * 60 * 1000;
    } else if (cartItemCount > 0) {
      ttlMs = getCartAbandonMinutes() * 60 * 1000;
    } else {
      ttlMs = getSessionIdleMinutes() * 60 * 1000;
    }
    const newExpiresAt = new Date(now.getTime() + ttlMs);

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
  parsePositiveInt,
  getSessionIdleMinutes,
  getCartAbandonMinutes,
  FINISHED_ORDER_STATUSES,
  isSessionIdleExpired,
  touchSessionActivity,
};

