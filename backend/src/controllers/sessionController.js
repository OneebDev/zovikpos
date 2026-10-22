const crypto = require('crypto');
const { prisma } = require('../config/db');
const { verifyTableToken } = require('../services/qrSecurityService');
const { formatTableLabel, isPhysicalTable } = require('../utils/tableLabel');

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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes inactivity window

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        tableId: table.id,
        tableLabel: formatTableLabel({ table }),
        customerId,
        status: 'ACTIVE',
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

    // Keep sessions alive for verified customers, non-empty server carts, and active orders.
    // Empty guest sessions still expire after 10 minutes without activity.
    if (session.status === 'ACTIVE') {
      const activeOrderCount = await prisma.order.count({
        where: {
          sessionId,
          status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'] },
        },
      });
      const hasCartItems = Boolean(session.cart?.items?.some((item) => Number(item.quantity) > 0));
      const protectedSession = Boolean(
        session.customerId
        || (req.user?.role === 'CUSTOMER' && req.user?.id)
        || hasCartItems
        || activeOrderCount > 0
      );

      if (protectedSession) {
        const renewedExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: renewedExpiry } });
        session.expiresAt = renewedExpiry;
      } else if (new Date() > new Date(session.expiresAt)) {
        const updated = await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'EXPIRED' },
        });
        session.status = updated.status;
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
 * Seamlessly transfer an active dining session and its pending/cooking orders to a new physical table
 */
const transferSessionTable = async (req, res) => {
  const { sessionId, qrToken, targetTableNumber } = req.body;
  const customerId = req.user?.id || null;

  if (!sessionId) {
    return res.status(400).json({ error: 'Current session ID is required.' });
  }

  try {
    let targetTable = null;

    if (qrToken) {
      const verification = verifyTableToken(qrToken);
      if (verification.valid) {
        const searchToken = verification.normalizedToken || qrToken;
        targetTable = await prisma.table.findFirst({
          where: { qrToken: searchToken },
          include: { branch: true },
        });
        const tokenTableNumber = String(verification.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
        const storedTableNumber = String(targetTable?.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
        if (targetTable && (storedTableNumber !== tokenTableNumber || targetTable.branchId !== verification.branchId)) {
          targetTable = null;
        }
      }
    }

    if (req.user?.role !== 'CUSTOMER' && !targetTable && targetTableNumber) {
      const cleanNumber = String(targetTableNumber).toLowerCase().startsWith('table')
        ? String(targetTableNumber)
        : `Table ${targetTableNumber}`;
      targetTable = await prisma.table.findFirst({
        where: { tableNumber: cleanNumber },
        include: { branch: true },
      });
    }

    if (!targetTable) {
      return res.status(404).json({ error: 'Target table not found.' });
    }

    if (!targetTable.isActive) {
      return res.status(403).json({ error: `${targetTable.tableNumber} is currently deactivated by management.` });
    }

    const currentSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { table: true },
    });

    if (!currentSession) {
      return res.status(404).json({ error: 'Current dining session not found.' });
    }

    if (req.user?.role === 'CUSTOMER' && currentSession.customerId && currentSession.customerId !== req.user.id) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }

    if (req.user?.role === 'CUSTOMER' && (
      currentSession.status !== 'ACTIVE'
      || new Date(currentSession.expiresAt) <= new Date()
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

    // 1. Update session to point to the new physical table
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        tableId: targetTable.id,
        tableLabel: newTableDisplay,
      },
      include: {
        table: {
          select: { id: true, tableNumber: true, branchId: true, isActive: true },
        },
      },
    });

    // 2. Find active orders attached to this session that are not completed or cancelled
    const activeOrders = await prisma.order.findMany({
      where: {
        sessionId: sessionId,
        status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'] },
      },
      include: {
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        payment: true,
        etaPrediction: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    const updatedOrders = [];
    const { emitToKitchen, emitToVendor, emitToAdmin, emitToUser } = require('../sockets/socket');

    for (const ord of activeOrders) {
      const updatedOrd = await prisma.order.update({
        where: { id: ord.id },
        data: {
          tableId: targetTable.id,
          tableNumber: newTableDisplay,
          tableLabel: newTableDisplay,
        },
        include: {
          table: { select: { id: true, tableNumber: true } },
          orderItems: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
          payment: true,
          etaPrediction: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      // Record in status history for audit
      await prisma.orderStatusHistory.create({
        data: {
          orderId: ord.id,
          previousStatus: ord.status,
          newStatus: ord.status,
          changedByUserId: customerId || ord.userId,
          note: `Customer moved table: Shifted from ${oldTableDisplay} to ${newTableDisplay}`,
        },
      });

      // Realtime notification to Kitchen, Cashier/Vendor, Admin, and Customer
      emitToKitchen('order:update', updatedOrd);
      emitToVendor('order:update', updatedOrd);
      emitToAdmin('order:update', updatedOrd);
      emitToUser(updatedOrd.userId, 'order:update', updatedOrd);

      emitToKitchen('table:shift', {
        orderId: updatedOrd.id,
        orderNumber: updatedOrd.orderNumber,
        oldTable: oldTableDisplay,
        newTable: newTableDisplay,
      });

      updatedOrders.push(updatedOrd);
    }

    return res.json({
      message: `Successfully transferred to ${newTableDisplay}. Kitchen and staff have been notified.`,
      session: {
        ...updatedSession,
        tableNumber: updatedSession.table?.tableNumber || formatTableLabel(updatedSession),
        tableLabel: formatTableLabel(updatedSession),
      },
      orders: updatedOrders,
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
