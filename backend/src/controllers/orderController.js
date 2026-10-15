const { prisma } = require('../config/db');
const { emitToVendor, emitToKitchen, emitToUser, emitToAdmin } = require('../sockets/socket');
const { convertUnit } = require('../utils/unitConverter');
const {
  sendOrderPlacementEmail,
  sendOrderCompletionEmail,
  sendOrderReadyEmail,
  sendOrderCancellationEmail,
  sendPaymentConfirmedEmail,
} = require('../services/emailService');
const { calculateETA } = require('../services/etaService');
const { generateOrderTrackingToken, verifyTableToken } = require('../services/qrSecurityService');
const { logAudit } = require('../middleware/auditMiddleware');

const { deductInventoryForConfirmedOrder, restoreInventoryForOrder } = require('../services/inventoryDeductionService');

/**
 * Generate human-friendly unique order number (e.g. ORD-2026-8941)
 */
const generateOrderNumber = () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${year}-${randomSuffix}`;
};

/**
 * Place a new order with immutable snapshots, server pricing recalculation, and stock reservation
 */
const createOrder = async (req, res) => {
  const {
    items,
    tableId,
    sessionId,
    paymentMethod = 'COD',
    paymentStatus = 'UNPAID',
    paymentTxId,
    customerEmail,
    emailVerified,
  } = req.body;

  const userId = req.user.id;
  const requestedMethod = String(paymentMethod || 'COD').trim().toUpperCase();
  const canonicalPaymentMethod = {
    COD: 'COD',
    EASYPAISA: 'Easypaisa',
    JAZZCASH: 'JazzCash',
  }[requestedMethod];

  if (!canonicalPaymentMethod) {
    return res.status(400).json({ error: 'Supported payment methods are COD, Easypaisa, and JazzCash.' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one menu item.' });
  }

  try {
    // Verify database payment method availability settings
    let settings = await prisma.paymentSetting.findFirst();
    if (!settings) {
      settings = await prisma.paymentSetting.create({
        data: { codEnabled: true, onlineEnabled: true },
      });
    }

    const isOnlineMethod = requestedMethod !== 'COD';

    if (!settings.codEnabled && !settings.onlineEnabled) {
      return res.status(400).json({ error: "Sorry, we're not accepting orders at the moment. The kitchen is currently closed. Please try again later." });
    }

    if (!isOnlineMethod && !settings.codEnabled) {
      return res.status(400).json({ error: "Sorry, Pay at Counter is currently unavailable. Please choose Online Payment to continue." });
    }

    if (isOnlineMethod && !settings.onlineEnabled) {
      return res.status(400).json({ error: "Sorry, Online Payment is currently unavailable. Please choose Pay at Counter to continue." });
    }

    let resolvedSessionId = null;
    let resolvedTableId = null;
    let resolvedTableNumber = 'Takeaway';
    let resolvedBranchId = null;

    // Verify dining session and physical table with auto-healing fallback
    let existingSession = null;
    if (sessionId) {
      existingSession = await prisma.session.findUnique({
        where: { id: sessionId },
        include: { table: true },
      });
    }

    if (existingSession && existingSession.status === 'ACTIVE') {
      resolvedSessionId = existingSession.id;
      resolvedTableId = existingSession.tableId;
      resolvedTableNumber = existingSession.table?.tableNumber || `Table ${existingSession.tableId}`;
      resolvedBranchId = existingSession.table?.branchId || null;
    } else {
      // Session missing or inactive -> resolve physical table and create/obtain active session
      const targetTableSearch = tableId || (existingSession?.tableId ? String(existingSession.tableId) : 'Table 4');
      const table = await prisma.table.findFirst({
        where: {
          OR: [
            { id: parseInt(targetTableSearch, 10) || -1 },
            { tableNumber: String(targetTableSearch) },
            { tableNumber: `Table ${String(targetTableSearch).replace(/[^0-9]/g, '')}` },
          ],
        },
        include: { branch: true },
      });

      if (table) {
        if (!table.isActive) {
          return res.status(403).json({ error: `Table ${table.tableNumber} is currently inactive.` });
        }
        resolvedTableId = table.id;
        resolvedTableNumber = table.tableNumber;
        resolvedBranchId = table.branchId || 1;

        let activeSession = await prisma.session.findFirst({
          where: {
            tableId: table.id,
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
        });

        if (!activeSession) {
          const crypto = require('crypto');
          activeSession = await prisma.session.create({
            data: {
              id: crypto.randomUUID(),
              tableId: table.id,
              customerId: userId || null,
              status: 'ACTIVE',
              expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
              cart: { create: {} },
            },
          });
        }
        resolvedSessionId = activeSession.id;
      }
    }

    // AI ETA Prediction calculation (performed before DB transaction to prevent holding locks during HTTP calls)
    let etaResult = { baseEta: 5.0, adjustedEta: 5.0, queueLength: 0, kitchenLoad: 'Low', isPeakHour: false, historicalDelay: 0.0 };
    try {
      etaResult = await calculateETA(items);
    } catch (etaErr) {
      console.warn('AI ETA calculation warning:', etaErr.message);
    }

    // Run DB transaction for atomic order creation
    const order = await prisma.$transaction(async (tx) => {
      let subtotal = 0.0;
      const orderItemsData = [];

      for (const item of items) {
        const menuItem = await tx.menuItem.findUnique({
          where: { id: parseInt(item.menuItemId, 10) },
          include: {
            recipeItems: {
              include: { inventoryItem: true }
            }
          }
        });

        if (!menuItem || !menuItem.isActive) {
          throw new Error(`Menu item with ID ${item.menuItemId} is not available.`);
        }

        const qty = parseInt(item.quantity, 10) || 1;

        // Stock check: If recipe exists, verify ingredient stock levels
        if (menuItem.recipeItems && menuItem.recipeItems.length > 0) {
          for (const recipe of menuItem.recipeItems) {
            const invItem = recipe.inventoryItem;
            if (!invItem) continue;
            const rawNeeded = recipe.quantity * qty;
            let neededInInvUnit = rawNeeded;
            try {
              neededInInvUnit = convertUnit(rawNeeded, recipe.unit, invItem.unit);
            } catch (convErr) {
              neededInInvUnit = rawNeeded;
            }
            if (invItem.stockLevel < neededInInvUnit) {
              throw new Error(`Insufficient inventory for "${invItem.name}". Needed: ${neededInInvUnit} ${invItem.unit}, Available: ${invItem.stockLevel} ${invItem.unit}.`);
            }
          }
        } else if (menuItem.stock > 0 && menuItem.stock < qty) {
          throw new Error(`Insufficient stock for "${menuItem.name}". Only ${menuItem.stock} available.`);
        }

        const itemSubtotal = menuItem.price * qty;
        subtotal += itemSubtotal;

        orderItemsData.push({
          menuItemId: menuItem.id,
          nameSnapshot: menuItem.name,
          priceSnapshot: menuItem.price,
          quantity: qty,
          subtotal: itemSubtotal,
        });
      }

      const tax = 0.0;
      const discount = 0.0;
      const total = subtotal + tax - discount;

      const orderNumber = generateOrderNumber();
      const initialStatus = requestedMethod === 'COD' ? 'PENDING' : (paymentStatus === 'PENDING_VERIFICATION' ? 'PAYMENT_PENDING' : 'PENDING');

      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          sessionId: resolvedSessionId,
          tableId: resolvedTableId,
          tableNumber: resolvedTableNumber,
          branchId: resolvedBranchId,
          customerEmail: customerEmail || req.user.email,
          trackingToken: null,
          status: initialStatus,
          subtotal,
          tax,
          discount,
          total,
          paymentStatus: paymentStatus || (requestedMethod === 'COD' ? 'UNPAID' : 'PENDING_VERIFICATION'),
          paymentMethod: canonicalPaymentMethod,
          paymentTxId: paymentTxId || null,
          userId,
          orderItems: {
            create: orderItemsData,
          },
        },
      });

      // Deduct inventory only if order status is initialized directly to PAID
      if (initialStatus === 'PAID') {
        await deductInventoryForConfirmedOrder(newOrder.id, userId, tx);
      }

      // Generate cryptographically signed dynamic tracking token
      const trackingToken = generateOrderTrackingToken(newOrder.id, newOrder.orderNumber);
      const updatedWithTracking = await tx.order.update({
        where: { id: newOrder.id },
        data: { trackingToken },
        include: {
          orderItems: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Save initial OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          previousStatus: null,
          newStatus: initialStatus,
          changedByUserId: userId,
          note: `Order placed via ${canonicalPaymentMethod}`,
        },
      });

      // Save ETAPrediction
      const etaSaved = await tx.eTAPrediction.create({
        data: {
          orderId: newOrder.id,
          baseEta: etaResult.baseEta,
          adjustedEta: etaResult.adjustedEta,
          queueLength: etaResult.queueLength,
          kitchenLoad: etaResult.kitchenLoad,
          peakHour: etaResult.isPeakHour,
          historicalDelay: etaResult.historicalDelay,
        },
      });

      // Clear server-side cart for this session if applicable
      if (sessionId) {
        const cart = await tx.cart.findUnique({ where: { sessionId } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
      }

      return {
        ...updatedWithTracking,
        etaPrediction: etaSaved,
      };
    }, { maxWait: 15000, timeout: 30000 });

    // Realtime Socket.IO broadcasts
    emitToUser(userId, 'order:update', order);
    emitToVendor('order:new', order);
    emitToAdmin('order:new', order);
    if (order.status === 'PAID') {
      emitToKitchen('order:new', order);
    }

    // Send confirmation email asynchronously with dynamic tracking QR
    sendOrderPlacementEmail(order).catch(err => console.error('[Email] Placement email error:', err.message));

    return res.status(201).json({
      message: 'Order placed successfully.',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error.message);
    return res.status(400).json({ error: error.message || 'Failed to place order.' });
  }
};

/**
 * Update order status with strict role transition permissions and stock restoration on cancellation
 */
const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const userRole = (req.user.role || '').toUpperCase();
  const userId = req.user.id;

  const validStatuses = [
    'PENDING',
    'PAYMENT_PENDING',
    'PAID',
    'PREPARING',
    'READY',
    'COMPLETED',
    'CANCELLED',
    'PAYMENT_FAILED',
    'REFUNDED',
  ];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status value.' });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        orderItems: { include: { menuItem: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const previousStatus = order.status;

    // Idempotent check: If order is ALREADY in the target status, return success
    if (status === previousStatus) {
      return res.json({
        message: `Order is already in ${status} status.`,
        order,
      });
    }

    // Strict Role-based Transition Permissions
    if (userRole === 'KITCHEN') {
      // Kitchen can only mark PREPARING or READY
      if (!['PREPARING', 'READY'].includes(status)) {
        return res.status(403).json({ error: 'Kitchen staff can only advance orders to PREPARING or READY.' });
      }
      if (status === 'PREPARING' && !['PAID', 'PENDING'].includes(previousStatus)) {
        return res.status(400).json({ error: `Cannot prepare order from current status "${previousStatus}".` });
      }
    } else if (userRole === 'VENDOR') {
      // Cashier/Vendor handles payment verification, completion/handoff, or cancellation
      if (status === 'PREPARING') {
        return res.status(403).json({ error: 'Only Kitchen staff can advance orders to PREPARING.' });
      }
    } else if (userRole === 'CUSTOMER') {
      if (order.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized to update this order.' });
      }
      if (status !== 'CANCELLED') {
        return res.status(403).json({ error: 'Customers can only cancel unconfirmed or failed orders.' });
      }
      if (!['PENDING', 'PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(previousStatus)) {
        return res.status(400).json({ error: `Cannot cancel order while it is ${previousStatus}. Please contact staff.` });
      }
    }
    // ADMIN has universal permission

    // STEP 1: Fast minimal transaction — only order update + status history (no heavy inventory)
    const needsInventoryDeduction = status === 'PAID' && previousStatus !== 'PAID';
    const needsInventoryRestore = ['CANCELLED', 'REFUNDED', 'PAYMENT_FAILED'].includes(status) && !['CANCELLED', 'REFUNDED', 'PAYMENT_FAILED'].includes(previousStatus);

    const updatePayload = { status };
    if (status === 'COMPLETED') updatePayload.completedAt = new Date();
    if (status === 'PAID') updatePayload.paymentStatus = 'PAID';

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: updatePayload,
        include: {
          orderItems: { include: { menuItem: true } },
          user: { select: { id: true, name: true, email: true } },
          payment: true,
          etaPrediction: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          previousStatus,
          newStatus: status,
          changedByUserId: userId,
          note: note || `Status updated by ${userRole}`,
        },
      });

      return updated;
    });

    // STEP 2: Background — inventory, ETA, emails, audit (non-blocking)
    setImmediate(async () => {
      try {
        if (needsInventoryDeduction) {
          await deductInventoryForConfirmedOrder(order.id, userId, null);
        } else if (needsInventoryRestore) {
          await restoreInventoryForOrder(order.id, userId, note || `Order status updated to ${status}`, null);
        }
      } catch (invErr) {
        console.error('[InventoryDeduction] Background error:', invErr.message);
      }

      if (['READY', 'COMPLETED'].includes(status)) {
        try {
          const actualMinutes = (new Date() - new Date(order.createdAt)) / 60000;
          await prisma.eTAPrediction.updateMany({
            where: { orderId: order.id },
            data: { actualTime: parseFloat(actualMinutes.toFixed(2)) },
          });
        } catch (etaErr) {
          console.warn('[ETA] Background actualTime update warning:', etaErr.message);
        }
      }
    });

    // STEP 3: Broadcast Realtime Socket Events immediately
    emitToUser(updatedOrder.userId, 'order:update', updatedOrder);
    emitToVendor('order:update', updatedOrder);
    emitToAdmin('order:update', updatedOrder);

    if (status === 'PAID') {
      emitToKitchen('order:new', updatedOrder);
      sendPaymentConfirmedEmail(updatedOrder).catch(err => console.error('[Email] Payment email error:', err.message));
    } else {
      emitToKitchen('order:update', updatedOrder);
    }

    if (status === 'READY') {
      sendOrderReadyEmail(updatedOrder).catch(err => console.error('[Email] Ready email error:', err.message));
    } else if (status === 'COMPLETED') {
      sendOrderCompletionEmail(updatedOrder).catch(err => console.error('[Email] Completion email error:', err.message));
    } else if (['CANCELLED', 'REFUNDED', 'PAYMENT_FAILED'].includes(status)) {
      sendOrderCancellationEmail(updatedOrder, status).catch(err => console.error('[Email] Cancel email error:', err.message));
    }

    logAudit({
      userId,
      action: 'ORDER_STATUS_UPDATED',
      entity: 'Order',
      entityId: order.id,
      oldValue: { status: previousStatus },
      newValue: { status },
      req,
    }).catch(err => console.error('[Audit Log Error]', err));

    return res.json({
      message: `Order status updated to ${status}.`,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return res.status(500).json({ error: 'Failed to update order status.' });
  }
};

/**
 * Get all orders with role-filtered scope
 */
const getAllOrders = async (req, res) => {
  const { status, sessionId } = req.query;
  const userRole = (req.user.role || '').toUpperCase();
  const userId = req.user.id;

  try {
    const whereClause = {};

    // Customer sees orders belonging to their active dining session OR their customer user ID
    if (userRole === 'CUSTOMER') {
      const headerSessionId = req.headers['x-session-id'];
      const effectiveSessionId = sessionId || headerSessionId;

      if (effectiveSessionId && userId) {
        whereClause.OR = [
          { sessionId: effectiveSessionId },
          { userId: userId },
        ];
      } else if (effectiveSessionId) {
        whereClause.sessionId = effectiveSessionId;
      } else {
        whereClause.userId = userId;
      }
    }

    if (status) {
      whereClause.status = status;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        payment: true,
        etaPrediction: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    return res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
};

/**
 * Get single order by ID
 */
const getOrderById = async (req, res) => {
  const { id } = req.params;
  const userRole = (req.user.role || '').toUpperCase();
  const userId = req.user.id;

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        orderItems: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
        payment: true,
        etaPrediction: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (userRole === 'CUSTOMER' && order.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to this order.' });
    }

    return res.json({ order });
  } catch (error) {
    console.error('Get order by ID error:', error);
    return res.status(500).json({ error: 'Failed to retrieve order.' });
  }
};

/**
 * Public dynamic order tracking by secure signed tracking token
 */
const getOrderByTrackingToken = async (req, res) => {
  const { token } = req.params;

  try {
    const order = await prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        orderItems: { include: { menuItem: true } },
        etaPrediction: true,
        payment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order tracking record not found.' });
    }

    return res.json({ order });
  } catch (error) {
    console.error('Tracking error:', error);
    return res.status(500).json({ error: 'Failed to retrieve tracking info.' });
  }
};

/**
 * Transfer delivery table for a specific individual order
 */
const transferSingleOrderTable = async (req, res) => {
  const { id } = req.params;
  const { targetTableNumber, qrToken } = req.body;
  const userId = req.user.id;
  const userRole = (req.user.role || '').toUpperCase();

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: { orderItems: { include: { menuItem: true } } },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (userRole === 'CUSTOMER' && order.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to transfer this order.' });
    }

    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot transfer order that is already ${order.status}.` });
    }

    // Resolve target table
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
        });
      }
    }

    if (!targetTable && targetTableNumber) {
      const cleanNumber = String(targetTableNumber).toLowerCase().startsWith('table')
        ? String(targetTableNumber)
        : `Table ${targetTableNumber}`;
      targetTable = await prisma.table.findFirst({
        where: { tableNumber: cleanNumber },
      });
    }

    if (!targetTable) {
      return res.status(404).json({ error: 'Target dining table not found.' });
    }

    if (!targetTable.isActive) {
      return res.status(403).json({ error: `${targetTable.tableNumber} is currently deactivated.` });
    }

    const oldTableDisplay = order.tableNumber || (order.tableId ? `Table ${order.tableId}` : 'Takeaway');
    const newTableDisplay = targetTable.tableNumber;

    const isUrgentReroute = order.status === 'READY';
    const noteText = isUrgentReroute
      ? `🚨 URGENT REROUTE: Order is READY! Deliver to ${newTableDisplay} instead of ${oldTableDisplay}`
      : `Table transfer: Changed from ${oldTableDisplay} to ${newTableDisplay}`;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
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

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        previousStatus: order.status,
        newStatus: order.status,
        changedByUserId: userId,
        note: noteText,
      },
    });

    // Realtime notifications
    emitToKitchen('order:update', updatedOrder);
    emitToVendor('order:update', updatedOrder);
    emitToAdmin('order:update', updatedOrder);
    emitToUser(updatedOrder.userId, 'order:update', updatedOrder);

    emitToKitchen('table:shift', {
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.orderNumber,
      oldTable: oldTableDisplay,
      newTable: newTableDisplay,
      isUrgent: isUrgentReroute,
    });

    return res.json({
      message: `Order #${updatedOrder.orderNumber} successfully transferred to ${newTableDisplay}.`,
      order: updatedOrder,
      oldTable: oldTableDisplay,
      newTable: newTableDisplay,
    });
  } catch (error) {
    console.error('Transfer single order table error:', error);
    return res.status(500).json({ error: 'Failed to transfer order table.' });
  }
};

/** Permanently delete an order and its directly linked records. */
const deleteOrder = async (req, res) => {
  const { id } = req.params;
  const staffUserId = req.user?.id;

  try {
    const orderId = parseInt(id, 10);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, orderItems: true, statusHistory: true }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Remove dependent database records in one transaction; the audit event is retained separately.
    await prisma.$transaction(async (tx) => {
      // 1. Delete dependent relations with onDelete cascade or manual cleanup
      await tx.orderStatusHistory.deleteMany({ where: { orderId } });
      await tx.eTAPrediction.deleteMany({ where: { orderId } });
      if (order.payment) {
        await tx.payment.deleteMany({ where: { orderId } });
      }
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.delete({ where: { id: orderId } });
    });

    await logAudit({
      userId: staffUserId,
      action: 'ORDER_DELETED',
      entity: 'Order',
      entityId: String(orderId),
      oldValue: { orderNumber: order.orderNumber, total: order.total, status: order.status },
      req
    });

    emitToAdmin('order:update', { orderDeletedId: orderId });
    emitToVendor('order:update', { orderDeletedId: orderId });
    emitToKitchen('order:update', { orderDeletedId: orderId });

    return res.json({ message: `Order #${order.orderNumber} deleted successfully.` });
  } catch (error) {
    console.error('Delete order error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete order.' });
  }
};

/** Bulk delete selected orders, or use the existing status-scoped cleanup action. */
const bulkDeleteOrders = async (req, res) => {
  const { scope = 'CANCELLED', branchId, ids } = req.body;
  const staffUserId = req.user?.id;

  try {
    const where = {};

    if (Array.isArray(ids) && ids.length > 0) {
      const numericIds = ids.map(i => parseInt(i, 10)).filter(i => !isNaN(i));
      where.id = { in: numericIds };
    } else {
      if (scope === 'CANCELLED') {
        where.status = 'CANCELLED';
      } else if (scope === 'PAYMENT_FAILED') {
        where.status = { in: ['PAYMENT_FAILED', 'CANCELLED'] };
      } else if (scope === 'UNPAID_PENDING') {
        where.status = 'PENDING';
        where.paymentStatus = 'UNPAID';
      } else {
        return res.status(400).json({
          error: 'Invalid bulk delete scope. Use a valid status scope or select order IDs to delete.'
        });
      }
    }

    if (branchId && branchId !== 'all') {
      where.branchId = parseInt(branchId, 10);
    }

    const eligibleOrders = await prisma.order.findMany({
      where,
      select: { id: true, orderNumber: true }
    });

    if (eligibleOrders.length === 0) {
      return res.json({ message: 'No eligible orders found matching the deletion scope.', count: 0 });
    }

    const orderIds = eligibleOrders.map(o => o.id);

    await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.eTAPrediction.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    });

    await logAudit({
      userId: staffUserId,
      action: 'BULK_ORDERS_DELETED',
      entity: 'Order',
      entityId: `bulk_${orderIds.length}`,
      oldValue: { scope, count: orderIds.length, orderIds },
      req
    });

    emitToAdmin('order:update', { bulkDeletedOrderIds: orderIds });
    emitToVendor('order:update', { bulkDeletedOrderIds: orderIds });

    return res.json({
      message: `Successfully deleted ${orderIds.length} orders within "${scope}" scope.`,
      count: orderIds.length
    });
  } catch (error) {
    console.error('Bulk delete orders error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete orders.' });
  }
};

module.exports = {
  createOrder,
  updateOrderStatus,
  getAllOrders,
  getOrderById,
  getOrderByTrackingToken,
  transferSingleOrderTable,
  deleteOrder,
  bulkDeleteOrders,
};
