const crypto = require('crypto');
const { prisma } = require('../config/db');
const { verifyTableToken } = require('../services/qrSecurityService');
const { formatTableLabel, isPhysicalTable } = require('../utils/tableLabel');
const { isSessionIdleExpired, touchSessionActivity } = require('../utils/sessionActivity');
const { generateSessionSecret, hashSessionSecret } = require('../utils/sessionSecurity');

/**
 * Start a new dining session from a validated table QR
 */
const startSession = async (req, res) => {
  const { qrToken, validateOnly = false } = req.body;
  const customerId = req.user?.id || null;

  if (req.user && req.user.role === 'CUSTOMER' && req.user.isActive === false) {
    return res.status(403).json({ error: 'This student account has been restricted by administration. Ordering is blocked.' });
  }

  try {
    let table = null;

    if (!qrToken || typeof qrToken !== 'string') {
      return res.status(400).json({
        error: 'Please scan your table QR code',
        message: 'Please scan your table QR code',
        code: 'TABLE_QR_REQUIRED',
      });
    }

    const verification = verifyTableToken(qrToken);
    if (!verification.valid) {
      return res.status(400).json({ error: 'Please scan your table QR code', message: 'Please scan your table QR code', code: 'TABLE_QR_REQUIRED' });
    }

    const searchToken = verification.normalizedToken || qrToken;
    table = await prisma.table.findFirst({
      where: { qrToken: searchToken },
      include: { branch: true },
    });

    const tokenTableNumber = String(verification.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
    const storedTableNumber = String(table?.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
    if (table && (storedTableNumber !== tokenTableNumber || table.branchId !== verification.branchId)) {
      table = null;
    }

    if (!table) {
      return res.status(400).json({ error: 'Please scan your table QR code', message: 'Please scan your table QR code', code: 'TABLE_QR_REQUIRED' });
    }

    if (table && !table.isActive) {
      return res.status(403).json({ error: `Table ${table.tableNumber} is currently deactivated by management.` });
    }

    if (validateOnly) {
      return res.json({
        valid: true,
        table: { id: table.id, tableNumber: table.tableNumber, branchId: table.branchId },
        tableLabel: formatTableLabel({ table }),
      });
    }

    // Create a new distinct session UUID for this customer visit
    const sessionId = crypto.randomUUID();
    const sessionSecret = generateSessionSecret();
    const secretHash = hashSessionSecret(sessionSecret);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes inactivity window

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        tableId: table.id,
        tableLabel: formatTableLabel({ table }),
        customerId,
        status: 'ACTIVE',
        secretHash,
        startedAt: now,
        lastActivityAt: now,
        expiresAt,
        cart: {
          create: {},
        },
      },
      include: {
        table: {
          select: { id: true, tableNumber: true, branchId: true, isActive: true },
        },
        cart: {
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Dining session initialized successfully.',
      session: {
        id: session.id,
        status: session.status,
        table: session.table,
        tableNumber: session.table?.tableNumber || formatTableLabel(session),
        tableLabel: formatTableLabel(session),
        customerId: session.customerId,
        expiresAt: session.expiresAt,
        cart: session.cart,
        secret: sessionSecret,
      },
    });
  } catch (error) {
    console.error('Start session error:', error);
    return res.status(500).json({ error: 'Failed to start dining session.' });
  }
};

/**
 * Get details and active status of a session
 */
const getSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        table: true,
        customer: {
          select: { id: true, name: true, email: true, role: true },
        },
        cart: {
          include: {
            items: {
              include: { menuItem: true },
            },
          },
        },
        orders: {
          include: {
            table: { select: { id: true, tableNumber: true } },
            orderItems: {
              include: { menuItem: true },
            },
            payment: true,
            etaPrediction: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Dining session not found.' });
    }

    // Older counter sessions remain stored for history, but are no longer valid
    // customer ordering sessions. Report them expired without rewriting history.
    if (!session.tableId || !isPhysicalTable(session.table)) {
      session.status = 'EXPIRED';
    }

    if (req.user?.role === 'CUSTOMER' && session.customerId && session.customerId !== req.user.id) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }

    // Revised Rule B: Evaluate idle expiry based on B1, B2, B3 rules
    if (session.status === 'ACTIVE') {
      const cartItemCount = session.cart?.items?.length || 0;
      const idleExpired = isSessionIdleExpired(session, cartItemCount, session.orders);

      if (idleExpired) {
        const updated = await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'EXPIRED' },
        });
        session.status = updated.status;
        if (cartItemCount > 0) {
          await prisma.cartItem.deleteMany({ where: { cart: { sessionId } } }).catch(() => {});
          if (session.cart?.items) session.cart.items = [];
        }
      } else {
        // Throttled activity touch (fire-and-forget, no await)
        touchSessionActivity(sessionId, session.lastActivityAt).catch(() => {});
      }
    }

    return res.json({
      session: {
        ...session,
        tableNumber: session.table?.tableNumber || formatTableLabel(session),
        tableLabel: formatTableLabel(session),
        orders: session.orders?.map((order) => ({
          ...order,
          tableNumber: formatTableLabel(order),
          tableLabel: formatTableLabel(order),
        })),
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    return res.status(500).json({ error: 'Failed to fetch session details.' });
  }
};

/**
 * Close/complete a dining session
 */
const closeSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (req.user?.role === 'CUSTOMER' && session.customerId && session.customerId !== req.user.id) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return res.json({ message: 'Session closed successfully.', session: updated });
  } catch (error) {
    console.error('Close session error:', error);
    return res.status(500).json({ error: 'Failed to close session.' });
  }
};

/**
 * Transfer an ACTIVE dining session (cart only – no orders) to a different physical table.
 *
 * Rule A:
 *  - If the session has ANY order (any status), return 409 SESSION_HAS_ORDERS.
 *  - Only the signed QR token of the NEW table is accepted; tableNumber/tableId from
 *    the request body is NEVER trusted for CUSTOMER callers.
 *  - The order-count check and the table-id update happen inside a single Prisma
 *    interactive transaction so there is no race window between reading and writing.
 */
const transferSessionTable = async (req, res) => {
  const { sessionId, qrToken, targetTableNumber } = req.body;
  const callerId = req.user?.id || null;
  const callerRole = req.user?.role;

  if (!sessionId) {
    return res.status(400).json({ error: 'Current session ID is required.' });
  }

  // ---- Resolve the target table ----------------------------------------
  // CUSTOMERS may ONLY use the signed QR token.  Staff may fall back to tableNumber.
  try {
    let targetTable = null;

    if (qrToken) {
      const verification = verifyTableToken(qrToken);
      if (verification.valid) {
        const searchToken = verification.normalizedToken || qrToken;
        const candidate = await prisma.table.findFirst({
          where: { qrToken: searchToken },
          include: { branch: true },
        });
        const tokenTableNumber = String(verification.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
        const storedTableNumber = String(candidate?.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
        if (candidate && storedTableNumber === tokenTableNumber && candidate.branchId === verification.branchId) {
          targetTable = candidate;
        }
      }
    }

    // Staff-only fallback: accept tableNumber from body when no signed token resolved a table.
    if (callerRole !== 'CUSTOMER' && !targetTable && targetTableNumber) {
      const cleanNumber = String(targetTableNumber).toLowerCase().startsWith('table')
        ? String(targetTableNumber)
        : `Table ${targetTableNumber}`;
      targetTable = await prisma.table.findFirst({
        where: { tableNumber: cleanNumber },
        include: { branch: true },
      });
    }

    if (!targetTable) {
      return res.status(404).json({ error: 'Target table not found or QR token invalid.' });
    }

    if (!targetTable.isActive) {
      return res.status(403).json({ error: `${targetTable.tableNumber} is currently deactivated by management.` });
    }

    // ---- Validate caller ownership of the current session ----------------
    const currentSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });

    if (!currentSession) {
      return res.status(404).json({ error: 'Current dining session not found.' });
    }

    if (callerRole === 'CUSTOMER' && currentSession.customerId && currentSession.customerId !== callerId) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }

    if (callerRole === 'CUSTOMER' && (
      currentSession.status !== 'ACTIVE'
      || !currentSession.tableId
      || !isPhysicalTable(currentSession.table)
    )) {
      return res.status(403).json({
        error: 'Scan a valid table QR code before switching tables.',
        code: 'TABLE_SESSION_REQUIRED',
      });
    }

    const oldTableDisplay = formatTableLabel(currentSession);
    const newTableDisplay = formatTableLabel({ table: targetTable });

    // ---- Transaction: order-count check + table update (race-safe) -------
    // We use an interactive transaction so the count and the update are atomic.
    // If any order exists on this session the update is skipped and 409 is returned.
    const result = await prisma.$transaction(async (tx) => {
      // Lock the session row by reading it inside the transaction.
      const lockedSession = await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, tableId: true },
      });

      if (!lockedSession || lockedSession.status !== 'ACTIVE') {
        return { type: 'error', status: 403, code: 'TABLE_SESSION_REQUIRED', message: 'Session is no longer active.' };
      }

      // Rule A: any order = block
      const orderCount = await tx.order.count({ where: { sessionId } });
      if (orderCount > 0) {
        return { type: 'error', status: 409, code: 'SESSION_HAS_ORDERS', message: 'Cannot change table after orders have been placed. Start a new session.' };
      }

      // Perform the table change (cart-only session)
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          tableId: targetTable.id,
          tableLabel: newTableDisplay,
        },
        include: {
          table: { select: { id: true, tableNumber: true, branchId: true, isActive: true } },
        },
      });
      return { type: 'ok', session: updated };
    });

    if (result.type === 'error') {
      return res.status(result.status).json({ error: result.message, code: result.code });
    }

    const updatedSession = result.session;

    return res.json({
      message: `Successfully transferred to ${newTableDisplay}.`,
      session: {
        ...updatedSession,
        tableNumber: updatedSession.table?.tableNumber || formatTableLabel(updatedSession),
        tableLabel: formatTableLabel(updatedSession),
      },
      orders: [],
      oldTable: oldTableDisplay,
      newTable: newTableDisplay,
    });
  } catch (error) {
    console.error('Transfer session table error:', error);
    return res.status(500).json({ error: 'Failed to transfer table.' });
  }
};

module.exports = {
  startSession,
  getSession,
  closeSession,
  transferSessionTable,
};
