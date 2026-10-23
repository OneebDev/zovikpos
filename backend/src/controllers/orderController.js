const { prisma } = require('../config/db');
const { Prisma } = require('@prisma/client');
const crypto = require('crypto');
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
const { clearDashboardStatsCache } = require('./adminController');
const { validateStudentEmail } = require('./authController');
const { COUNTER_TABLE_LABEL, formatTableLabel, withTableLabel, isPhysicalTable } = require('../utils/tableLabel');
const { isValid, OrderStatus } = require('../utils/statusValues');
const { roundMoney } = require('../utils/money');
const { isSessionIdleExpired, touchSessionActivity } = require('../utils/sessionActivity');
const { withDeadlockRetry, TX_OPTIONS } = require('../utils/dbRetry');

// Statuses that count as an 'open' order for the per-session cap.
// Exclude terminal statuses: COMPLETED, CANCELLED, PAYMENT_FAILED, REFUNDED.
const TERMINAL_ORDER_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'REFUNDED']);
const OPEN_ORDER_STATUSES = OrderStatus.filter((status) => !TERMINAL_ORDER_STATUSES.has(status));

const ORDER_MAX_ITEMS = () => Number(process.env.ORDER_MAX_ITEMS) || 30;
const ORDER_MAX_QTY = () => Number(process.env.ORDER_MAX_QTY) || 50;
const ORDER_MAX_OPEN_PER_SESSION = () => Number(process.env.ORDER_MAX_OPEN_PER_SESSION) || 5;

/**
 * Generate human-friendly unique order number (e.g. ORD-2026-8941)
 */
const generateOrderNumber = () => {
  const year = new Date().getFullYear();
  const randomSuffix = crypto.randomInt(100000, 1000000);
  return `ORD-${year}-${randomSuffix}`;
};

/**
 * Place a new order with immutable snapshots, server pricing recalculation, and stock reservation
 */
const createOrder = async (req, res) => {
  const {
    items,
    sessionId,
    paymentMethod = 'COD',
    paymentStatus = 'UNPAID',
    paymentTxId,
    customerEmail,
  } = req.body;

  const userId = req.user.id;
  const userRole = (req.user.role || '').toUpperCase();

  if (paymentStatus != null && !isValid('OrderPaymentStatus', paymentStatus)) {
    return res.status(400).json({ error: 'Invalid order payment status value.' });
  }

  if (userRole === 'CUSTOMER') {
    const customerUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!customerUser || customerUser.isActive === false) {
      return res.status(403).json({ error: 'Your student account has been blocked or deactivated. Please contact campus admin.' });
    }
    const emailToValidate = customerEmail || customerUser.email;
    if (!validateStudentEmail(emailToValidate)) {
      return res.status(400).json({ error: 'Please use a valid UIT student email address (<roll_number>@students.uitu.edu.pk).' });
    }
  }

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

  // --- ORDER SIZE CAPS (env: ORDER_MAX_ITEMS, ORDER_MAX_QTY) ---
  const maxItems = ORDER_MAX_ITEMS();
  const maxQty = ORDER_MAX_QTY();

  if (items.length > maxItems) {
    return res.status(400).json({
      error: `An order cannot contain more than ${maxItems} distinct items.`,
      code: 'ORDER_TOO_LARGE',
    });
  }

  for (const item of items) {
    const rawQty = item.quantity != null ? Number(item.quantity) : 1;
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > maxQty) {
      return res.status(400).json({
        error: `Item quantity must be a whole number between 1 and ${maxQty}.`,
        code: 'INVALID_QUANTITY',
      });
    }
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

    if (!sessionId || typeof sessionId !== 'string') {
      console.warn('[OrderTable] Rejected order without a session ID.', { userId });
      if (userRole === 'CUSTOMER') {
        return res.status(403).json({ error: 'Scan the QR code attached to your table before placing an order.', message: 'Scan the QR code attached to your table before placing an order.', code: 'TABLE_SESSION_REQUIRED' });
      }
      return res.status(400).json({ error: 'Your dining session is missing. Please refresh the menu and try again.' });
    }

    const existingSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        table: { include: { branch: true } },
        cart: { select: { items: { select: { id: true } } } },
        orders: { select: { id: true, status: true } },
      },
    });

    if (!existingSession || existingSession.status !== 'ACTIVE') {
      if (userRole === 'CUSTOMER') {
        return res.status(403).json({ error: 'Your table session has expired. Scan the table QR code again.', message: 'Your table session has expired. Scan the table QR code again.', code: 'TABLE_SESSION_REQUIRED' });
      }
      return res.status(400).json({ error: 'Your dining session has expired. Please scan your table QR again.' });
    }

    // Rule F4: If session ended while sitting on cart page, return TABLE_SESSION_REQUIRED
    const cartItemCount = existingSession.cart?.items?.length || 0;
    if (isSessionIdleExpired(existingSession, cartItemCount, existingSession.orders)) {
      await prisma.session.update({ where: { id: sessionId }, data: { status: 'EXPIRED' } })
        .catch((e) => console.error('[Session] Best-effort expire/cleanup error:', e.message));
      if (cartItemCount > 0) {
        await prisma.cartItem.deleteMany({ where: { cart: { sessionId } } })
          .catch((e) => console.error('[Session] Best-effort expire/cleanup error:', e.message));
      }
      return res.status(403).json({
        error: 'Your table session has expired due to inactivity. Scan your table QR code again.',
        message: 'Your table session has expired due to inactivity. Scan your table QR code again.',
        code: 'TABLE_SESSION_REQUIRED',
      });
    }

    if (req.user.role === 'CUSTOMER' && existingSession.customerId && existingSession.customerId !== userId) {
      return res.status(403).json({ error: 'This dining session belongs to another customer.' });
    }
    // Throttled touch: placing an order is explicit activity
    touchSessionActivity(sessionId, existingSession.lastActivityAt).catch(() => {});

    // --- OPEN ORDER CAP (env: ORDER_MAX_OPEN_PER_SESSION, default 5) ---
    // Counts unfinished orders tied to this session. Applied ONLY to CUSTOMER role;
    // Cashier/Admin/Vendor counter orders must not be capped by it.
    // Idempotent replays never reach this point because idempotencyMiddleware returns cached response first.
    if (userRole === 'CUSTOMER') {
      const maxOpen = ORDER_MAX_OPEN_PER_SESSION();
      const openOrderCount = await prisma.order.count({
        where: {
          sessionId,
          status: { in: OPEN_ORDER_STATUSES },
        },
      });
      if (openOrderCount >= maxOpen) {
        return res.status(429).json({
          error: `This table already has ${openOrderCount} open orders. Please wait for them to be completed before placing a new one.`,
          code: 'TOO_MANY_OPEN_ORDERS',
        });
      }
    }

    if (userRole === 'CUSTOMER' && (!existingSession.tableId || !isPhysicalTable(existingSession.table))) {
      console.warn('[OrderTable] Rejected customer order without an active physical table session.', { userId, sessionId });
      return res.status(403).json({
        error: 'Scan the QR code attached to your table before placing an order.',
        message: 'Scan the QR code attached to your table before placing an order.',
        code: 'TABLE_SESSION_REQUIRED',
      });
    }

    if (existingSession.tableId && (!existingSession.table || !existingSession.table.isActive)) {
      console.warn('[OrderTable] Rejected order whose session references an unavailable table.', { sessionId });
      return res.status(403).json({
        error: 'The table linked to this session is unavailable. Please scan its QR again.',
        code: 'TABLE_SESSION_REQUIRED',
      });
    }

    // Keep legacy staff counter orders readable/usable while customer orders are
    // blocked above unless the session points to a signed physical QR table.
    const hasExplicitCounterSession = /^(counter|takeaway|takeout|takeaway \/ counter|dining table)$/i
      .test(String(existingSession.tableLabel || '').trim());
    if (!existingSession.tableId && !hasExplicitCounterSession) {
      console.warn('[OrderTable] Rejected order whose session has no valid table or counter label.', { sessionId });
      return res.status(403).json({
        error: 'Your dining session has no valid table. Please restart your session.',
        code: 'TABLE_SESSION_REQUIRED',
      });
    }

    const resolvedSessionId = existingSession.id;
    const resolvedTableId = existingSession.tableId || null;
    const resolvedTableLabel = formatTableLabel(existingSession);
    const resolvedTableNumber = existingSession.table?.tableNumber || COUNTER_TABLE_LABEL;
    const resolvedBranchId = existingSession.table?.branchId || null;

    // AI ETA Prediction calculation (performed before DB transaction to prevent holding locks during HTTP calls)
    let etaResult = { baseEta: 5.0, adjustedEta: 5.0, queueLength: 0, kitchenLoad: 'Low', isPeakHour: false, historicalDelay: 0.0 };
    try {
      etaResult = await calculateETA(items);
    } catch (etaErr) {
      console.warn('AI ETA calculation warning:', etaErr.message);
    }

    // Merge duplicate incoming items
    const mergedItemsMap = new Map();
    for (const it of items) {
      const mId = parseInt(it.menuItemId, 10);
      const q = parseInt(it.quantity, 10) || 1;
      mergedItemsMap.set(mId, (mergedItemsMap.get(mId) || 0) + q);
    }
    const distinctItemIds = Array.from(mergedItemsMap.keys());

    // Batch-fetch all menu items + recipes in ONE query before locking (eliminate N+1 & deadlocks)
    const fetchedMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: distinctItemIds } },
      include: {
        recipeItems: {
          include: { inventoryItem: true },
        },
      },
    });
    const menuMap = new Map((fetchedMenuItems || []).map((m) => [m.id, m]));

    // Collect all referenced inventory item IDs and sort ascending to lock in strict order
    const invItemIdsToLock = new Set();
    for (const [mId] of mergedItemsMap) {
      const m = menuMap.get(mId);
      if (m?.recipeItems) {
        for (const r of m.recipeItems) {
          if (r.inventoryItemId) invItemIdsToLock.add(r.inventoryItemId);
        }
      }
    }
    const sortedInvIds = Array.from(invItemIdsToLock).sort((a, b) => a - b);

    // Run DB transaction for atomic order creation with deadlock retry
    const order = await withDeadlockRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Lock inventory rows in ascending order if supported/necessary
        if (sortedInvIds.length > 0) {
          await tx.$queryRaw`
            SELECT id FROM "InventoryItem"
            WHERE id IN (${Prisma.join(sortedInvIds)})
            ORDER BY id ASC
            FOR UPDATE;
          `;
        }

        let subtotal = 0.0;
        const orderItemsData = [];

        for (const [mId, qty] of mergedItemsMap) {
          let menuItem = menuMap.get(mId);
          if (!menuItem && tx.menuItem?.findUnique) {
            menuItem = await tx.menuItem.findUnique({
              where: { id: mId },
              include: { recipeItems: { include: { inventoryItem: true } } },
            });
          }
          if (!menuItem || !menuItem.isActive) {
            const err = new Error(`Menu item with ID ${mId} is not available.`);
            err.code = 'ITEM_UNAVAILABLE';
            err.itemName = menuItem?.name || `Item #${mId}`;
            throw err;
          }

          // Stock check: If recipe exists, verify ingredient stock levels
          if (menuItem.recipeItems && menuItem.recipeItems.length > 0) {
            for (const recipe of menuItem.recipeItems) {
              const invItem = recipe.inventoryItem;
              if (!invItem) continue;
              const rawNeeded = recipe.quantity * qty;
              let neededInInvUnit;
              try {
                neededInInvUnit = convertUnit(rawNeeded, recipe.unit, invItem.unit);
              } catch {
                neededInInvUnit = rawNeeded;
              }
              if (invItem.stockLevel < neededInInvUnit) {
                throw new Error(`Insufficient inventory for "${invItem.name}". Needed: ${neededInInvUnit} ${invItem.unit}, Available: ${invItem.stockLevel} ${invItem.unit}.`);
              }
            }
          } else if (menuItem.stock > 0 && menuItem.stock < qty) {
            throw new Error(`Insufficient stock for "${menuItem.name}". Only ${menuItem.stock} available.`);
          }

          const itemSubtotal = roundMoney(menuItem.price * qty);
          subtotal += itemSubtotal;

          orderItemsData.push({
            menuItemId: menuItem.id,
            nameSnapshot: menuItem.name,
            priceSnapshot: menuItem.price,
            quantity: qty,
            subtotal: itemSubtotal,
          });
        }

        subtotal = roundMoney(subtotal);
        const tax = roundMoney(0.0);
        const discount = roundMoney(0.0);
        const total = roundMoney(subtotal + tax - discount);

        const orderNumber = generateOrderNumber();
        const initialStatus = requestedMethod === 'COD' ? 'PENDING' : (paymentStatus === 'PENDING_VERIFICATION' ? 'PAYMENT_PENDING' : 'PENDING');

      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          sessionId: resolvedSessionId,
          tableId: resolvedTableId,
          tableNumber: resolvedTableNumber,
          tableLabel: resolvedTableLabel,
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
          table: { select: { id: true, tableNumber: true } },
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

      return withTableLabel({
        ...updatedWithTracking,
        etaPrediction: etaSaved,
      });
    }, TX_OPTIONS);
  });

    // Realtime Socket.IO broadcasts
    emitToUser(userId, 'order:update', order);
    emitToVendor('order:new', order);
    emitToAdmin('order:new', order);
    if (order.status === 'PAID') {
      emitToKitchen('order:new', order);
    }

    // Send confirmation email asynchronously with dynamic tracking QR
    sendOrderPlacementEmail(order).catch(err => console.error('[Email] Placement email error:', err.message));

    // Invalidate cached admin dashboard stats
    clearDashboardStatsCache();

    return res.status(201).json({
      message: 'Order placed successfully.',
      order,
    });
  } catch (error) {
    console.error('Create order error:', error.message);
    const responsePayload = { error: error.message || 'Failed to place order.' };
    if (error.code) responsePayload.code = error.code;
    if (error.itemName) responsePayload.itemName = error.itemName;
    return res.status(400).json(responsePayload);
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

  if (!isValid('OrderStatus', status)) {
    return res.status(400).json({ error: 'Invalid order status value.' });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (userRole === 'CUSTOMER' && order.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to update this order.' });
    }

    const previousStatus = order.status;

    // Idempotent check: If order is ALREADY in the target status, return success
    if (status === previousStatus) {
      return res.json({
        message: `Order is already in ${status} status.`,
        order: withTableLabel(order),
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

    let updatedOrder;
    try {
      updatedOrder = await withDeadlockRetry(async () => {
        return await prisma.$transaction(async (tx) => {
          const updateResult = await tx.order.updateMany({
            where: { id: order.id, status: previousStatus },
            data: updatePayload,
          });

          if (updateResult.count === 0) {
            // Concurrent status transition won
            const err = new Error('Order status has already been updated by another user or process.');
            err.status = 409;
            err.isConflict = true;
            throw err;
          }

          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              previousStatus,
              newStatus: status,
              changedByUserId: userId,
              note: note || `Status updated by ${userRole}`,
            },
          });

          // In-transaction inventory deduction / restoration (Option A)
          if (needsInventoryDeduction) {
            await deductInventoryForConfirmedOrder(order.id, userId, tx);
          } else if (needsInventoryRestore) {
            await restoreInventoryForOrder(order.id, userId, note || `Order status updated to ${status}`, tx);
          }

          const fresh = await tx.order.findUnique({
            where: { id: order.id },
            include: {
              table: { select: { id: true, tableNumber: true } },
              orderItems: { include: { menuItem: true } },
              user: { select: { id: true, name: true, email: true } },
              payment: true,
              etaPrediction: true,
            },
          });

          return withTableLabel(fresh);
        }, TX_OPTIONS);
      });
    } catch (txErr) {
      if (txErr.isConflict || txErr.status === 409) {
        return res.status(409).json({ error: 'Order status has already been updated by another user or process.' });
      }
      throw txErr;
    }

    // STEP 2: Background — ETA, emails, audit (non-blocking)
    setImmediate(async () => {

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
    const orderWithTableLabel = withTableLabel(updatedOrder);
    emitToUser(orderWithTableLabel.userId, 'order:update', orderWithTableLabel);
    emitToVendor('order:update', orderWithTableLabel);
    emitToAdmin('order:update', orderWithTableLabel);

    if (status === 'PAID') {
      emitToKitchen('order:new', orderWithTableLabel);
      sendPaymentConfirmedEmail(orderWithTableLabel).catch(err => console.error('[Email] Payment email error:', err.message));
    } else {
      emitToKitchen('order:update', orderWithTableLabel);
    }

    if (status === 'READY') {
      sendOrderReadyEmail(orderWithTableLabel).catch(err => console.error('[Email] Ready email error:', err.message));
    } else if (status === 'COMPLETED') {
      sendOrderCompletionEmail(orderWithTableLabel).catch(err => console.error('[Email] Completion email error:', err.message));
    } else if (['CANCELLED', 'REFUNDED', 'PAYMENT_FAILED'].includes(status)) {
      sendOrderCancellationEmail(orderWithTableLabel, status).catch(err => console.error('[Email] Cancel email error:', err.message));
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

    clearDashboardStatsCache();

    return res.json({
      message: `Order status updated to ${status}.`,
      order: orderWithTableLabel,
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
  const { status, sessionId, page: pageParam, pageSize: pageSizeParam, search, paymentMethod, from, toExclusive, branchId, exportAll } = req.query;
  const userRole = (req.user.role || '').toUpperCase();
  const userId = req.user.id;

  try {
    const whereClause = {};
    const paginatedAdminRequest = userRole === 'ADMIN' && (pageParam !== undefined || pageSizeParam !== undefined || exportAll === 'true');

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

    // Admin-only list filters are additive; existing callers keep their original response behavior.
    if (userRole === 'ADMIN') {
      if (branchId && branchId !== 'all') {
        const parsedBranchId = Number(branchId);
        if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
          return res.status(400).json({ error: 'Invalid branchId.' });
        }
        whereClause.branchId = parsedBranchId;
      }

      if (search && String(search).trim()) {
        const term = String(search).trim().slice(0, 120);
        const searchTerms = [
          { orderNumber: { contains: term, mode: 'insensitive' } },
          { tableNumber: { contains: term, mode: 'insensitive' } },
          { tableLabel: { contains: term, mode: 'insensitive' } },
          { customerEmail: { contains: term, mode: 'insensitive' } },
          { user: { is: { name: { contains: term, mode: 'insensitive' } } } },
          { user: { is: { email: { contains: term, mode: 'insensitive' } } } },
        ];
        const numericTerm = Number.parseInt(term, 10);
        if (Number.isInteger(numericTerm) && String(numericTerm) === term) searchTerms.push({ tableId: numericTerm });
        whereClause.AND = [...(whereClause.AND || []), { OR: searchTerms }];
      }

      if (paymentMethod && paymentMethod !== 'ALL') {
        const normalizedMethod = String(paymentMethod).trim().toUpperCase();
        if (normalizedMethod === 'EASYPAISA') {
          whereClause.paymentMethod = { in: ['EASYPAISA', 'Easypaisa', 'NAYAPAY', 'NayaPay'] };
        } else if (normalizedMethod === 'JAZZCASH') {
          whereClause.paymentMethod = { in: ['JAZZCASH', 'JazzCash'] };
        } else if (normalizedMethod === 'COD') {
          whereClause.paymentMethod = { in: ['COD', 'CASH', 'Cash'] };
        } else {
          return res.status(400).json({ error: 'Invalid payment method filter.' });
        }
      }

      if (from || toExclusive) {
        const dateFilter = {};
        if (from) {
          const start = new Date(from);
          if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date.' });
          dateFilter.gte = start;
        }
        if (toExclusive) {
          const end = new Date(toExclusive);
          if (Number.isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid end date.' });
          dateFilter.lt = end;
        }
        if (dateFilter.gte && dateFilter.lt && dateFilter.gte >= dateFilter.lt) {
          return res.status(400).json({ error: 'The start date must be before the end date.' });
        }
        whereClause.createdAt = dateFilter;
      }
    }

    let pagination = null;
    let take = 100;
    let skip = 0;
    const allowedStatuses = new Set([
      'PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY',
      'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'REFUNDED',
    ]);
    if (status && userRole === 'ADMIN' && !allowedStatuses.has(String(status).toUpperCase())) {
      return res.status(400).json({ error: 'Invalid order status filter.' });
    }
    if (paginatedAdminRequest && exportAll !== 'true') {
      const page = pageParam === undefined ? 1 : Number(pageParam);
      const requestedPageSize = pageSizeParam === undefined ? 25 : Number(pageSizeParam);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedPageSize) || requestedPageSize < 1) {
        return res.status(400).json({ error: 'Page and pageSize must be positive integers.' });
      }
      take = Math.min(requestedPageSize, 100);
      skip = (page - 1) * take;
      if (!Number.isSafeInteger(skip)) return res.status(400).json({ error: 'Page is out of range.' });
      pagination = { page, pageSize: take };
    } else if (paginatedAdminRequest && exportAll === 'true') {
      take = 10000;
    }

    const include = {
      table: { select: { id: true, tableNumber: true } },
      orderItems: { include: { menuItem: true } },
      user: { select: { id: true, name: true, email: true } },
      payment: true,
      etaPrediction: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    };
    const exportSelect = {
      id: true,
      orderNumber: true,
      tableId: true,
      tableNumber: true,
      tableLabel: true,
      total: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      table: { select: { id: true, tableNumber: true } },
    };
    const isAdminExport = paginatedAdminRequest && exportAll === 'true';
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        ...(isAdminExport ? { select: exportSelect } : { include }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
      }),
      paginatedAdminRequest ? prisma.order.count({ where: whereClause }) : Promise.resolve(null),
    ]);

    const response = { orders: orders.map(withTableLabel) };
    if (paginatedAdminRequest && exportAll !== 'true') {
      response.pagination = {
        ...pagination,
        total,
        totalPages: Math.ceil(total / pagination.pageSize),
      };
    }
    if (paginatedAdminRequest && exportAll === 'true') {
      response.exportTruncated = total > take;
      response.total = total;
    }
    return res.json(response);
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
        table: { select: { id: true, tableNumber: true } },
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

    return res.json({ order: withTableLabel(order) });
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
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
        etaPrediction: true,
        payment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order tracking record not found.' });
    }

    return res.json({ order: withTableLabel(order) });
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
      include: {
        table: { select: { id: true, tableNumber: true } },
        orderItems: { include: { menuItem: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (userRole === 'CUSTOMER') {
      return res.status(403).json({ error: 'Customers cannot transfer order delivery tables.' });
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
      return res.status(404).json({ error: 'Target table not found.' });
    }

    if (!targetTable.isActive) {
      return res.status(403).json({ error: `${targetTable.tableNumber} is currently deactivated.` });
    }

    const oldTableDisplay = formatTableLabel(order);
    const newTableDisplay = formatTableLabel({ table: targetTable });

    const isUrgentReroute = order.status === 'READY';
    const noteText = isUrgentReroute
      ? `🚨 URGENT REROUTE: Order is READY! Deliver to ${newTableDisplay} instead of ${oldTableDisplay}`
      : `Table transfer: Changed from ${oldTableDisplay} to ${newTableDisplay}`;

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
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

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        previousStatus: order.status,
        newStatus: order.status,
        changedByUserId: userId,
        note: noteText,
      },
    });

    await logAudit({
      userId,
      action: 'ORDER_TABLE_TRANSFERRED',
      entity: 'Order',
      entityId: String(order.id),
      oldValue: { tableId: order.tableId, tableLabel: oldTableDisplay },
      newValue: { tableId: targetTable.id, tableLabel: newTableDisplay },
      req,
    });

    // Realtime notifications
    const orderWithTableLabel = withTableLabel(updatedOrder);
    emitToKitchen('order:update', orderWithTableLabel);
    emitToVendor('order:update', orderWithTableLabel);
    emitToAdmin('order:update', orderWithTableLabel);
    emitToUser(orderWithTableLabel.userId, 'order:update', orderWithTableLabel);

    emitToKitchen('table:shift', {
      orderId: orderWithTableLabel.id,
      orderNumber: orderWithTableLabel.orderNumber,
      oldTable: oldTableDisplay,
      newTable: newTableDisplay,
      isUrgent: isUrgentReroute,
    });

    return res.json({
      message: `Order #${updatedOrder.orderNumber} successfully transferred to ${newTableDisplay}.`,
      order: orderWithTableLabel,
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

    clearDashboardStatsCache();

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

    clearDashboardStatsCache();

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
