const { prisma } = require('../config/db');
const { emitToVendor, emitToUser, emitToKitchen, emitToAdmin, broadcastEvent } = require('../sockets/socket');
const { sendPaymentConfirmedEmail, sendOrderCancellationEmail } = require('../services/emailService');
const { logAudit } = require('../middleware/auditMiddleware');
const { deductInventoryForConfirmedOrder, restoreInventoryForOrder } = require('../services/inventoryDeductionService');
const { clearDashboardStatsCache } = require('./adminController');
const { withTableLabel } = require('../utils/tableLabel');
const { withDeadlockRetry, TX_OPTIONS } = require('../utils/dbRetry');

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

    let updatedOrder;
    try {
      updatedOrder = await withDeadlockRetry(async () => {
        return await prisma.$transaction(async (tx) => {
          // Conditional atomic update
          const updateResult = await tx.order.updateMany({
            where: { id: order.id, status: previousStatus },
            data: {
              paymentStatus: newPaymentStatus,
              status: newStatus,
            },
          });

          if (updateResult.count === 0) {
            // Concurrently updated by another process
            const conflictErr = new Error('Order status has already been processed by another request.');
            conflictErr.isConflict = true;
            throw conflictErr;
          }

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

          // In-transaction inventory deduction / restoration (Option A)
          // If deduction fails, entire transaction rolls back and order is NOT marked PAID
          if (approve && previousStatus !== 'PAID') {
            await deductInventoryForConfirmedOrder(order.id, staffUserId, tx);
          } else if (!approve && previousStatus !== 'PAYMENT_FAILED') {
            await restoreInventoryForOrder(order.id, staffUserId, reason || 'Payment verification rejected by staff.', tx);
          }

          return await tx.order.findUnique({
            where: { id: order.id },
            include: {
              table: { select: { id: true, tableNumber: true } },
              orderItems: { include: { menuItem: true } },
              user: { select: { id: true, name: true, email: true } },
              etaPrediction: true,
            },
          });
        }, TX_OPTIONS);
      });
    } catch (txErr) {
      if (txErr.isConflict) {
        // Fetch current order state to return consistent shape
        const currentOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: {
            table: { select: { id: true, tableNumber: true } },
            orderItems: { include: { menuItem: true } },
            user: { select: { id: true, name: true, email: true } },
            etaPrediction: true,
          },
        });
        return res.json({
          message: 'Payment already processed by another request.',
          order: withTableLabel(currentOrder || order),
        });
      }
      throw txErr;
    }

    const orderWithTableLabel = withTableLabel(updatedOrder);

    // STEP 2: Emit to realtime layers strictly AFTER transaction commit
    emitToUser(orderWithTableLabel.userId, 'order:update', orderWithTableLabel);
    emitToVendor('order:update', orderWithTableLabel);
    emitToAdmin('order:update', orderWithTableLabel);

    if (approve) {
      emitToKitchen('order:new', orderWithTableLabel);
    }

    // STEP 3: Asynchronous non-blocking side effects (emails, audit)
    setImmediate(async () => {
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

/**
 * Initiate PayFast Sandbox payment: returns target URL and signed form parameters
 */
const initiatePayfastPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required to initiate payment.' });
    }

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId, 10) },
      include: {
        table: true,
        user: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (order.status === 'PAID') {
      return res.status(400).json({ error: 'Order is already paid.' });
    }

    const { getPayfastConfig, generateSignature } = require('../services/payfastService');
    const config = getPayfastConfig();

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const backendBase = (process.env.API_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

    // PayFast payment parameters
    const paymentData = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${frontendBase}/customer/order-tracking/${order.orderNumber}?payment=success`,
      cancel_url: `${frontendBase}/customer/cart?payment=cancelled`,
      notify_url: `${backendBase}/api/payments/payfast/notify`,
      name_first: order.user?.name || 'Customer',
      email_address: order.user?.email || 'customer@zovikpos.store',
      m_payment_id: String(order.id),
      amount: Number(order.totalAmount).toFixed(2),
      item_name: `Zovik POS Order #${order.orderNumber}`,
    };

    // Calculate cryptographic signature
    const signature = generateSignature(paymentData, config.passphrase);
    paymentData.signature = signature;

    return res.json({
      processUrl: config.processUrl,
      paymentData,
    });
  } catch (error) {
    console.error('Initiate PayFast error:', error);
    return res.status(500).json({ error: 'Failed to initiate PayFast payment.' });
  }
};

/**
 * Handle PayFast ITN Webhook Notification:
 * Verifies signature, updates order to PAID atomically, deducts inventory, and broadcasts to kitchen
 */
const handlePayfastITN = async (req, res) => {
  try {
    const pfData = req.body || {};
    const { getPayfastConfig, validateSignature } = require('../services/payfastService');
    const config = getPayfastConfig();

    const receivedSignature = pfData.signature;
    const isValid = validateSignature(pfData, receivedSignature, config.passphrase);

    if (!isValid) {
      console.warn('[PayFast ITN] Invalid signature received:', receivedSignature);
      return res.status(400).send('Invalid signature');
    }

    const orderId = parseInt(pfData.m_payment_id, 10);
    const paymentStatus = pfData.payment_status; // 'COMPLETE'
    const pfPaymentId = pfData.pf_payment_id;

    if (!orderId) {
      return res.status(400).send('Missing order reference');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        etaPrediction: true,
      },
    });

    if (!order) {
      return res.status(404).send('Order not found');
    }

    // Idempotency: if already paid, acknowledge safely
    if (order.status === 'PAID') {
      return res.status(200).send('OK');
    }

    if (paymentStatus === 'COMPLETE') {
      const updatedOrder = await withDeadlockRetry(async () => {
        return await prisma.$transaction(async (tx) => {
          const updateResult = await tx.order.updateMany({
            where: { id: order.id, status: { not: 'PAID' } },
            data: {
              status: 'PAID',
              paymentStatus: 'VERIFIED',
              paymentTxId: pfPaymentId || `PF-${Date.now()}`,
            },
          });

          if (updateResult.count === 0) {
            return order;
          }

          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              previousStatus: order.status,
              newStatus: 'PAID',
              note: `PayFast Instant Sandbox Payment verified (${pfPaymentId || 'N/A'})`,
            },
          });

          // In-transaction atomic stock deduction
          await deductInventoryForConfirmedOrder(order.id, null, tx);

          return await tx.order.findUnique({
            where: { id: order.id },
            include: {
              table: { select: { id: true, tableNumber: true } },
              orderItems: { include: { menuItem: true } },
              user: { select: { id: true, name: true, email: true } },
              etaPrediction: true,
            },
          });
        }, TX_OPTIONS);
      });

      const orderWithTableLabel = withTableLabel(updatedOrder);

      // Realtime notification to kitchen & customer
      emitToUser(orderWithTableLabel.userId, 'order:update', orderWithTableLabel);
      emitToVendor('order:update', orderWithTableLabel);
      emitToAdmin('order:update', orderWithTableLabel);
      emitToKitchen('order:new', orderWithTableLabel);

      setImmediate(async () => {
        sendPaymentConfirmedEmail(orderWithTableLabel).catch(err =>
          console.error('[Email] PayFast payment confirmed email error:', err.message)
        );
      });

      clearDashboardStatsCache();
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('PayFast ITN Error:', error);
    return res.status(500).send('Server error');
  }
};

module.exports = {
  getPaymentSettings,
  updatePaymentSettings,
  submitTransactionId,
  verifyTransaction,
  initiatePayfastPayment,
  handlePayfastITN,
};
