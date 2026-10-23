// src/services/sweepJob.js
// Background sweep worker for Rule B5 (idle session & cart cleanup) and
// Rule D (stale PENDING order timeout, stock restoration, and staff alerts).
// Uses a transaction-level PostgreSQL advisory lock (pg_try_advisory_xact_lock)
// inside a single prisma.$transaction so the lock automatically releases on commit/rollback.

'use strict';

const { Prisma } = require('@prisma/client');
const { prisma: defaultPrisma } = require('../config/db');
const { parsePositiveInt, FINISHED_ORDER_STATUSES } = require('../utils/sessionActivity');
const { restoreInventoryForOrder } = require('./inventoryDeductionService');
const { emitToKitchen, emitToVendor, emitToAdmin, emitToUser } = require('../sockets/socket');

// Advisory lock integer ID: unique across application
const SWEEP_ADVISORY_LOCK_ID = 83827192;

let sweepTimer = null;

/**
 * Attempts to acquire a transaction-scoped Postgres advisory lock.
 * Automatically releases when the transaction finishes.
 * Fails closed: On any error, rethrows so transaction rolls back.
 */
async function tryAdvisoryXactLock(tx, lockId = SWEEP_ADVISORY_LOCK_ID) {
  const result = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${lockId}) as locked;`;
  if (Array.isArray(result) && result[0] && typeof result[0].locked === 'boolean') {
    return result[0].locked;
  }
  return false;
}

/**
 * Core sweep function executing B5 and D1-D6.
 * Runs inside a single transaction with pg_try_advisory_xact_lock at the start.
 * If lock is held by another dyno/worker, exits immediately.
 * No manual unlock required.
 *
 * @param {object} [options]
 * @param {object} [options.db] - Prisma client override
 * @param {number} [options.nowMs] - Timestamp override for testing
 */
async function runSweep(options = {}) {
  const db = options.db || defaultPrisma;
  const nowMs = options.nowMs || Date.now();

  try {
    return await db.$transaction(
      async (tx) => {
        // 1. Transaction-level advisory lock
        const lockAcquired = await tryAdvisoryXactLock(tx, SWEEP_ADVISORY_LOCK_ID);
        if (!lockAcquired) {
          return { skipped: true, reason: 'lock_held_by_another_dyno' };
        }

        // Ensure timestamp comparisons use UTC throughout this transaction.
        // Prisma stores DateTime as `timestamp without time zone` using UTC values.
        // If the PG session timezone is non-UTC, comparing against JS Date params
        // (sent as timestamptz strings) would apply a timezone offset and give wrong results.
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'UTC'`);

        // =========================================================================
        // PART 1: Session & Cart Expiration (Rule B5)
        // =========================================================================
        const sessionIdleMins = parsePositiveInt(process.env.SESSION_IDLE_MINUTES, 10);
        const cartAbandonMins = parsePositiveInt(process.env.CART_ABANDON_MINUTES, 30);
        const emptyIdleCutoff = new Date(nowMs - sessionIdleMins * 60 * 1000);
        const cartAbandonCutoff = new Date(nowMs - cartAbandonMins * 60 * 1000);
        const terminalStatuses = Array.from(FINISHED_ORDER_STATUSES);

        // One conditional statement:
        // Update "Session" SET status='EXPIRED' WHERE status='ACTIVE'
        // AND no unfinished orders exist
        // AND either (cart has items AND idle > cartAbandonMins) OR (empty cart AND idle > sessionIdleMins)
        // RETURNING id
        const expiredRows = await tx.$queryRaw`
          UPDATE "Session"
          SET "status" = 'EXPIRED'
          WHERE "Session"."status" = 'ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM "Order" o
              WHERE o."sessionId" = "Session".id
                AND o.status NOT IN (${Prisma.join(terminalStatuses)})
            )
            AND (
              (
                EXISTS (
                  SELECT 1 FROM "Cart" c
                  JOIN "CartItem" ci ON ci."cartId" = c."id"
                  WHERE c."sessionId" = "Session".id
                )
                AND COALESCE("Session"."lastActivityAt", "Session"."startedAt") < ${cartAbandonCutoff}::timestamp
              )
              OR
              (
                NOT EXISTS (
                  SELECT 1 FROM "Cart" c
                  JOIN "CartItem" ci ON ci."cartId" = c."id"
                  WHERE c."sessionId" = "Session".id
                )
                AND COALESCE("Session"."lastActivityAt", "Session"."startedAt") < ${emptyIdleCutoff}::timestamp
              )
            )
          RETURNING "Session".id;
        `;

        const expiredSessionIds = (Array.isArray(expiredRows) ? expiredRows : []).map((row) => row.id);
        const expiredSessionsCount = expiredSessionIds.length;

        if (expiredSessionIds.length > 0) {
          // Delete cart items only for the ids that RETURNING gave back that had items
          await tx.cartItem.deleteMany({
            where: { cart: { sessionId: { in: expiredSessionIds } } },
          });
        }

        // =========================================================================
        // PART 2: Stale PENDING Orders Timeout & Stock Restoration (Rule D1-D5)
        // =========================================================================
        const pendingTimeoutMins = parsePositiveInt(process.env.ORDER_PENDING_TIMEOUT_MINUTES, 15);
        const pendingCutoff = new Date(nowMs - pendingTimeoutMins * 60 * 1000);

        const pendingWarnMins = parsePositiveInt(process.env.ORDER_PENDING_WARN_MINUTES, 5);
        const warnCutoff = new Date(nowMs - pendingWarnMins * 60 * 1000);

        // Candidate orders: PENDING and UNPAID older than cutoff.
        // NEVER auto-cancel PAID, PAYMENT_PENDING, PENDING_VERIFICATION, or VERIFIED orders.
        const candidateOrders = await tx.order.findMany({
          where: {
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            createdAt: { lt: pendingCutoff },
          },
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            tableLabel: true,
            tableNumber: true,
          },
        });

        const cancelledOrdersToNotify = [];

        for (const ord of candidateOrders) {
          // Conditional update: only update if STILL PENDING and UNPAID
          const updateResult = await tx.order.updateMany({
            where: {
              id: ord.id,
              status: 'PENDING',
              paymentStatus: 'UNPAID',
            },
            data: { status: 'CANCELLED' },
          });

          // If count === 0, cashier or customer acted at the same moment -> skip!
          if (updateResult.count === 0) {
            continue;
          }

          // Record history note (D1)
          await tx.orderStatusHistory.create({
            data: {
              orderId: ord.id,
              previousStatus: 'PENDING',
              newStatus: 'CANCELLED',
              note: 'AUTO_TIMEOUT_NO_CASHIER_ACTION',
            },
          });

          // Restore inventory atomically in the same transaction, only if deducted
          await restoreInventoryForOrder(ord.id, null, 'AUTO_TIMEOUT_NO_CASHIER_ACTION', tx);

          cancelledOrdersToNotify.push(ord);
        }

        // =========================================================================
        // PART 3: Staff Alert for Orders Pending > ORDER_PENDING_WARN_MINUTES (D6)
        // =========================================================================
        const warnOrders = await tx.order.findMany({
          where: {
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            createdAt: { lt: warnCutoff, gte: pendingCutoff },
          },
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            tableLabel: true,
          },
          take: 20,
        });

        return {
          expiredSessions: expiredSessionIds.length,
          autoCancelledOrders: cancelledOrdersToNotify.length,
          cancelledOrdersToNotify,
          warnOrders,
        };
      },
      {
        timeout: 30000, // Generous 30s timeout for sweep operations
      }
    ).then((result) => {
      // Emit socket notifications outside the transaction to keep lock duration minimal
      if (result && Array.isArray(result.cancelledOrdersToNotify)) {
        for (const ord of result.cancelledOrdersToNotify) {
          const payload = {
            id: ord.id,
            orderNumber: ord.orderNumber,
            status: 'CANCELLED',
            cancellationReason: 'Cancelled: restaurant did not respond',
            note: 'AUTO_TIMEOUT_NO_CASHIER_ACTION',
            tableLabel: ord.tableLabel || ord.tableNumber,
          };
          try {
            emitToKitchen('order:update', payload);
            emitToVendor('order:update', payload);
            emitToAdmin('order:update', payload);
            emitToUser(ord.userId, 'order:update', payload);
          } catch {
            // Sockets best effort
          }
        }
      }

      if (result && Array.isArray(result.warnOrders)) {
        for (const w of result.warnOrders) {
          try {
            emitToVendor('order:update', {
              id: w.id,
              orderNumber: w.orderNumber,
              warning: 'PENDING_CASHIER_ACTION_NEEDED',
              pendingSince: w.createdAt,
            });
            emitToKitchen('order:update', {
              id: w.id,
              orderNumber: w.orderNumber,
              warning: 'PENDING_CASHIER_ACTION_NEEDED',
              pendingSince: w.createdAt,
            });
          } catch {
            // Sockets best effort
          }
        }
      }

      return {
        expiredSessions: result?.expiredSessions || 0,
        autoCancelledOrders: result?.autoCancelledOrders || 0,
      };
    });
  } catch (err) {
    // B5: Must not crash the server on error (try/catch, log without secrets)
    console.error('[SweepJob] Background sweep execution error:', err.message);
    return null;
  }
}

/**
 * Starts the periodic background sweep interval.
 */
const startSweepJob = () => {
  const intervalSec = parsePositiveInt(process.env.SWEEP_INTERVAL_SECONDS, 60);
  const intervalMs = intervalSec * 1000;

  // Run initial pass after 5s startup delay
  const initialTimer = setTimeout(() => void runSweep(), 5000);
  initialTimer.unref?.();

  sweepTimer = setInterval(() => void runSweep(), intervalMs);
  sweepTimer.unref?.();
  return sweepTimer;
};

/**
 * Stops the periodic background sweep interval.
 */
const stopSweepJob = () => {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
};

module.exports = {
  SWEEP_ADVISORY_LOCK_ID,
  tryAdvisoryXactLock,
  runSweep,
  startSweepJob,
  stopSweepJob,
};
