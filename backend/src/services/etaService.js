const axios = require('axios');
const { prisma } = require('../config/db');
const exceptionLogger = require('../utils/exceptionLogger');

/**
 * Calculates the Estimated Time of Arrival (ETA) for a set of menu items.
 * Uses a hybrid approach:
 * Step 1: Restaurant base prep time using parallel cooking logic + quantity handling overhead.
 * Step 2: AI model adjusts ETA using queue length, peak hour, kitchen load, and closed-loop historical delays.
 * @param {Array<{menuItemId: number, quantity: number}>} items 
 * @returns {Promise<{estimatedTime: number, estimatedBill: number, kitchenLoad: string, explanation: string, baseEta: number, adjustedEta: number, queueLength: number, isPeakHour: boolean, historicalDelay: number}>}
 */
// No kitchen-capacity setting exists in the current schema/config. Keep the
// assumed parallel capacity explicit and environment-overridable.
const KITCHEN_PARALLEL_CAPACITY = Math.max(1, Number(process.env.ETA_KITCHEN_CAPACITY) || 4);
const KITCHEN_CAPACITY_WINDOW_MINUTES = 60;
const MAX_ETA_MINUTES = 60; // Cap at 60 min — 120 was hitting the ceiling too often

const calculateETA = async (items) => {
  try {
    if (!items || items.length === 0) {
      return {
        estimatedTime: 0,
        estimatedBill: 0,
        kitchenLoad: 'Low',
        explanation: 'No items in the order.',
        baseEta: 0,
        adjustedEta: 0,
        queueLength: 0,
        isPeakHour: false,
        historicalDelay: 0,
        orderLoadMinutes: 0,
        queueLoadMinutes: 0,
        kitchenCapacity: KITCHEN_PARALLEL_CAPACITY,
        workloadPercent: 0
      };
    }

    // Resolve validated cart lines and their configured preparation times.
    const normalizedItems = items
      .map((item) => ({
        menuItemId: Number.parseInt(item?.menuItemId, 10),
        quantity: Number.parseInt(item?.quantity, 10),
      }))
      .filter((item) => Number.isInteger(item.menuItemId) && item.menuItemId > 0 && Number.isInteger(item.quantity) && item.quantity > 0);

    if (!normalizedItems.length) {
      return {
        estimatedTime: 0, estimatedBill: 0, kitchenLoad: 'Low',
        explanation: 'No valid items in the order.', baseEta: 0, adjustedEta: 0,
        queueLength: 0, isPeakHour: false, historicalDelay: 0,
        orderLoadMinutes: 0, queueLoadMinutes: 0, kitchenCapacity: KITCHEN_PARALLEL_CAPACITY,
        workloadPercent: 0,
      };
    }

    const menuItemIds = [...new Set(normalizedItems.map(i => i.menuItemId))];
    const dbMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } }
    });

    const menuMap = {};
    dbMenuItems.forEach(item => {
      menuMap[item.id] = item;
    });

    let maxPrepTime = 0;
    let orderLoadMinutes = 0;
    let totalBill = 0;

    normalizedItems.forEach(item => {
      const dbItem = menuMap[item.menuItemId];
      if (dbItem) {
        totalBill += dbItem.price * item.quantity;
        const itemPrepTime = Math.max(1, Number(dbItem.prepTime) || 5);
        maxPrepTime = Math.max(maxPrepTime, itemPrepTime);
        orderLoadMinutes += itemPrepTime * item.quantity;
      }
    });

    // Count active orders and sum their remaining configured kitchen work.
    // Only count orders placed in the last 3 hours to avoid stale/stuck orders
    // inflating the queue (e.g., orders that stayed PREPARING for days).
    const staleThreshold = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PAID', 'PREPARING'] },
        createdAt: { gte: staleThreshold }
      },
      select: {
        orderItems: {
          select: {
            quantity: true,
            menuItem: { select: { prepTime: true } },
          },
        },
      },
    });
    const queueLength = activeOrders.length;
    const queueLoadMinutes = activeOrders.reduce((orderTotal, order) => (
      orderTotal + (order.orderItems || []).reduce((itemTotal, orderItem) => (
        itemTotal + Math.max(1, Number(orderItem.menuItem?.prepTime) || 5) * Math.max(0, Number(orderItem.quantity) || 0)
      ), 0)
    ), 0);

    // Four parallel kitchen work units over a 60-minute planning window is the
    // documented default until the project has a configured kitchen capacity.
    const capacityMinutes = KITCHEN_PARALLEL_CAPACITY * KITCHEN_CAPACITY_WINDOW_MINUTES;
    const workloadPercent = capacityMinutes > 0
      ? ((queueLoadMinutes + orderLoadMinutes) / capacityMinutes) * 100
      : 100;
    const kitchenLoad = workloadPercent < 40 ? 'Low' : workloadPercent <= 75 ? 'Medium' : 'High';

    // Own work and queued work both consume the same parallel kitchen capacity.
    const baseEta = Math.max(maxPrepTime, orderLoadMinutes / KITCHEN_PARALLEL_CAPACITY);

    // 3. Determine peak hour factor
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const isPeakHour = (hour === 12 || hour === 13 || hour === 18 || hour === 19) ? 1 : 0;
    const peakEtaAdjustment = isPeakHour ? 3.5 : 0;

    // 5. Fetch closed-loop historical delay from eTAPrediction
    // (Average error between actualTime and adjustedEta for the last 10 completed orders)
    const recentPredictions = await prisma.eTAPrediction.findMany({
      where: {
        actualTime: { not: null }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    let historicalDelay = 0;
    if (recentPredictions.length > 0) {
      const totalDelay = recentPredictions.reduce((sum, pred) => sum + (pred.actualTime - pred.adjustedEta), 0);
      historicalDelay = totalDelay / recentPredictions.length;
    }

    // 6. Predict ETA using AI (FastAPI RandomForestRegressor)
    let aiAdjustment = 0;
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const response = await axios.post(`${aiServiceUrl}/predict-eta`, {
        base_eta: baseEta,
        queue_length: queueLength,
        hour: hour,
        day_of_week: dayOfWeek,
        is_peak_hour: isPeakHour,
        kitchen_load: kitchenLoad === 'Low' ? 0 : kitchenLoad === 'Medium' ? 1 : 2,
        historical_delay: historicalDelay
      }, { timeout: 2000 });

      const aiEstimate = Number(response.data?.estimated_time);
      if (Number.isFinite(aiEstimate)) {
        // Preserve a small AI correction without allowing it to erase the
        // quantity- and queue-aware deterministic estimate.
        aiAdjustment = Math.max(-2, Math.min(5, aiEstimate - baseEta));
      }
      exceptionLogger.log('info', 'ai.eta', 'AI ETA adjustment received');
    } catch (aiError) {
      // The deterministic estimate remains available when the model is down.
      exceptionLogger.exception('ai.eta', aiError, { level: 'warn', context: { action: 'fallback', code: aiError.code } });
    }

    const rawEstimatedTime = Math.max(
      maxPrepTime,
      (orderLoadMinutes + queueLoadMinutes) / KITCHEN_PARALLEL_CAPACITY + peakEtaAdjustment + historicalDelay + aiAdjustment
    );
    const estimatedTime = Math.min(MAX_ETA_MINUTES, Math.max(maxPrepTime, Math.round(rawEstimatedTime / 5) * 5));

    // Clean description/explanation
    const queueText = queueLength === 0 
      ? 'no active orders' 
      : `${queueLength} active order${queueLength > 1 ? 's' : ''}`;
    
    const peakText = isPeakHour 
      ? 'during peak dining hours' 
      : 'during standard hours';
      
    const loadText = `Kitchen load is ${kitchenLoad}`;
    const explanation = `${loadText} with ${queueText} ${peakText}. Estimate includes this order, the active kitchen queue, and ${KITCHEN_PARALLEL_CAPACITY} parallel kitchen work units.`;

    return {
      estimatedTime,
      estimatedBill: Math.round(totalBill),
      kitchenLoad,
      explanation,
      baseEta,
      adjustedEta: estimatedTime,
      queueLength,
      isPeakHour: isPeakHour === 1,
      historicalDelay,
      orderLoadMinutes,
      queueLoadMinutes,
      kitchenCapacity: KITCHEN_PARALLEL_CAPACITY,
      workloadPercent: Math.round(workloadPercent),
    };
  } catch (error) {
    console.error('Error in etaService:', error);
    throw error;
  }
};

module.exports = {
  calculateETA
};
