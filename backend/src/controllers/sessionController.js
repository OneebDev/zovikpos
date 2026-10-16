const crypto = require('crypto');
const { prisma } = require('../config/db');
const { verifyTableToken } = require('../services/qrSecurityService');

/**
 * Start a new dining session from a validated table QR
 */
const startSession = async (req, res) => {
  const { qrToken, tableNumber } = req.body;
  const customerId = req.user?.id || null;

  try {
    let table = null;

    if (qrToken) {
      const verification = verifyTableToken(qrToken);
      if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Invalid table QR code.' });
      }

      const searchToken = verification.normalizedToken || qrToken;
      table = await prisma.table.findFirst({
        where: {
          OR: [
            { qrToken: searchToken },
            { qrToken: qrToken },
            { tableNumber: `Table ${verification.tableNumber}` },
            { tableNumber: String(verification.tableNumber) },
          ],
        },
        include: { branch: true },
      });
    } else if (tableNumber) {
      const cleanNumber = String(tableNumber).toLowerCase().startsWith('table')
        ? String(tableNumber)
        : `Table ${tableNumber}`;
      table = await prisma.table.findFirst({
        where: { tableNumber: cleanNumber },
        include: { branch: true },
      });
    }

    if (!table) {
      return res.status(404).json({ error: 'Physical dining table not found.' });
    }

    if (!table.isActive) {
      return res.status(403).json({ error: `Table ${table.tableNumber} is currently deactivated by management.` });
    }

    // Create a new distinct session UUID for this customer visit
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes inactivity window

    const session = await prisma.session.create({
      data: {
        id: sessionId,
        tableId: table.id,
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

    if (req.user?.role === 'CUSTOMER' && session.customerId && session.customerId !== req.user.id) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }

    // Auto-expire check
    if (session.status === 'ACTIVE' && new Date() > new Date(session.expiresAt)) {
      // Check if session has active orders before expiring
      const activeOrderCount = await prisma.order.count({
        where: {
          sessionId: sessionId,
          status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'] },
        },
      });

      if (activeOrderCount > 0) {
        // Extend session - active orders prevent expiry
        await prisma.session.update({
          where: { id: sessionId },
          data: { expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
        });
      } else {
        const updated = await prisma.session.update({
          where: { id: sessionId },
          data: { status: 'EXPIRED' },
        });
        session.status = updated.status;
      }
    }

    return res.json({ session });
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
          where: {
            OR: [
              { qrToken: searchToken },
              { qrToken: qrToken },
              { tableNumber: `Table ${verification.tableNumber}` },
              { tableNumber: String(verification.tableNumber) },
            ],
          },
          include: { branch: true },
        });
      }
    }

    if (!targetTable && targetTableNumber) {
      const cleanNumber = String(targetTableNumber).toLowerCase().startsWith('table')
        ? String(targetTableNumber)
        : `Table ${targetTableNumber}`;
      targetTable = await prisma.table.findFirst({
        where: { tableNumber: cleanNumber },
        include: { branch: true },
      });
    }

    if (!targetTable) {
      return res.status(404).json({ error: 'Target dining table not found.' });
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

    const oldTableDisplay = currentSession.table?.tableNumber || `Table ${currentSession.tableId}`;
    const newTableDisplay = targetTable.tableNumber;

    // 1. Update session to point to the new physical table
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        tableId: targetTable.id,
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
        },
        include: {
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
      session: updatedSession,
      orders: updatedOrders,
      oldTable: oldTableDisplay,
      newTable: newTableDisplay,
    });
  } catch (error) {
    console.error('Transfer session table error:', error);
    return res.status(500).json({ error: 'Failed to transfer dining table.' });
  }
};

module.exports = {
  startSession,
  getSession,
  closeSession,
  transferSessionTable,
};
