const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');
const { emitToAccount } = require('../sockets/socket');
const { clearUserCache } = require('../middleware/authMiddleware');
const { withTableLabel } = require('../utils/tableLabel');
const exceptionLogger = require('../utils/exceptionLogger');
const {
  getAllDisputes,
  getDisputeCounts,
  createDispute,
  updateDisputeStatus: updateDisputeStatusService,
} = require('../services/disputeService');

const dashboardStatsCache = new Map();
const DASHBOARD_CACHE_TTL_MS = 15 * 1000; // 15s fast cache

const clearDashboardStatsCache = () => {
  dashboardStatsCache.clear();
};

/**
 * Executive Dashboard Analytics with AI ETA accuracy, demand forecasts, and trends
 */
const getDashboardStats = async (req, res) => {
  const { period = 'day', branchId, refresh, from, to } = req.query;
  const cacheKey = `${period}_${branchId || 'all'}_${from || ''}_${to || ''}`;

  if (refresh !== 'true' && dashboardStatsCache.has(cacheKey)) {
    const cached = dashboardStatsCache.get(cacheKey);
    if (Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }
  }

  try {
    const now = new Date();
    let startDate = new Date();

    if (period === 'all') {
      startDate = new Date(0);
    } else if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    const dateFilter = {};
    if (from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(new Date(`${from}T00:00:00`).getTime())) {
        return res.status(400).json({ error: 'Invalid start date. Use YYYY-MM-DD.' });
      }
      dateFilter.gte = new Date(`${from}T00:00:00`);
    }
    if (to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || Number.isNaN(new Date(`${to}T23:59:59.999`).getTime())) {
        return res.status(400).json({ error: 'Invalid end date. Use YYYY-MM-DD.' });
      }
      dateFilter.lte = new Date(`${to}T23:59:59.999`);
    }
    if (from && to && dateFilter.gte > dateFilter.lte) {
      return res.status(400).json({ error: 'Invalid date range: start date cannot be after end date.' });
    }
    if (!from && !to) dateFilter.gte = startDate;
    const branchFilter = (branchId && branchId !== 'all') ? { branchId: parseInt(branchId, 10) } : {};
    const dashboardOrderWhere = { createdAt: dateFilter, ...branchFilter };

    // Execute all dashboard queries concurrently for max performance
    const [
      paidOrders,
      activeOrdersCount,
      userCounts,
      allInventoryItems,
      recentOrders,
      menuItems,
      paidOrderItems,
      etaRecords,
      totalOrdersCountAllTime,
      oldestOrder,
      orderStatusGroups,
    ] = await Promise.all([
      // 1. Total Revenue for period
      prisma.order.findMany({
        where: {
          status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
          ...dashboardOrderWhere,
        },
        select: { total: true, paymentMethod: true, createdAt: true },
      }),
      // 2. Active Queue Count
      prisma.order.count({
        where: {
          status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'] },
          ...branchFilter,
        },
      }),
      // 3. User & Staff Statistics
      prisma.user.groupBy({
        by: ['role', 'isActive'],
        _count: { _all: true },
      }),
      // 4. Inventory Items
      prisma.inventoryItem.findMany({
        where: branchFilter,
      }),
      // 5. Recent Orders
      prisma.order.findMany({
        take: 10,
        where: branchFilter,
        orderBy: { createdAt: 'desc' },
        include: {
          table: { select: { id: true, tableNumber: true } },
          user: { select: { name: true, email: true } },
          orderItems: { include: { menuItem: true } },
        },
      }),
      // 6. Menu Items
      prisma.menuItem.findMany({
        where: branchFilter,
        select: { id: true, name: true, category: true, prepTime: true },
      }),
      // 7. Paid Order Items for top selling analysis
      prisma.orderItem.groupBy({
        by: ['menuItemId', 'nameSnapshot', 'priceSnapshot'],
        where: {
          order: {
            status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
            ...dashboardOrderWhere,
          },
        },
        _sum: { quantity: true },
      }),
      // 8. AI ETA Records
      prisma.eTAPrediction.findMany({
        where: { actualTime: { not: null } },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      // 9. All time order count for confidence calculation
      prisma.order.count({ where: branchFilter }),
      // 10. Oldest order date
      prisma.order.findFirst({
        where: branchFilter,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: dashboardOrderWhere,
        _count: { _all: true },
      }),
    ]);

    // Calculate financial metrics
    const totalRevenue = paidOrders.reduce((sum, order) => sum + (order.total || 0), 0.0);
    const completedOrdersCount = paidOrders.length;
    const averageOrderValue = completedOrdersCount > 0 ? parseFloat((totalRevenue / completedOrdersCount).toFixed(2)) : 0.0;

    // Payment Method Breakdown
    const paymentMethodsMap = {};
    const paymentMethodTotalsMap = {};

    paidOrders.forEach(o => {
      const rawMethod = String(o.paymentMethod || 'COD').trim().toUpperCase();
      const pm = rawMethod === 'NAYAPAY' ? 'EASYPAISA' : rawMethod;
      if (paymentMethodsMap[pm] === undefined) {
        paymentMethodsMap[pm] = 0;
        paymentMethodTotalsMap[pm] = 0;
      }
      paymentMethodsMap[pm] += 1;
      paymentMethodTotalsMap[pm] += (o.total || 0);
    });

    const paymentBreakdown = Object.keys(paymentMethodsMap).filter(method => paymentMethodsMap[method] > 0).map(method => ({
      method,
      count: paymentMethodsMap[method],
      totalAmount: parseFloat(paymentMethodTotalsMap[method].toFixed(2)),
    }));

    const countUsers = (predicate) => userCounts.reduce(
      (total, group) => total + (predicate(group) ? group._count._all : 0),
      0
    );
    const userStats = {
      customer: countUsers((group) => group.role === 'CUSTOMER'),
      vendor: countUsers((group) => group.role === 'VENDOR'),
      kitchen: countUsers((group) => group.role === 'KITCHEN'),
      admin: countUsers((group) => group.role === 'ADMIN'),
      activeStaff: countUsers((group) => group.role !== 'CUSTOMER' && group.isActive !== false),
    };
    const usersCount = countUsers(() => true);

    const lowStockAlerts = [];
    const stockRecommendations = [];
    allInventoryItems.forEach((item) => {
      let statusLevel = 'OK';
      let recommendedReorder = 0;

      if (item.stockLevel <= 0) {
        statusLevel = 'CRITICAL STOCK';
        recommendedReorder = item.minThreshold * 2;
      } else if (item.stockLevel <= item.minThreshold) {
        statusLevel = 'LOW STOCK';
        recommendedReorder = Math.ceil(item.minThreshold * 1.5 - item.stockLevel);
      } else if (item.stockLevel >= item.minThreshold * 5) {
        statusLevel = 'OVERSTOCK';
      }

      if (statusLevel === 'CRITICAL STOCK' || statusLevel === 'LOW STOCK') {
        lowStockAlerts.push({
          ...item,
          statusLevel,
          recommendedReorder,
        });
      }

      if (recommendedReorder > 0) {
        stockRecommendations.push({
          name: item.name,
          currentStock: item.stockLevel,
          threshold: item.minThreshold,
          recommendedReorder,
          urgency: statusLevel === 'CRITICAL STOCK' ? 'HIGH' : 'MEDIUM',
        });
      }
    });

    const categories = [...new Set(menuItems.map(item => item.category))];
    const categoryStats = categories.map(cat => ({
      category: cat,
      count: menuItems.filter(item => item.category === cat).length,
    }));

    const itemAgg = {};
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    paidOrderItems.forEach((item) => {
      const menuItem = menuItemsById.get(item.menuItemId);
      const name = item.nameSnapshot || menuItem?.name || `Item #${item.menuItemId}`;
      const quantity = item._sum.quantity || 0;
      if (!itemAgg[name]) {
        itemAgg[name] = { name, quantity: 0, revenue: 0, category: menuItem?.category || 'General' };
      }
      itemAgg[name].quantity += quantity;
      itemAgg[name].revenue += (item.priceSnapshot || 0) * quantity;
    });

    const topItems = Object.values(itemAgg)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Kitchen Prep Time Calculation (Req 6)
    let avgPrepTime = null;
    let avgPrepTimeLabel = "Not Enough Data";
    let isActualPrepTime = false;

    if (etaRecords.length > 0) {
      const totalActual = etaRecords.reduce((s, r) => s + (r.actualTime || 0), 0);
      avgPrepTime = parseFloat((totalActual / etaRecords.length).toFixed(1));
      avgPrepTimeLabel = `${avgPrepTime} mins`;
      isActualPrepTime = true;
    } else if (menuItems.length > 0) {
      const totalConfigured = menuItems.reduce((s, m) => s + (m.prepTime || 5), 0);
      avgPrepTime = parseFloat((totalConfigured / menuItems.length).toFixed(1));
      avgPrepTimeLabel = `${avgPrepTime} mins (configured)`;
      isActualPrepTime = false;
    }

    // Prediction Accuracy Calculation (Req 5)
    let predictionAccuracy = null;
    let accuracyLabel = "Not Enough Data";
    let accuracyHelper = "Accuracy will appear after enough forecast history is available.";

    if (etaRecords.length >= 10) {
      const varianceList = etaRecords.map(r => Math.abs(r.adjustedEta - (r.actualTime || r.adjustedEta)));
      const avgVariance = varianceList.reduce((s, v) => s + v, 0) / etaRecords.length;
      const basePrep = avgPrepTime || 8;
      predictionAccuracy = parseFloat(Math.max(60, Math.min(99, 100 - (avgVariance / basePrep) * 100)).toFixed(1));
      accuracyLabel = `${predictionAccuracy}%`;
      accuracyHelper = "Evaluated against actual POS kitchen prep trends";
    }

    // POS Data Confidence Calculation (Req 8)
    const oldestDate = oldestOrder?.createdAt ? new Date(oldestOrder.createdAt) : now;
    const dateSpanDays = Math.max(1, Math.ceil((now - oldestDate) / (1000 * 60 * 60 * 24)));

    let posConfidenceScore = 'LOW';
    if (totalOrdersCountAllTime >= 50 && dateSpanDays >= 14) {
      posConfidenceScore = 'HIGH';
    } else if (totalOrdersCountAllTime >= 10 && dateSpanDays >= 3) {
      posConfidenceScore = 'MEDIUM';
    }

    const posConfidenceExplanation = `Based on ${totalOrdersCountAllTime} recorded order(s) over ${dateSpanDays} day(s)`;

    // Generate real revenueTimeline based on paidOrders
    let revenueTimeline = [];
    if (period === 'day') {
      const hoursMap = {};
      for (let h = 8; h <= 23; h += 2) {
        const key = `${String(h).padStart(2, '0')}:00`;
        hoursMap[key] = { label: key, revenue: 0, orderCount: 0 };
      }
      paidOrders.forEach(o => {
        const d = new Date(o.createdAt);
        const hour = d.getHours();
        const slotHour = Math.floor(hour / 2) * 2;
        const key = `${String(Math.max(8, Math.min(22, slotHour))).padStart(2, '0')}:00`;
        if (hoursMap[key]) {
          hoursMap[key].revenue += (o.total || 0);
          hoursMap[key].orderCount += 1;
        }
      });
      revenueTimeline = Object.values(hoursMap);
    } else if (period === 'week') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const daysMap = {};
      days.forEach(d => { daysMap[d] = { label: d, revenue: 0, orderCount: 0 }; });
      paidOrders.forEach(o => {
        const d = new Date(o.createdAt);
        const dayName = days[d.getDay()];
        if (daysMap[dayName]) {
          daysMap[dayName].revenue += (o.total || 0);
          daysMap[dayName].orderCount += 1;
        }
      });
      revenueTimeline = Object.values(daysMap);
    } else if (period === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const binsMap = {};
      for (let i = 1; i <= daysInMonth; i += 3) {
        const key = `Day ${i}`;
        binsMap[key] = { label: key, revenue: 0, orderCount: 0 };
      }
      paidOrders.forEach(o => {
        const day = new Date(o.createdAt).getDate();
        const binDay = Math.min(daysInMonth, Math.floor((day - 1) / 3) * 3 + 1);
        const key = `Day ${binDay}`;
        if (binsMap[key]) {
          binsMap[key].revenue += (o.total || 0);
          binsMap[key].orderCount += 1;
        }
      });
      revenueTimeline = Object.values(binsMap);
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthsMap = {};
      months.forEach(m => { monthsMap[m] = { label: m, revenue: 0, orderCount: 0 }; });
      paidOrders.forEach(o => {
        const m = months[new Date(o.createdAt).getMonth()];
        if (monthsMap[m]) {
          monthsMap[m].revenue += (o.total || 0);
          monthsMap[m].orderCount += 1;
        }
      });
      revenueTimeline = Object.values(monthsMap);
    }
    if (from || to || period === 'all') {
      const isCustomRange = Boolean(from || to);
      const first = from ? new Date(`${from}T00:00:00`) : paidOrders.reduce((earliest, order) => new Date(order.createdAt) < earliest ? new Date(order.createdAt) : earliest, new Date());
      const last = to ? new Date(`${to}T23:59:59.999`) : paidOrders.reduce((latest, order) => new Date(order.createdAt) > latest ? new Date(order.createdAt) : latest, new Date());
      const spanDays = Math.max(0, Math.ceil((last - first) / (24 * 60 * 60 * 1000)));

      // If it's a single day (same-day custom range, e.g. from === to or same calendar day)
      const isSingleDay = isCustomRange && (from === to || (first.toDateString() === last.toDateString()));

      if (isSingleDay) {
        const hoursMap = {};
        for (let h = 8; h <= 23; h += 2) {
          const key = `${String(h).padStart(2, '0')}:00`;
          hoursMap[key] = { label: key, revenue: 0, orderCount: 0 };
        }
        paidOrders.forEach(o => {
          const d = new Date(o.createdAt);
          const hour = d.getHours();
          const slotHour = Math.floor(hour / 2) * 2;
          const key = `${String(Math.max(8, Math.min(22, slotHour))).padStart(2, '0')}:00`;
          if (hoursMap[key]) {
            hoursMap[key].revenue += (o.total || 0);
            hoursMap[key].orderCount += 1;
          }
        });
        revenueTimeline = Object.values(hoursMap);
      } else {
        const monthly = isCustomRange ? spanDays > 92 : (period === 'all' || spanDays > 92);
        const timeline = new Map();
        if (paidOrders.length > 0 || (from && to)) {
          const cursor = new Date(first.getFullYear(), first.getMonth(), monthly ? 1 : first.getDate());
          const finalBucket = new Date(last.getFullYear(), last.getMonth(), monthly ? 1 : last.getDate());
          while (cursor <= finalBucket) {
            const key = monthly
              ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
              : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
            const label = monthly
              ? cursor.toLocaleDateString('en', { month: 'short', year: '2-digit' })
              : cursor.toLocaleDateString('en', { month: 'short', day: 'numeric' });
            timeline.set(key, { label, revenue: 0, orderCount: 0 });
            if (monthly) cursor.setMonth(cursor.getMonth() + 1);
            else cursor.setDate(cursor.getDate() + 1);
          }
          paidOrders.forEach((order) => {
            const date = new Date(order.createdAt);
            const key = monthly
              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const point = timeline.get(key);
            if (point) {
              point.revenue += order.total || 0;
              point.orderCount += 1;
            }
          });
        }
        revenueTimeline = Array.from(timeline.values());
      }
    }
    revenueTimeline = revenueTimeline.map(r => ({ ...r, revenue: parseFloat(r.revenue.toFixed(2)) }));

    const payload = {
      period,
      branchId: branchId || 'all',
      metrics: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalOrdersCount: completedOrdersCount,
        averageOrderValue,
        activeOrdersCount,
      usersCount,
        userStats,
        lowStockCount: lowStockAlerts.length,
        avgPrepTime,
        avgPrepTimeLabel,
        isActualPrepTime,
        predictionAccuracy,
        accuracyLabel,
        accuracyHelper,
        posConfidenceScore,
        posConfidenceExplanation,
      },
      revenueTimeline,
      orderStatusCounts: orderStatusGroups.map((group) => ({ status: group.status, count: group._count._all })),
      paymentBreakdown,
      lowStockAlerts,
      stockRecommendations,
      recentOrders: recentOrders.map(withTableLabel),
      categoryStats,
      topItems,
    };

    dashboardStatsCache.set(cacheKey, { timestamp: Date.now(), payload });
    return res.json(payload);
  } catch (error) {
    console.error('Fetch dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to retrieve admin dashboard stats.' });
  }
};

/**
 * Get Audit Logs
 */
const getAuditLogs = async (req, res) => {
  const { action, entity, limit = 50 } = req.query;

  try {
    const where = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10) || 50,
    });

    return res.json({ logs });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
};

/**
 * Delete a single audit log entry
 */
const deleteAuditLog = async (req, res) => {
  const { id } = req.params;
  const staffUserId = req.user?.id;

  try {
    const logId = parseInt(id, 10);
    const existing = await prisma.auditLog.findUnique({ where: { id: logId } });
    if (!existing) {
      return res.status(404).json({ error: 'Audit log entry not found.' });
    }

    await prisma.auditLog.delete({ where: { id: logId } });

    await logAudit({
      userId: staffUserId,
      action: 'AUDIT_LOG_DELETED',
      entity: 'AuditLog',
      entityId: logId,
      oldValue: existing,
      req
    });

    return res.json({ message: 'Audit log entry deleted successfully.' });
  } catch (error) {
    console.error('Delete audit log error:', error);
    return res.status(500).json({ error: 'Failed to delete audit log entry.' });
  }
};

/**
 * Bulk delete audit logs
 */
const bulkDeleteAuditLogs = async (req, res) => {
  const { ids = [], beforeDate } = req.body;
  const staffUserId = req.user?.id;

  try {
    const where = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids.map(i => parseInt(i, 10)).filter(i => !isNaN(i)) };
    } else if (beforeDate) {
      where.createdAt = { lte: new Date(beforeDate) };
    } else {
      return res.status(400).json({ error: 'Provide either an array of log ids or a beforeDate cutoff.' });
    }

    const { count } = await prisma.auditLog.deleteMany({ where });

    await logAudit({
      userId: staffUserId,
      action: 'BULK_AUDIT_LOGS_DELETED',
      entity: 'AuditLog',
      entityId: `bulk_${count}`,
      oldValue: { count, beforeDate, idsCount: ids.length },
      req
    });

    return res.json({ message: `Successfully deleted ${count} audit log records.`, count });
  } catch (error) {
    console.error('Bulk delete audit logs error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete audit logs.' });
  }
};

/**
 * Staff Management Controllers
 */
const getStaffList = async (req, res) => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'VENDOR', 'KITCHEN'] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
        isDemo: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ staff });
  } catch (error) {
    console.error('Get staff list error:', error);
    return res.status(500).json({ error: 'Failed to retrieve staff list.' });
  }
};

const createStaff = async (req, res) => {
  const { name, email, password, role, branchId, isDemo = false } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  }

  const validRoles = ['ADMIN', 'VENDOR', 'KITCHEN'];
  if (!validRoles.includes(role.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid staff role. Must be ADMIN, VENDOR (Cashier), or KITCHEN.' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Fix: Resolve default branchId dynamically from the database
    let resolvedBranchId = branchId ? parseInt(branchId, 10) : null;
    if (!resolvedBranchId) {
      const defaultBranch = await prisma.branch.findFirst({
        orderBy: { id: 'asc' }
      });
      if (defaultBranch) {
        resolvedBranchId = defaultBranch.id;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newStaff = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: role.toUpperCase(),
        branchId: resolvedBranchId,
        isActive: true,
        isDemo: Boolean(isDemo),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isDemo: true,
        branchId: true,
        createdAt: true,
      },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'STAFF_ACCOUNT_CREATED',
      entity: 'User',
      entityId: newStaff.id,
      newValue: { email: newStaff.email, role: newStaff.role },
      req,
    });

    return res.status(201).json({ message: 'Staff account created successfully.', staff: newStaff });
  } catch (error) {
    console.error('Create staff error:', error);
    return res.status(500).json({ error: 'Failed to create staff account.' });
  }
};

const updateStaff = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, branchId, isDemo } = req.body;

  try {
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (role && ['ADMIN', 'VENDOR', 'KITCHEN'].includes(role.toUpperCase())) {
      updateData.role = role.toUpperCase();
    }
    if (branchId !== undefined) updateData.branchId = parseInt(branchId, 10);
    if (isDemo !== undefined) updateData.isDemo = Boolean(isDemo);

    const updated = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        isDemo: true,
      },
    });

    // Clear in-memory auth cache and broadcast real-time socket event
    clearUserCache(updated.id);
    emitToAccount(updated.id, 'staff:account-updated', {
      userId: updated.id,
      email: updated.email,
      newRole: updated.role,
      isActive: updated.isActive,
      isDemo: updated.isDemo,
      action: 'ACCOUNT_UPDATED',
      message: `Your account details were updated by the System Administrator.`,
    });

    return res.json({ message: 'Staff information updated successfully.', staff: updated });
  } catch (error) {
    console.error('Update staff error:', error);
    return res.status(500).json({ error: 'Failed to update staff account.' });
  }
};

/**
 * Change Staff Role (Admin Only) — updates the user role in the database
 */
const updateStaffRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ['ADMIN', 'VENDOR', 'KITCHEN'];
  if (!role || !validRoles.includes(role.toUpperCase())) {
    return res.status(400).json({ error: 'Valid role required: ADMIN, VENDOR, or KITCHEN.' });
  }

  const targetId = parseInt(id, 10);
  if (req.user && req.user.id === targetId && role.toUpperCase() !== 'ADMIN') {
    return res.status(400).json({ error: 'You cannot demote your own Admin account.' });
  }

  try {
    // Get current user (needed for 404 check and old role)
    const current = await prisma.user.findUnique({ where: { id: targetId } });
    if (!current) return res.status(404).json({ error: 'Staff member not found.' });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { role: role.toUpperCase() },
      select: { id: true, name: true, email: true, role: true, isActive: true, isDemo: true, createdAt: true },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'STAFF_ROLE_CHANGED',
      entity: 'User',
      entityId: targetId,
      newValue: { role: role.toUpperCase() },
      req,
    });

    // Clear in-memory auth cache and broadcast real-time account role change event
    clearUserCache(targetId);
    emitToAccount(targetId, 'staff:account-updated', {
      userId: targetId,
      email: updated.email,
      newRole: updated.role,
      oldRole: current.role,
      isActive: updated.isActive,
      isDemo: updated.isDemo,
      action: 'ROLE_CHANGED',
      message: `Your account role has been updated from ${current.role} to ${updated.role} by Administrator.`,
    });

    return res.json({ message: `Role updated to ${role.toUpperCase()} successfully.`, staff: updated });
  } catch (error) {
    console.error('Update staff role error:', error);
    return res.status(500).json({ error: 'Failed to update staff role.' });
  }
};

const toggleStaffStatus = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  if (isActive === undefined) {
    return res.status(400).json({ error: 'isActive status flag is required.' });
  }

  const targetId = parseInt(id, 10);
  if (req.user && req.user.id === targetId && isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own active Admin account.' });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId } });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: Boolean(isActive) },
      select: { id: true, name: true, email: true, role: true, isActive: true, isDemo: true },
    });

    await logAudit({
      userId: req.user?.id,
      action: updated.isActive ? 'STAFF_ACCOUNT_ACTIVATED' : 'STAFF_ACCOUNT_DEACTIVATED',
      entity: 'User',
      entityId: targetId,
      req,
    });

    // Clear in-memory auth cache and broadcast status toggle event
    clearUserCache(targetId);
    emitToAccount(targetId, 'staff:account-updated', {
      userId: targetId,
      email: updated.email,
      newRole: updated.role,
      isActive: updated.isActive,
      isDemo: updated.isDemo,
      action: updated.isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
      message: updated.isActive
        ? 'Your account has been activated by Administrator.'
        : 'Your account has been deactivated by Administrator.',
    });

    return res.json({
      message: `Staff account ${updated.isActive ? 'activated' : 'deactivated'} successfully.`,
      staff: updated,
    });
  } catch (error) {
    console.error('Toggle staff status error:', error);
    return res.status(500).json({ error: 'Failed to update staff account status.' });
  }
};

/**
 * Delete a Staff Account safely
 * Checks for historical audit, order, and inventory ties. If historical dependencies exist, soft-deactivates safely.
 */
const deleteStaffAccount = async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id, 10);
  const currentUserId = req.user?.id;

  if (currentUserId === targetId) {
    return res.status(400).json({ error: 'You cannot delete your own logged-in Admin account.' });
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        _count: {
          select: { orders: true, auditLogs: true, inventoryLogs: true, receivings: true, statusChanges: true }
        }
      }
    });

    if (!target) {
      return res.status(404).json({ error: 'Staff account not found.' });
    }

    const historyCount =
      (target._count.orders || 0) +
      (target._count.auditLogs || 0) +
      (target._count.inventoryLogs || 0) +
      (target._count.receivings || 0) +
      (target._count.statusChanges || 0);

    if (historyCount > 0) {
      // Soft-delete to preserve foreign key constraints in audit, order and inventory logs
      const deactivated = await prisma.user.update({
        where: { id: targetId },
        data: { isActive: false }
      });

      clearUserCache(targetId);
      emitToAccount(targetId, 'staff:account-updated', {
        userId: targetId,
        email: deactivated.email,
        action: 'ACCOUNT_DEACTIVATED',
        message: 'Account archived & deactivated due to historical transaction logs.'
      });

      await logAudit({
        userId: currentUserId,
        action: 'STAFF_DEACTIVATED_HISTORICAL',
        entity: 'User',
        entityId: targetId,
        oldValue: { name: target.name, email: target.email, historyCount },
        req
      });

      return res.json({
        message: `Staff member "${target.name}" has ${historyCount} historical logs/orders and was safely deactivated & archived.`,
        isArchived: true
      });
    }

    // No historical dependencies: perform clean hard delete
    await prisma.user.delete({ where: { id: targetId } });

    clearUserCache(targetId);
    emitToAccount(targetId, 'staff:account-updated', {
      userId: targetId,
      action: 'ACCOUNT_DELETED',
      message: 'Staff account has been permanently removed.'
    });

    await logAudit({
      userId: currentUserId,
      action: 'STAFF_DELETED',
      entity: 'User',
      entityId: targetId,
      oldValue: { name: target.name, email: target.email },
      req
    });

    return res.json({ message: `Staff member "${target.name}" was permanently deleted.` });
  } catch (error) {
    console.error('Delete staff account error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete staff account.' });
  }
};

/**
 * Delete a Customer Account safely
 */
const deleteCustomerAccount = async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id, 10);
  const currentUserId = req.user?.id;

  try {
    const customer = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        _count: { select: { orders: true, sessions: true } }
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    if (customer.role !== 'CUSTOMER') {
      return res.status(400).json({ error: 'Only customer accounts can be removed from the customer roster.' });
    }

    const orderCount = customer._count.orders || 0;

    if (orderCount > 0) {
      // Has orders: deactivate rather than break historical customer reference
      await prisma.user.update({
        where: { id: targetId },
        data: { isActive: false }
      });

      await logAudit({
        userId: currentUserId,
        action: 'CUSTOMER_DEACTIVATED',
        entity: 'User',
        entityId: targetId,
        oldValue: { name: customer.name, email: customer.email, orderCount },
        req
      });

      return res.json({
        message: `Customer "${customer.name}" has ${orderCount} existing order records and has been safely archived & deactivated.`,
        isArchived: true
      });
    }

    // Clean delete
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: targetId } });
      await tx.user.delete({ where: { id: targetId } });
    });

    await logAudit({
      userId: currentUserId,
      action: 'CUSTOMER_DELETED',
      entity: 'User',
      entityId: targetId,
      oldValue: { name: customer.name, email: customer.email },
      req
    });

    return res.json({ message: `Customer "${customer.name}" was permanently deleted.` });
  } catch (error) {
    console.error('Delete customer error:', error);
    return res.status(500).json({ error: 'Failed to delete customer record.' });
  }
};

/**
 * Bulk Delete / Archive Customers
 */
const bulkDeleteCustomers = async (req, res) => {
  const { ids, scope } = req.body;
  const currentUserId = req.user?.id;

  try {
    let customerIds = [];
    if (scope === 'INACTIVE') {
      const inactiveCustomers = await prisma.user.findMany({
        where: { role: 'CUSTOMER', isActive: false },
        select: { id: true },
      });
      customerIds = inactiveCustomers.map(c => c.id);
    } else if (Array.isArray(ids) && ids.length > 0) {
      customerIds = ids.map(id => parseInt(id, 10)).filter(Boolean);
    } else {
      return res.status(400).json({ error: 'No customer IDs or valid scope provided for deletion.' });
    }

    if (customerIds.length === 0) {
      return res.json({ message: 'No matching customer accounts found to delete.', count: 0 });
    }

    let deletedCount = 0;
    let archivedCount = 0;

    for (const targetId of customerIds) {
      const customer = await prisma.user.findUnique({
        where: { id: targetId },
        include: { _count: { select: { orders: true } } },
      });

      if (!customer || customer.role !== 'CUSTOMER') continue;

      if ((customer._count?.orders || 0) > 0) {
        await prisma.user.update({
          where: { id: targetId },
          data: { isActive: false },
        });
        archivedCount++;
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.session.deleteMany({ where: { userId: targetId } });
          await tx.user.delete({ where: { id: targetId } });
        });
        deletedCount++;
      }
    }

    await logAudit({
      userId: currentUserId,
      action: 'CUSTOMERS_BULK_DELETED',
      entity: 'User',
      newValue: { totalProcessed: customerIds.length, deletedCount, archivedCount },
      req,
    });

    return res.json({
      message: `Processed ${customerIds.length} customer account(s): ${deletedCount} permanently deleted, ${archivedCount} safely archived due to order history.`,
      count: deletedCount + archivedCount,
      deletedCount,
      archivedCount,
    });
  } catch (error) {
    console.error('Bulk delete customers error:', error);
    return res.status(500).json({ error: 'Failed to process bulk customer deletion.' });
  }
};

/**
 * Bulk Delete / Archive Staff
 */
const bulkDeleteStaff = async (req, res) => {
  const { ids } = req.body;
  const currentUserId = req.user?.id;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Please select staff accounts to delete.' });
  }

  try {
    const staffIds = ids
      .map(id => parseInt(id, 10))
      .filter(id => Boolean(id) && id !== currentUserId);

    if (staffIds.length === 0) {
      return res.status(400).json({ error: 'No eligible staff accounts to delete. You cannot delete your own logged-in account.' });
    }

    let deletedCount = 0;
    let archivedCount = 0;

    for (const targetId of staffIds) {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        include: {
          _count: {
            select: { orders: true, auditLogs: true, inventoryLogs: true, receivings: true, statusChanges: true },
          },
        },
      });

      if (!target || target.role === 'CUSTOMER') continue;

      const historyCount =
        (target._count.orders || 0) +
        (target._count.auditLogs || 0) +
        (target._count.inventoryLogs || 0) +
        (target._count.receivings || 0) +
        (target._count.statusChanges || 0);

      if (historyCount > 0) {
        await prisma.user.update({
          where: { id: targetId },
          data: { isActive: false },
        });
        archivedCount++;
      } else {
        await prisma.user.delete({ where: { id: targetId } });
        deletedCount++;
      }
      clearUserCache(targetId);
    }

    await logAudit({
      userId: currentUserId,
      action: 'STAFF_BULK_DELETED',
      entity: 'User',
      newValue: { totalProcessed: staffIds.length, deletedCount, archivedCount },
      req,
    });

    return res.json({
      message: `Processed ${staffIds.length} staff account(s): ${deletedCount} permanently deleted, ${archivedCount} safely archived.`,
      count: deletedCount + archivedCount,
      deletedCount,
      archivedCount,
    });
  } catch (error) {
    console.error('Bulk delete staff error:', error);
    return res.status(500).json({ error: 'Failed to process bulk staff deletion.' });
  }
};

/**
 * Branch Management
 */
const getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      include: {
        _count: {
          select: { tables: true, menuItems: true, orders: true, users: true, inventoryItems: true, receivings: true },
        },
      },
    });
    return res.json({ branches });
  } catch (error) {
    console.error('Get branches error:', error);
    return res.status(500).json({ error: 'Failed to retrieve branches.' });
  }
};

const createBranch = async (req, res) => {
  const { name, address, phone } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Branch name is required.' });
  }

  try {
    const branch = await prisma.branch.create({
      data: {
        name: name.trim(),
        address: address ? address.trim() : null,
        phone: phone ? phone.trim() : null,
        isActive: true,
      },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'BRANCH_CREATED',
      entity: 'Branch',
      entityId: branch.id,
      newValue: branch,
      req,
    });

    return res.status(201).json({ message: 'Branch created successfully.', branch });
  } catch (error) {
    console.error('Create branch error:', error);
    return res.status(500).json({ error: 'Failed to create branch.' });
  }
};

const updateBranch = async (req, res) => {
  const branchId = parseInt(req.params.id, 10);
  const { name, address, phone } = req.body;
  if (!Number.isInteger(branchId)) return res.status(400).json({ error: 'Valid branch ID is required.' });
  if (!name?.trim()) return res.status(400).json({ error: 'Branch name is required.' });

  try {
    const existing = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!existing) return res.status(404).json({ error: 'Branch not found.' });

    const branch = await prisma.branch.update({
      where: { id: branchId },
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
      },
    });
    await logAudit({
      userId: req.user?.id,
      action: 'BRANCH_UPDATED',
      entity: 'Branch',
      entityId: branch.id,
      oldValue: existing,
      newValue: branch,
      req,
    });
    return res.json({ message: 'Branch updated successfully.', branch });
  } catch (error) {
    console.error('Update branch error:', error);
    return res.status(500).json({ error: 'Failed to update branch.' });
  }
};

/**
 * Delete single branch with safety checks
 */
const deleteBranch = async (req, res) => {
  const { id } = req.params;
  const staffUserId = req.user?.id;

  try {
    const branchId = parseInt(id, 10);
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        _count: {
          select: { tables: true, menuItems: true, orders: true, users: true, inventoryItems: true }
        }
      }
    });

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found.' });
    }

    // Safety guard: Branches with active orders, staff, or inventory cannot be hard-deleted
    if (branch._count.orders > 0 || branch._count.users > 0 || branch._count.inventoryItems > 0) {
      // Soft-deactivate if has dependencies
      const deactivated = await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: false }
      });

      await logAudit({
        userId: staffUserId,
        action: 'BRANCH_DEACTIVATED',
        entity: 'Branch',
        entityId: branchId,
        oldValue: branch,
        newValue: deactivated,
        req
      });

      return res.json({
        message: `Branch "${branch.name}" contains historical orders/staff/inventory records. It has been safely deactivated instead of deleted.`,
        deactivated: true
      });
    }

    // Otherwise safe to remove empty branch
    await prisma.branch.delete({ where: { id: branchId } });

    await logAudit({
      userId: staffUserId,
      action: 'BRANCH_DELETED',
      entity: 'Branch',
      entityId: branchId,
      oldValue: branch,
      req
    });

    return res.json({ message: `Branch "${branch.name}" deleted successfully.` });
  } catch (error) {
    console.error('Delete branch error:', error);
    return res.status(500).json({ error: 'Failed to delete branch.' });
  }
};

/**
 * Bulk delete or deactivate branches
 */
const bulkDeleteBranches = async (req, res) => {
  const { ids = [] } = req.body;
  const staffUserId = req.user?.id;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Array of branch IDs is required.' });
  }

  try {
    const numericIds = ids.map(i => parseInt(i, 10)).filter(i => !isNaN(i));
    let deletedCount = 0;
    let deactivatedCount = 0;

    for (const bId of numericIds) {
      const b = await prisma.branch.findUnique({
        where: { id: bId },
        include: { _count: { select: { tables: true, menuItems: true, orders: true, users: true, inventoryItems: true } } }
      });
      if (!b) continue;

      if (b._count.orders > 0 || b._count.users > 0 || b._count.inventoryItems > 0) {
        await prisma.branch.update({ where: { id: bId }, data: { isActive: false } });
        deactivatedCount++;
      } else {
        await prisma.branch.delete({ where: { id: bId } });
        deletedCount++;
      }
    }

    await logAudit({
      userId: staffUserId,
      action: 'BULK_BRANCHES_DELETED',
      entity: 'Branch',
      entityId: `bulk_${numericIds.length}`,
      oldValue: { ids: numericIds, deletedCount, deactivatedCount },
      req
    });

    return res.json({
      message: `Processed ${numericIds.length} branches: ${deletedCount} deleted, ${deactivatedCount} deactivated due to active historical records.`,
      deletedCount,
      deactivatedCount
    });
  } catch (error) {
    console.error('Bulk delete branches error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete branches.' });
  }
};

/**
 * Reset Staff Password (Admin Only)
 */
const resetStaffPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const updated = await prisma.user.update({
      where: { id: parseInt(id, 10) },
      data: { password: hashedPassword },
      select: { id: true, name: true, email: true, role: true },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'STAFF_PASSWORD_RESET',
      entity: 'User',
      entityId: updated.id,
      req,
    });

    return res.json({ message: `Password reset successfully for ${updated.name}.` });
  } catch (error) {
    console.error('Reset staff password error:', error);
    return res.status(500).json({ error: 'Failed to reset staff password.' });
  }
};

// UIT Student Roll Number Extractor & Email Validation
const UIT_STUDENT_EMAIL_REGEX = /^[0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5}@students\.uitu\.edu\.pk$/i;

const extractStudentRollNumber = (email) => {
  if (!email || typeof email !== 'string') return null;
  const match = email.trim().match(/^([0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5})@students\.uitu\.edu\.pk$/i);
  return match ? match[1].toUpperCase() : null;
};

const ALLOWED_BLOCK_REASONS = [
  'Suspected fraudulent activity',
  'Payment dispute or chargeback',
  'Repeated false or abusive complaints',
  'Order abuse or repeated policy violations',
  'Account misuse or identity verification concerns',
  'Security or suspicious activity investigation',
  'Other',
];

const ALLOWED_UNBLOCK_REASONS = [
  'Dispute resolved',
  'Payment issue resolved',
  'Identity verified',
  'Incorrect block reversed',
  'Other',
];

/**
 * Customer Roster & Analytics List with Student ID & Block Status
 */
const getCustomerList = async (req, res) => {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        orders: {
          select: {
            id: true,
            orderNumber: true,
            tableId: true,
            tableNumber: true,
            tableLabel: true,
            total: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
            table: { select: { id: true, tableNumber: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          select: {
            id: true,
            tableId: true,
            status: true,
            createdAt: true,
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customerIds = customers.map((c) => String(c.id));
    const blockAuditLogs = await prisma.auditLog.findMany({
      where: {
        entity: 'User',
        entityId: { in: customerIds },
        action: { in: ['STUDENT_BLOCKED', 'STUDENT_UNBLOCKED'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const blockLogMap = new Map();
    const blockHistoryMap = new Map();
    blockAuditLogs.forEach((log) => {
      if (!blockHistoryMap.has(log.entityId)) {
        blockHistoryMap.set(log.entityId, []);
      }
      blockHistoryMap.get(log.entityId).push(log);

      if (!blockLogMap.has(log.entityId) && log.action === 'STUDENT_BLOCKED') {
        blockLogMap.set(log.entityId, log);
      }
    });

    // Fetch dispute records and summary metrics
    const allDisputes = await getAllDisputes();
    const disputeCounts = await getDisputeCounts();

    const customerDisputesMap = new Map();
    allDisputes.forEach((d) => {
      const keyId = d.customerId ? String(d.customerId) : null;
      const keyEmail = (d.customerEmail || '').toLowerCase();
      if (keyId) {
        if (!customerDisputesMap.has(keyId)) customerDisputesMap.set(keyId, []);
        customerDisputesMap.get(keyId).push(d);
      }
      if (keyEmail) {
        if (!customerDisputesMap.has(keyEmail)) customerDisputesMap.set(keyEmail, []);
        customerDisputesMap.get(keyEmail).push(d);
      }
    });

    const formattedCustomers = customers.map((c) => {
      const paidOrders = c.orders.filter(o => ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(o.status));
      const totalSpent = paidOrders.reduce((sum, o) => sum + o.total, 0.0);
      const lastOrder = c.orders.length > 0 ? c.orders[0].createdAt : null;
      const rollNumber = extractStudentRollNumber(c.email);
      const isBlocked = c.isActive === false;

      // Customer specific disputes
      const userDisputesById = customerDisputesMap.get(String(c.id)) || [];
      const userDisputesByEmail = customerDisputesMap.get(c.email?.toLowerCase()) || [];
      const seenDisputeIds = new Set();
      const userDisputes = [];
      [...userDisputesById, ...userDisputesByEmail].forEach((d) => {
        if (!seenDisputeIds.has(d.id)) {
          seenDisputeIds.add(d.id);
          userDisputes.push(d);
        }
      });
      const openDisputes = userDisputes.filter(d => ['OPEN', 'UNDER_REVIEW'].includes(d.status));

      let blockInfo = null;
      if (isBlocked) {
        const latestBlock = blockLogMap.get(String(c.id));
        if (latestBlock) {
          let parsedNew = {};
          try { parsedNew = JSON.parse(latestBlock.newValue || '{}'); } catch {}
          blockInfo = {
            reason: parsedNew.reason || 'Account restricted by administration',
            notes: parsedNew.notes || null,
            blockedAt: latestBlock.createdAt,
            blockedBy: parsedNew.actingAdminName || latestBlock.user?.name || 'Administrator',
          };
        } else {
          blockInfo = {
            reason: 'Account restricted by administration',
            notes: null,
            blockedAt: c.createdAt,
            blockedBy: 'Administrator',
          };
        }
      }

      const history = (blockHistoryMap.get(String(c.id)) || []).map((h) => {
        let details = {};
        try { details = JSON.parse(h.newValue || '{}'); } catch {}
        return {
          id: h.id,
          action: h.action,
          reason: details.reason || 'N/A',
          notes: details.notes || null,
          actingAdmin: details.actingAdminName || h.user?.name || 'Administrator',
          timestamp: h.createdAt,
        };
      });

      return {
        id: c.id,
        name: c.name || 'Guest Customer',
        email: c.email || 'N/A',
        rollNumber,
        isStudent: Boolean(rollNumber),
        totalOrders: c.orders.length,
        paidOrdersCount: paidOrders.length,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        lastOrderDate: lastOrder,
        createdAt: c.createdAt,
        isActive: c.isActive !== false,
        isBlocked,
        blockInfo,
        blockHistory: history,
        disputes: userDisputes,
        openDisputesCount: openDisputes.length,
        hasDisputes: userDisputes.length > 0,
        recentOrders: c.orders.slice(0, 5).map(withTableLabel),
        recentSessions: c.sessions,
      };
    });

    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.isActive !== false).length;
    const blockedCustomers = customers.filter(c => c.isActive === false).length;

    return res.json({
      summary: {
        totalCustomers,
        activeCustomers,
        blockedCustomers,
        openDisputes: disputeCounts.activeCount,
        totalDisputes: disputeCounts.total,
      },
      customers: formattedCustomers,
    });
  } catch (error) {
    console.error('Get customer list error:', error);
    return res.status(500).json({ error: 'Failed to retrieve customer roster.' });
  }
};

/**
 * Block a Student / Customer Account with required reason and audit log
 */
const blockCustomerAccount = async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id, 10);
  const currentUserId = req.user?.id;
  const currentUserName = req.user?.name || 'Administrator';
  const { reason, customExplanation, notes } = req.body;

  if (Number.isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid customer ID.' });
  }

  if (!reason || !ALLOWED_BLOCK_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `Please select a valid block reason from: ${ALLOWED_BLOCK_REASONS.join(', ')}`,
    });
  }

  if (reason === 'Other' && (!customExplanation || !customExplanation.trim())) {
    return res.status(400).json({ error: 'Please provide a written explanation when "Other" is selected.' });
  }

  const effectiveReason = reason === 'Other' ? customExplanation.trim() : reason;
  const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  try {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
    });

    if (!target) {
      return res.status(404).json({ error: 'Customer account not found.' });
    }

    if (target.role !== 'CUSTOMER') {
      return res.status(400).json({ error: 'Only student / customer accounts can be restricted using this action.' });
    }

    if (target.isActive === false) {
      return res.status(400).json({ error: 'This customer account is already blocked.' });
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: false },
    });

    clearUserCache(targetId);

    const rollNumber = extractStudentRollNumber(target.email);

    await logAudit({
      userId: currentUserId,
      action: 'STUDENT_BLOCKED',
      entity: 'User',
      entityId: String(targetId),
      oldValue: JSON.stringify({ isActive: true }),
      newValue: JSON.stringify({
        isActive: false,
        reason: effectiveReason,
        notes: cleanNotes,
        studentEmail: target.email,
        studentRollNumber: rollNumber,
        actingAdminId: currentUserId,
        actingAdminName: currentUserName,
        timestamp: new Date().toISOString(),
      }),
      req,
    });

    emitToAccount(targetId, 'customer:account-blocked', {
      userId: targetId,
      email: target.email,
      action: 'ACCOUNT_BLOCKED',
      reason: effectiveReason,
      message: 'Your student ordering account has been restricted by administration.',
    });

    return res.json({
      message: `Student account ${target.email} (${rollNumber || 'N/A'}) has been successfully blocked.`,
      customer: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        isActive: false,
        isBlocked: true,
        rollNumber,
        blockInfo: {
          reason: effectiveReason,
          notes: cleanNotes,
          blockedAt: new Date(),
          blockedBy: currentUserName,
        },
      },
    });
  } catch (error) {
    console.error('Block customer error:', error);
    return res.status(500).json({ error: 'Failed to block customer account.' });
  }
};

/**
 * Unblock a Student / Customer Account with required reason and audit log
 */
const unblockCustomerAccount = async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id, 10);
  const currentUserId = req.user?.id;
  const currentUserName = req.user?.name || 'Administrator';
  const { reason, customExplanation, notes } = req.body;

  if (Number.isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid customer ID.' });
  }

  if (!reason || !ALLOWED_UNBLOCK_REASONS.includes(reason)) {
    return res.status(400).json({
      error: `Please select a valid unblock reason from: ${ALLOWED_UNBLOCK_REASONS.join(', ')}`,
    });
  }

  if (reason === 'Other' && (!customExplanation || !customExplanation.trim())) {
    return res.status(400).json({ error: 'Please provide a written explanation when "Other" is selected.' });
  }

  const effectiveReason = reason === 'Other' ? customExplanation.trim() : reason;
  const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  try {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
    });

    if (!target) {
      return res.status(404).json({ error: 'Customer account not found.' });
    }

    if (target.role !== 'CUSTOMER') {
      return res.status(400).json({ error: 'Only student / customer accounts can be unblocked using this action.' });
    }

    if (target.isActive === true) {
      return res.status(400).json({ error: 'This customer account is already active.' });
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isActive: true },
    });

    clearUserCache(targetId);

    const rollNumber = extractStudentRollNumber(target.email);

    await logAudit({
      userId: currentUserId,
      action: 'STUDENT_UNBLOCKED',
      entity: 'User',
      entityId: String(targetId),
      oldValue: JSON.stringify({ isActive: false }),
      newValue: JSON.stringify({
        isActive: true,
        reason: effectiveReason,
        notes: cleanNotes,
        studentEmail: target.email,
        studentRollNumber: rollNumber,
        actingAdminId: currentUserId,
        actingAdminName: currentUserName,
        timestamp: new Date().toISOString(),
      }),
      req,
    });

    emitToAccount(targetId, 'customer:account-unblocked', {
      userId: targetId,
      email: target.email,
      action: 'ACCOUNT_UNBLOCKED',
      message: 'Your account restriction has been lifted by administration.',
    });

    return res.json({
      message: `Student account ${target.email} (${rollNumber || 'N/A'}) has been successfully unblocked.`,
      customer: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        isActive: true,
        isBlocked: false,
        rollNumber,
      },
    });
  } catch (error) {
    console.error('Unblock customer error:', error);
    return res.status(500).json({ error: 'Failed to unblock customer account.' });
  }
};

/**
 * Dispute Management Controller Methods
 */
const getDisputes = async (req, res) => {
  try {
    const { status, category, search, customerId, orderNumber, from, to } = req.query;
    const disputes = await getAllDisputes({ status, category, search, customerId, orderNumber, from, to });
    const summary = await getDisputeCounts();
    return res.json({ disputes, summary });
  } catch (err) {
    console.error('Get disputes error:', err);
    return res.status(500).json({ error: 'Failed to retrieve disputes.' });
  }
};

const createAdminDispute = async (req, res) => {
  try {
    const { customerId, customerEmail, customerName, orderId, orderNumber, category, reason, description } = req.body;
    const dispute = await createDispute({
      customerId,
      customerEmail,
      customerName,
      orderId,
      orderNumber,
      category,
      reason,
      description,
    });
    return res.status(201).json({ message: 'Dispute recorded successfully.', dispute });
  } catch (err) {
    console.error('Create dispute error:', err);
    return res.status(400).json({ error: err.message || 'Failed to record dispute.' });
  }
};

const updateDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const updated = await updateDisputeStatusService(id, {
      status,
      resolution,
      resolvedBy: req.user?.name || 'Administrator',
      req,
    });
    return res.json({ message: 'Dispute status updated successfully.', dispute: updated });
  } catch (err) {
    console.error('Update dispute error:', err);
    return res.status(400).json({ error: err.message || 'Failed to update dispute.' });
  }
};

/**
 * Get System-Wide Order Status History Timeline Records
 */
const getOrderStatusHistoryList = async (req, res) => {
  const { orderId, limit = 50 } = req.query;

  try {
    const where = {};
    if (orderId) {
      where.orderId = parseInt(orderId, 10);
    }

    const history = await prisma.orderStatusHistory.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            tableId: true,
            tableNumber: true,
            tableLabel: true,
            table: { select: { id: true, tableNumber: true } },
            total: true,
            status: true,
            paymentMethod: true,
          },
        },
        changedByUser: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10) || 50,
    });

    return res.json({ history: history.map((entry) => ({
      ...entry,
      order: entry.order ? withTableLabel(entry.order) : entry.order,
    })) });
  } catch (error) {
    console.error('Get order status history list error:', error);
    return res.status(500).json({ error: 'Failed to retrieve order status history.' });
  }
};

/**
 * Delete a single Order Status History record
 */
const deleteOrderStatusHistory = async (req, res) => {
  const { id } = req.params;
  const staffUserId = req.user?.id;

  try {
    const historyId = parseInt(id, 10);
    const existing = await prisma.orderStatusHistory.findUnique({ where: { id: historyId } });
    if (!existing) {
      return res.status(404).json({ error: 'Order status history record not found.' });
    }

    await prisma.orderStatusHistory.delete({ where: { id: historyId } });

    await logAudit({
      userId: staffUserId,
      action: 'ORDER_STATUS_HISTORY_DELETED',
      entity: 'OrderStatusHistory',
      entityId: historyId,
      oldValue: existing,
      req
    });

    return res.json({ message: 'Order status history entry deleted successfully.' });
  } catch (error) {
    console.error('Delete order status history error:', error);
    return res.status(500).json({ error: 'Failed to delete status history record.' });
  }
};

/**
 * Bulk delete Order Status History records
 */
const bulkDeleteOrderStatusHistory = async (req, res) => {
  const { ids = [], beforeDate } = req.body;
  const staffUserId = req.user?.id;

  try {
    const where = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids.map(i => parseInt(i, 10)).filter(i => !isNaN(i)) };
    } else if (beforeDate) {
      where.createdAt = { lte: new Date(beforeDate) };
    } else {
      return res.status(400).json({ error: 'Provide either an array of history record ids or a beforeDate cutoff.' });
    }

    const { count } = await prisma.orderStatusHistory.deleteMany({ where });

    await logAudit({
      userId: staffUserId,
      action: 'BULK_ORDER_STATUS_HISTORY_DELETED',
      entity: 'OrderStatusHistory',
      entityId: `bulk_${count}`,
      oldValue: { count, beforeDate, idsCount: ids.length },
      req
    });

    return res.json({ message: `Successfully deleted ${count} status history records.`, count });
  } catch (error) {
    console.error('Bulk delete order status history error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete status history records.' });
  }
};

module.exports = {
  getDashboardStats,
  getAuditLogs,
  deleteAuditLog,
  bulkDeleteAuditLogs,
  getStaffList,
  createStaff,
  updateStaff,
  updateStaffRole,
  toggleStaffStatus,
  deleteStaffAccount,
  bulkDeleteStaff,
  resetStaffPassword,
  getCustomerList,
  blockCustomerAccount,
  unblockCustomerAccount,
  deleteCustomerAccount,
  bulkDeleteCustomers,
  getOrderStatusHistoryList,
  deleteOrderStatusHistory,
  bulkDeleteOrderStatusHistory,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  bulkDeleteBranches,
  clearDashboardStatsCache,
  getDisputes,
  createAdminDispute,
  updateDispute,
};
