const { prisma } = require('../config/db');
const { emitToVendor, emitToUser, emitToKitchen, emitToAdmin, broadcastEvent } = require('../sockets/socket');
const { sendPaymentConfirmedEmail, sendOrderCancellationEmail } = require('../services/emailService');
const { logAudit } = require('../middleware/auditMiddleware');
const { deductInventoryForConfirmedOrder, restoreInventoryForOrder } = require('../services/inventoryDeductionService');
const { clearDashboardStatsCache } = require('./adminController');
const { withTableLabel } = require('../utils/tableLabel');

/**
 * Get current Payment Availability Settings (COD & Online)
 */
const getPaymentSettings = async (req, res) => {
  try {
    let settings = await prisma.paymentSetting.findFirst();
    if (!settings) {
      settings = await prisma.paymentSetting.create({
        data: { codEnabled: true, onlineEnabled: true },
      });
    }

    const payload = {
      codEnabled: settings.codEnabled,
      onlineEnabled: settings.onlineEnabled,
      updatedAt: settings.updatedAt,
    };

    return res.json({
      ...payload,
      settings: payload,
    });
  } catch (error) {
    console.error('Get payment settings error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment availability settings.' });
  }
};

/**
 * Update Payment Availability Settings (Admin & Vendor only)
 */
const updatePaymentSettings = async (req, res) => {
  const { codEnabled, onlineEnabled } = req.body;
  const staffUserId = req.user?.id;

  try {
    let settings = await prisma.paymentSetting.findFirst();
    const updateData = {};
    if (typeof codEnabled === 'boolean') updateData.codEnabled = codEnabled;
    if (typeof onlineEnabled === 'boolean') updateData.onlineEnabled = onlineEnabled;

    const oldVal = settings ? { codEnabled: settings.codEnabled, onlineEnabled: settings.onlineEnabled } : null;

    if (!settings) {
      settings = await prisma.paymentSetting.create({
        data: {
          codEnabled: typeof codEnabled === 'boolean' ? codEnabled : true,
          onlineEnabled: typeof onlineEnabled === 'boolean' ? onlineEnabled : true,
        },
      });
    } else {
      settings = await prisma.paymentSetting.update({
        where: { id: settings.id },
        data: updateData,
      });
    }

    const payload = {
      codEnabled: settings.codEnabled,
      onlineEnabled: settings.onlineEnabled,
      updatedAt: settings.updatedAt,
    };

    // Realtime Socket broadcast to all connected clients (customers, vendors, admin)
    broadcastEvent('paymentSettings:update', payload);

    await logAudit({
      userId: staffUserId,
      action: 'PAYMENT_SETTINGS_UPDATE',
      entity: 'PaymentSetting',
      entityId: String(settings.id),
      oldValue: oldVal,
      newValue: payload,
      req,
    });

    clearDashboardStatsCache();

    return res.json({
      message: 'Payment availability settings updated successfully.',
      ...payload,
      settings: payload,
    });
  } catch (error) {
    console.error('Update payment settings error:', error);
    return res.status(500).json({ error: 'Failed to update payment availability settings.' });
  }
};

/**
 * Submit online wallet transaction ID for verification
 */
const submitTransactionId = async (req, res) => {
  const { orderId, paymentMethod, paymentTxId } = req.body;
  const userId = req.user.id;

  if (!orderId || !paymentMethod || !paymentTxId) {
    return res.status(400).json({ error: 'Order ID, payment method, and transaction ID are required.' });
  }

  const normalizedPaymentMethod = String(paymentMethod).trim().toUpperCase();
  if (!['EASYPAISA', 'JAZZCASH'].includes(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Online payments currently support Easypaisa and JazzCash.' });
  }

  const cleanTxId = String(paymentTxId).trim();

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId, 10) },
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (order.userId !== userId && req.user.role === 'CUSTOMER') {
      return res.status(403).json({ error: 'Access forbidden. This order belongs to another customer.' });
    }

    if (order.status === 'PAID') {
      return res.status(400).json({ error: 'Order is already paid and verified.' });
    }

    if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot submit payment for a ${order.status.toLowerCase()} order.` });
    }

    // Check if txId is already used on another verified order
    const existingTx = await prisma.order.findFirst({
      where: {
        paymentTxId: cleanTxId,
        id: { not: order.id },
        paymentStatus: 'VERIFIED',
      },
    });

    if (existingTx) {
      return res.status(400).json({ error: 'This transaction ID has already been verified for another order.' });
    }

    // Update order payment status
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: normalizedPaymentMethod === 'EASYPAISA' ? 'Easypaisa' : 'JazzCash',
        paymentTxId: cleanTxId,
        paymentStatus: 'PENDING_VERIFICATION',
        status: 'PAYMENT_PENDING',
      },
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        etaPrediction: true,
      },
    });

    const orderWithTableLabel = withTableLabel(updatedOrder);
    // Notify staff layers about transaction pending verification
    emitToVendor('payment:verify', orderWithTableLabel);
    emitToAdmin('payment:verify', orderWithTableLabel);
    emitToVendor('order:update', orderWithTableLabel);
    emitToAdmin('order:update', orderWithTableLabel);
    emitToUser(userId, 'order:update', orderWithTableLabel);

    return res.json({
      message: 'Transaction details submitted successfully. Awaiting staff verification.',
      order: orderWithTableLabel,
    });
  } catch (error) {
    console.error('Submit payment transaction error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'This transaction ID has already been submitted for another payment.' });
    }
    return res.status(500).json({ error: 'Failed to submit payment verification details.' });
  }
};

/**
 * Verify or Reject Online / Cash payment transaction (Admin & Vendor only)
 */
const verifyTransaction = async (req, res) => {
  const { id } = req.params; // Order ID
  const { approve, reason } = req.body; // approve: boolean
  const staffUserId = req.user.id;

  if (approve === undefined) {
    return res.status(400).json({ error: 'Approval status (approve: true/false) is required.' });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        etaPrediction: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Idempotency: if already verified and approve is requested, return order safely
    if (approve && order.paymentStatus === 'VERIFIED' && order.status === 'PAID') {
      return res.json({
        message: 'Payment already verified.',
        order: withTableLabel(order),
      });
    }

    if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot verify payment for a ${order.status.toLowerCase()} order.` });
    }

    const previousStatus = order.status;
    const newStatus = approve ? 'PAID' : 'PAYMENT_FAILED';
    const newPaymentStatus = approve ? 'VERIFIED' : 'FAILED';

    // STEP 1: Update order status + history in a FAST minimal transaction (no inventory here)
    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          previousStatus,
          newStatus,
          changedByUserId: staffUserId,
          note: approve
            ? 'Payment verified and approved by staff.'
            : (reason || 'Payment verification rejected by staff.'),
        },
      });

      return tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: newPaymentStatus,
          status: newStatus,
        },
        include: {
          table: { select: { id: true, tableNumber: true } },
          orderItems: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
          etaPrediction: true,
        },
      });
    });

    const orderWithTableLabel = withTableLabel(updatedOrder);
    // STEP 2: Immediately emit to all realtime layers (kitchen gets order right away)
    emitToUser(orderWithTableLabel.userId, 'order:update', orderWithTableLabel);
    emitToVendor('order:update', orderWithTableLabel);
    emitToAdmin('order:update', orderWithTableLabel);

    if (approve) {
      emitToKitchen('order:new', orderWithTableLabel);
    }

    // STEP 3: Run heavy inventory deduction + email + audit asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        if (approve && previousStatus !== 'PAID') {
          await deductInventoryForConfirmedOrder(order.id, staffUserId, null);
        } else if (!approve && previousStatus !== 'PAYMENT_FAILED') {
          await restoreInventoryForOrder(order.id, staffUserId, reason || 'Payment verification rejected by staff.', null);
        }
      } catch (invErr) {
        console.error('[InventoryDeduction] Background deduction error:', invErr.message);
      }

      if (approve) {
        sendPaymentConfirmedEmail(orderWithTableLabel).catch((err) =>
          console.error('[Email] Payment confirmed email error:', err.message)
        );
      } else {
        sendOrderCancellationEmail(orderWithTableLabel, 'PAYMENT_FAILED').catch((err) =>
          console.error('[Email] Payment failed email error:', err.message)
        );
      }

      logAudit({
        userId: staffUserId,
        action: approve ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
        entity: 'Order',
        entityId: order.id,
        oldValue: { status: previousStatus, paymentStatus: order.paymentStatus },
        newValue: { status: newStatus, paymentStatus: newPaymentStatus },
      }).catch(err => console.error('[Audit Log Error]', err));
    });

    clearDashboardStatsCache();

    return res.json({
      message: approve ? 'Payment verified and order sent to kitchen.' : 'Payment rejected.',
      order: orderWithTableLabel,
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return res.status(500).json({ error: 'Failed to verify transaction.' });
  }
};

module.exports = {
  getPaymentSettings,
  updatePaymentSettings,
  submitTransactionId,
  verifyTransaction,
};
