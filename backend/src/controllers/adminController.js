const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');
const supabaseAdmin = require('../config/supabaseAdmin');
const { emitToAccount } = require('../sockets/socket');
const { clearUserCache } = require('../middleware/authMiddleware');

/**
 * Helper: sync a user action to Supabase Auth (silent fail if admin client not ready)
 */
async function syncToSupabaseAuth(action, payload) {
  if (!supabaseAdmin) return null;
  try {
    let result;
    if (action === 'create') {
      result = await supabaseAdmin.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: { name: payload.name, role: payload.role },
      });
    } else if (action === 'updatePassword') {
      result = await supabaseAdmin.auth.admin.updateUserById(payload.supabaseId, {
        password: payload.password,
      });
    } else if (action === 'ban') {
      result = await supabaseAdmin.auth.admin.updateUserById(payload.supabaseId, {
        ban_duration: payload.banned ? '876000h' : 'none',
      });
    } else if (action === 'updateRole') {
      result = await supabaseAdmin.auth.admin.updateUserById(payload.supabaseId, {
        user_metadata: { role: payload.role },
      });
    }
    if (result?.error) console.warn('⚠️  Supabase Auth sync warning:', result.error.message);
    return result?.data || null;
  } catch (err) {
    console.warn('⚠️  Supabase Auth sync error:', err.message);
    return null;
  }
}

const dashboardStatsCache = new Map();
const DASHBOARD_CACHE_TTL_MS = 15 * 1000; // 15s fast cache

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
    if (!from && !to) dateFilter.gte = startDate;
    const branchFilter = (branchId && branchId !== 'all') ? { branchId: parseInt(branchId, 10) } : {};
    const dashboardOrderWhere = { createdAt: dateFilter, ...branchFilter };

    // Execute all dashboard queries concurrently for max performance
    const [
      paidOrders,
      activeOrdersCount,
      users,
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
        select: { id: true, total: true, paymentMethod: true, status: true, createdAt: true },
      }),
      // 2. Active Queue Count
      prisma.order.count({
        where: {
          status: { in: ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'] },
          ...branchFilter,
        },
      }),
      // 3. User & Staff Statistics
      prisma.user.findMany({
        select: { role: true, isActive: true },
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
          user: { select: { name: true, email: true } },
          orderItems: { include: { menuItem: true } },
        },
      }),
      // 6. Menu Items
      prisma.menuItem.findMany({
        where: branchFilter,
        include: { recipeItems: { include: { inventoryItem: true } } },
      }),
      // 7. Paid Order Items for top selling analysis
      prisma.orderItem.findMany({
        where: {
          order: {
            status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
            ...dashboardOrderWhere,
          },
        },
        include: { menuItem: true },
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

    const userStats = {
      customer: users.filter(u => u.role === 'CUSTOMER').length,
      vendor: users.filter(u => u.role === 'VENDOR').length,
      kitchen: users.filter(u => u.role === 'KITCHEN').length,
      admin: users.filter(u => u.role === 'ADMIN').length,
      activeStaff: users.filter(u => u.role !== 'CUSTOMER' && u.isActive !== false).length,
    };

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
    paidOrderItems.forEach((item) => {
      const name = item.nameSnapshot || item.menuItem?.name || `Item #${item.menuItemId}`;
      if (!itemAgg[name]) {
        itemAgg[name] = { name, quantity: 0, revenue: 0, category: item.menuItem?.category || 'General' };
      }
      itemAgg[name].quantity += item.quantity;
      itemAgg[name].revenue += (item.priceSnapshot || 0) * item.quantity;
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
      const first = from ? new Date(`${from}T00:00:00`) : paidOrders.reduce((earliest, order) => new Date(order.createdAt) < earliest ? new Date(order.createdAt) : earliest, new Date());
      const last = to ? new Date(`${to}T00:00:00`) : paidOrders.reduce((latest, order) => new Date(order.createdAt) > latest ? new Date(order.createdAt) : latest, new Date());
      const spanDays = Math.max(0, Math.ceil((last - first) / (24 * 60 * 60 * 1000)));
      const monthly = period === 'all' || spanDays > 92;
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
    revenueTimeline = revenueTimeline.map(r => ({ ...r, revenue: parseFloat(r.revenue.toFixed(2)) }));

    const payload = {
      period,
      branchId: branchId || 'all',
      metrics: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalOrdersCount: completedOrdersCount,
        averageOrderValue,
        activeOrdersCount,
        usersCount: users.length,
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
      recentOrders,
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

    // Sync to Supabase Auth so real account appears in Supabase dashboard
    const authUser = await syncToSupabaseAuth('create', {
      email: normalizedEmail,
      password,
      name: name.trim(),
      role: role.toUpperCase(),
    });
    if (authUser?.user?.id) {
      console.log(`✅ Supabase Auth synced: ${normalizedEmail} (${authUser.user.id})`);
    } else {
      console.warn(`⚠️  Supabase Auth sync skipped for: ${normalizedEmail}`);
    }

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
 * Change Staff Role (Admin Only) — updates Prisma + Supabase Auth metadata
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
    // Get current user to find Supabase Auth ID by email
    const current = await prisma.user.findUnique({ where: { id: targetId } });
    if (!current) return res.status(404).json({ error: 'Staff member not found.' });

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { role: role.toUpperCase() },
      select: { id: true, name: true, email: true, role: true, isActive: true, isDemo: true, createdAt: true },
    });

    // Sync role to Supabase Auth metadata if admin client is available
    if (supabaseAdmin) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.email === current.email);
      if (authUser) {
        await syncToSupabaseAuth('updateRole', { supabaseId: authUser.id, role: role.toUpperCase() });
      }
    }

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

    // Sync ban status to Supabase Auth
    if (supabaseAdmin && target) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.email === target.email);
      if (authUser) {
        await syncToSupabaseAuth('ban', { supabaseId: authUser.id, banned: !isActive });
      }
    }

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

      if (supabaseAdmin) {
        const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
        const authUser = authUsers?.users?.find(u => u.email === target.email);
        if (authUser) {
          await syncToSupabaseAuth('ban', { supabaseId: authUser.id, banned: true });
        }
      }

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

    if (supabaseAdmin) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.email === target.email);
      if (authUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      }
    }

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

    // Sync new password to Supabase Auth
    if (supabaseAdmin) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(u => u.email === updated.email);
      if (authUser) {
        await syncToSupabaseAuth('updatePassword', { supabaseId: authUser.id, password });
      }
    }

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

/**
 * Customer Roster & Analytics List
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
            total: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
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

    const formattedCustomers = customers.map((c) => {
      const paidOrders = c.orders.filter(o => ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(o.status));
      const totalSpent = paidOrders.reduce((sum, o) => sum + o.total, 0.0);
      const lastOrder = c.orders.length > 0 ? c.orders[0].createdAt : null;

      return {
        id: c.id,
        name: c.name || 'Guest Customer',
        email: c.email || 'N/A',
        totalOrders: c.orders.length,
        paidOrdersCount: paidOrders.length,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        lastOrderDate: lastOrder,
        createdAt: c.createdAt,
        isActive: c.isActive !== false,
        recentOrders: c.orders.slice(0, 5),
        recentSessions: c.sessions,
      };
    });

    return res.json({ customers: formattedCustomers });
  } catch (error) {
    console.error('Get customer list error:', error);
    return res.status(500).json({ error: 'Failed to retrieve customer roster.' });
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
          select: { id: true, orderNumber: true, tableId: true, total: true, status: true, paymentMethod: true },
        },
        changedByUser: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10) || 50,
    });

    return res.json({ history });
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
};
