const { generateRealAIInsightsWithGroq, callGroqAPI, getGroqModel } = require('../services/groqService');
const { prisma } = require('../config/db');
const { isValid } = require('../utils/statusValues');
const { Prisma } = require('@prisma/client');
const { getInventoryForecast } = require('../services/aiService');
const { emitToAdmin, emitToVendor } = require('../sockets/socket');
const { convertUnit } = require('../utils/unitConverter');
const { parseAndMatchInvoice } = require('../services/aiOcrService');
const { logAudit } = require('../middleware/auditMiddleware');
const { inferCategoryFromItemName } = require('../utils/categoryHelper');
const { saveLearnedAlias, getLearnedAliases } = require('../services/aliasService');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL for cached ML forecasts
const roundReceivingMoney = (value) => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? Math.round((numericValue + Number.EPSILON) * 100) / 100 : Number.NaN;
};

/**
 * Get cached forecast from DB or invoke ML prediction and persist result
 */
const getOrCalculateForecast = async (item, historicalSales, features, forceRefresh = false) => {
  const now = new Date();

  if (!forceRefresh) {
    const existing = await prisma.demandForecast.findUnique({
      where: { menuItemName: item.name }
    }).catch(() => null);

    if (existing && (now.getTime() - new Date(existing.updatedAt).getTime()) < CACHE_TTL_MS) {
      let savedFeatures = {};
      try {
        savedFeatures = JSON.parse(existing.features || '{}');
      } catch {
        // Forecast feature metadata is optional; the cached prediction is still usable.
      }

      return {
        forecast: existing.predictedQty,
        confidence: existing.confidence || 0.8,
        percentChange: savedFeatures.percentChange || 0.0,
        source: 'database-cache'
      };
    }
  }

  // Calculate fresh forecast from ML service or fallback
  const prediction = await getInventoryForecast(item.name, historicalSales, features);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  await prisma.demandForecast.upsert({
    where: { menuItemName: item.name },
    update: {
      forecastDate: tomorrow,
      predictedQty: prediction.forecast,
      confidence: prediction.confidence || 0.8,
      features: JSON.stringify({
        ...features,
        percentChange: prediction.percentChange || 0.0,
        source: prediction.source
      })
    },
    create: {
      menuItemName: item.name,
      forecastDate: tomorrow,
      predictedQty: prediction.forecast,
      confidence: prediction.confidence || 0.8,
      features: JSON.stringify({
        ...features,
        percentChange: prediction.percentChange || 0.0,
        source: prediction.source
      })
    }
  }).catch((err) => console.warn(`DemandForecast upsert warning for ${item.name}:`, err.message));

  return prediction;
};

/**
 * Summary metrics cards for inventory overview
 */
const getInventorySummary = async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      include: { supplier: true }
    });

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let lowStockCount = 0;
    let criticalCount = 0;
    let totalValuation = 0.0;
    let expiringCount = 0;

    for (const item of items) {
      if (item.stockLevel <= item.minThreshold) {
        lowStockCount++;
      }
      if (item.stockLevel <= (item.minThreshold / 2)) {
        criticalCount++;
      }
      totalValuation += item.stockLevel * (item.costPrice || 0);

      if (item.expiryDate && new Date(item.expiryDate) <= sevenDaysFromNow) {
        expiringCount++;
      }
    }

    return res.json({
      totalItems: items.length,
      lowStockCount,
      criticalCount,
      totalValuation,
      expiringCount
    });
  } catch (error) {
    console.error('Fetch inventory summary error:', error);
    return res.status(500).json({ error: 'Failed to retrieve inventory summary.' });
  }
};

/**
 * Get all inventory items with filtering
 */
const getInventoryItems = async (req, res) => {
  const { search, category, branchId } = req.query;

  try {
    const where = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (category) {
      where.category = category;
    }
    if (branchId) {
      where.branchId = parseInt(branchId, 10);
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        supplier: true,
        branch: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });

    // Deduplicate: if the same item name appears multiple times (e.g. across branches or
    // due to manual duplicates), merge them into a single canonical record.
    // We keep the record with the highest stockLevel as the primary, and sum up stock.
    if (!branchId) {
      const seen = new Map();
      for (const item of items) {
        const key = item.name.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { ...item });
        } else {
          // Merge: sum stock levels, keep other fields from the first (primary) record
          const existing = seen.get(key);
          existing.stockLevel = (parseFloat(existing.stockLevel) || 0) + (parseFloat(item.stockLevel) || 0);
          // Use the lower minThreshold (more conservative)
          existing.minThreshold = Math.min(
            parseFloat(existing.minThreshold) || 0,
            parseFloat(item.minThreshold) || 0
          );
          // If current has a supplier and primary doesn't, use current's supplier
          if (!existing.supplier && item.supplier) {
            existing.supplier = item.supplier;
            existing.supplierId = item.supplierId;
          }
        }
      }
      const deduped = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ items: deduped });
    }

    return res.json({ items });
  } catch (error) {
    console.error('Fetch inventory error:', error);
    return res.status(500).json({ error: 'Failed to retrieve inventory items.' });
  }
};

/**
 * Add a new inventory item
 */
const addInventoryItem = async (req, res) => {
    const {
      name,
      stockLevel,
      unit,
      minThreshold,
      maxThreshold,
      category,
      sku,
      costPrice,
      expiryDate,
      supplierId,
      branchId,
      packageConversions
    } = req.body;

  if (!name || !unit) {
    return res.status(400).json({ error: 'Name and unit are required.' });
  }

  try {
    let resolvedBranchId = branchId ? parseInt(branchId, 10) : (req.user?.branchId || null);
    if (resolvedBranchId) {
      const bExists = await prisma.branch.findUnique({ where: { id: resolvedBranchId } });
      if (!bExists) {
        const firstB = await prisma.branch.findFirst({ select: { id: true } });
        resolvedBranchId = firstB ? firstB.id : 1;
      }
    } else {
      const firstB = await prisma.branch.findFirst({ select: { id: true } });
      resolvedBranchId = firstB ? firstB.id : 1;
    }

    // Check branch uniqueness (case-insensitive)
    const existingSameBranch = await prisma.inventoryItem.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        branchId: resolvedBranchId
      }
    });

    if (existingSameBranch) {
      return res.status(400).json({
        error: `An inventory item named "${name}" already exists for this branch.`,
        existingItem: existingSameBranch
      });
    }

    // Check SKU uniqueness if provided
    if (sku && String(sku).trim()) {
      const existingSku = await prisma.inventoryItem.findFirst({
        where: {
          sku: String(sku).trim(),
          branchId: resolvedBranchId
        }
      });
      if (existingSku) {
        return res.status(400).json({
          error: `SKU "${sku}" is already assigned to item "${existingSku.name}".`,
          existingItem: existingSku
        });
      }
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        stockLevel: stockLevel ? parseFloat(stockLevel) : 0.0,
        unit,
        minThreshold: minThreshold ? parseFloat(minThreshold) : 10.0,
        maxThreshold: maxThreshold ? parseFloat(maxThreshold) : 100.0,
        category: (category && category !== 'General') ? category : inferCategoryFromItemName(name),
        sku: sku || null,
        costPrice: costPrice ? parseFloat(costPrice) : 0.0,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        packageConversions: packageConversions && typeof packageConversions === 'object' ? packageConversions : null,
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
        branchId: resolvedBranchId
      },
      include: { supplier: true, branch: true }
    });

    if (stockLevel && parseFloat(stockLevel) > 0) {
      await prisma.inventoryLog.create({
        data: {
          inventoryItemId: item.id,
          quantityBefore: 0.0,
          quantityAfter: parseFloat(stockLevel),
          changeQty: parseFloat(stockLevel),
          type: 'RESTOCK',
          reason: 'Initial stock load',
          cost: (costPrice ? parseFloat(costPrice) : 0.0) * parseFloat(stockLevel),
          userId: req.user.id
        }
      });
    }

    emitToAdmin('inventory:update', item);
    emitToVendor('inventory:update', item);
    return res.status(201).json({ message: 'Inventory item added successfully.', item });
  } catch (error) {
    console.error('Add inventory item error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'An inventory item with this name already exists in this branch.' });
    }
    return res.status(500).json({ error: 'Failed to add inventory item.' });
  }
};

/**
 * Update an existing inventory item
 */
const updateInventoryItem = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    unit,
    minThreshold,
    maxThreshold,
    category,
    sku,
    costPrice,
    expiryDate,
    supplierId,
    branchId,
    packageConversions
  } = req.body;

  try {
    const existing = await prisma.inventoryItem.findUnique({
      where: { id: parseInt(id, 10) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name } : {}),
        ...(unit ? { unit } : {}),
        ...(minThreshold !== undefined ? { minThreshold: parseFloat(minThreshold) } : {}),
        ...(maxThreshold !== undefined ? { maxThreshold: parseFloat(maxThreshold) } : {}),
        ...(category ? { category } : {}),
        ...(sku !== undefined ? { sku } : {}),
        ...(costPrice !== undefined ? { costPrice: parseFloat(costPrice) } : {}),
        ...(expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
        ...(supplierId !== undefined ? { supplierId: supplierId ? parseInt(supplierId, 10) : null } : {}),
        ...(branchId !== undefined ? { branchId: parseInt(branchId, 10) } : {}),
        ...(packageConversions !== undefined ? { packageConversions } : {})
      },
      include: { supplier: true, branch: true }
    });

    emitToAdmin('inventory:update', updated);
    emitToVendor('inventory:update', updated);
    return res.json({ message: 'Inventory item updated successfully.', item: updated });
  } catch (error) {
    console.error('Update inventory item error:', error);
    return res.status(500).json({ error: 'Failed to update inventory item.' });
  }
};

/**
 * Delete an inventory item (and related logs/recipes safely)
 */
const deleteInventoryItem = async (req, res) => {
  const { id } = req.params;

  try {
    const invId = parseInt(id, 10);
    const existing = await prisma.inventoryItem.findUnique({
      where: { id: invId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    // Clean up dependent records safely in transaction
    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({ where: { inventoryItemId: invId } });
      await tx.inventoryLog.deleteMany({ where: { inventoryItemId: invId } });
      await tx.inventoryReceivingItem.deleteMany({ where: { inventoryItemId: invId } });
      await tx.inventoryItem.delete({ where: { id: invId } });
    });

    emitToAdmin('inventory:delete', { id: invId });
    emitToVendor('inventory:delete', { id: invId });
    logAudit(req.user?.id || 1, 'DELETE_ITEM', 'InventoryItem', invId, { name: existing.name });

    return res.json({ message: `Inventory item "${existing.name}" deleted successfully.` });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    return res.status(500).json({ error: 'Failed to delete inventory item.' });
  }
};

const bulkDeleteInventoryItems = async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Please select inventory items to delete.' });
  }

  try {
    const itemIds = ids.map((id) => parseInt(id, 10)).filter(Boolean);
    let deletedCount = 0;

    for (const invId of itemIds) {
      const existing = await prisma.inventoryItem.findUnique({ where: { id: invId } });
      if (!existing) continue;

      await prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({ where: { inventoryItemId: invId } });
        await tx.inventoryLog.deleteMany({ where: { inventoryItemId: invId } });
        await tx.inventoryReceivingItem.deleteMany({ where: { inventoryItemId: invId } });
        await tx.inventoryItem.delete({ where: { id: invId } });
      });

      emitToAdmin('inventory:delete', { id: invId });
      emitToVendor('inventory:delete', { id: invId });
      deletedCount++;
    }

    logAudit(req.user?.id || 1, 'BULK_DELETE_ITEMS', 'InventoryItem', null, { count: deletedCount });

    return res.json({
      message: `Successfully deleted ${deletedCount} inventory item(s).`,
      count: deletedCount,
    });
  } catch (error) {
    console.error('Bulk delete inventory items error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete inventory items.' });
  }
};

/**
 * Perform Stock In (Purchase/Delivery receiving)
 */
const stockIn = async (req, res) => {
  const { inventoryItemId, quantity, batchNumber, expiryDate, supplierId, unitCost, notes } = req.body;

  if (!inventoryItemId || quantity === undefined || parseFloat(quantity) <= 0) {
    return res.status(400).json({ error: 'Valid item and positive quantity are required.' });
  }

  try {
    const updatedItem = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id: parseInt(inventoryItemId, 10) }
      });

      if (!item) {
        throw new Error('Inventory item not found.');
      }

      const addQty = parseFloat(quantity);
      const qtyBefore = item.stockLevel;
      const qtyAfter = qtyBefore + addQty;
      const purchaseUnitCost = unitCost !== undefined && parseFloat(unitCost) > 0 ? parseFloat(unitCost) : (item.costPrice || 0);

      // Weighted-Average Costing calculation
      let calculatedCostPrice = item.costPrice || 0;
      if (qtyAfter > 0) {
        if (qtyBefore <= 0) {
          calculatedCostPrice = purchaseUnitCost;
        } else {
          const prevTotalValue = qtyBefore * (item.costPrice || 0);
          const purchaseTotalValue = addQty * purchaseUnitCost;
          calculatedCostPrice = (prevTotalValue + purchaseTotalValue) / qtyAfter;
          calculatedCostPrice = Math.round(calculatedCostPrice * 10000) / 10000;
        }
      }

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          stockLevel: qtyAfter,
          costPrice: calculatedCostPrice,
          ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
          ...(supplierId ? { supplierId: parseInt(supplierId, 10) } : {})
        },
        include: { supplier: true }
      });

      await tx.inventoryLog.create({
        data: {
          inventoryItemId: item.id,
          quantityBefore: qtyBefore,
          quantityAfter: qtyAfter,
          changeQty: addQty,
          type: 'PURCHASE',
          reason: notes || `Stock In - Received ${addQty} ${item.unit}`,
          cost: purchaseUnitCost * addQty,
          batchNumber: batchNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          supplierId: supplierId ? parseInt(supplierId, 10) : item.supplierId,
          userId: req.user.id
        }
      });

      return updated;
    });

    emitToAdmin('inventory:update', updatedItem);
    emitToVendor('inventory:update', updatedItem);
    return res.json({ message: 'Stock received successfully.', item: updatedItem });
  } catch (error) {
    console.error('Stock In error:', error.message);
    return res.status(400).json({ error: error.message || 'Failed to process Stock In.' });
  }
};

/**
 * Stock Adjustment or Waste Recording
 */
const adjustStock = async (req, res) => {
  const { inventoryItemId, type = 'WASTE', changeQty, reason, notes } = req.body;
  const numericChange = Number(changeQty);
  const adjustmentReason = String(reason || notes || '').trim();

  if (!Number.isInteger(Number(inventoryItemId)) || Number(inventoryItemId) <= 0 || !Number.isFinite(numericChange) || numericChange === 0) {
    return res.status(400).json({ error: 'Valid item and non-zero adjustment quantity are required.' });
  }
  if (!adjustmentReason) return res.status(400).json({ error: 'A reason is required for every stock adjustment.' });

  const validTypes = ['WASTE', 'CORRECTION', 'RESTOCK', 'EXPIRATION', 'DAMAGE'];
  const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
  const logType = validTypes.includes(normalizedType) ? normalizedType : 'CORRECTION';

  try {
    const updatedItem = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" = ${Number(inventoryItemId)} FOR UPDATE`);
      const item = await tx.inventoryItem.findUnique({
        where: { id: parseInt(inventoryItemId, 10) }
      });

      if (!item) {
        throw new Error('Inventory item not found.');
      }

      const delta = numericChange;
      const qtyBefore = Number(item.stockLevel);
      const qtyAfter = qtyBefore + delta;
      if (!Number.isFinite(qtyBefore) || !Number.isFinite(qtyAfter) || qtyAfter < 0) {
        throw new Error(`Adjustment would make ${item.name} stock negative. Current stock is ${qtyBefore} ${item.unit}.`);
      }

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { stockLevel: { increment: delta } },
        include: { supplier: true }
      });

      await tx.inventoryLog.create({
        data: {
          inventoryItemId: item.id,
          quantityBefore: qtyBefore,
          quantityAfter: qtyAfter,
          changeQty: delta,
          type: logType,
          reason: adjustmentReason,
          cost: Math.abs(delta) * item.costPrice,
          userId: req.user.id
        }
      });

      return updated;
    });

    emitToAdmin('inventory:update', updatedItem);
    emitToVendor('inventory:update', updatedItem);
    return res.json({ message: 'Stock adjusted successfully.', item: updatedItem });
  } catch (error) {
    console.error('Stock adjustment error:', error.message);
    return res.status(400).json({ error: error.message || 'Failed to adjust stock.' });
  }
};

/**
 * Legacy/Simple restock endpoint preserved for backward compatibility
 */
const restockItem = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined || parseFloat(quantity) <= 0) {
    return res.status(400).json({ error: 'Restock quantity must be greater than zero.' });
  }

  req.body.inventoryItemId = id;
  req.body.type = 'RESTOCK';
  req.body.changeQty = quantity;
  return adjustStock(req, res);
};

/**
 * Get Recipe for a specific MenuItem
 */
const getRecipeForMenuItem = async (req, res) => {
  const { menuItemId } = req.params;

  try {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: parseInt(menuItemId, 10) },
      include: {
        recipeItems: {
          include: { inventoryItem: true }
        },
        branch: true
      }
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    return res.json({ menuItem });
  } catch (error) {
    console.error('Fetch recipe error:', error);
    return res.status(500).json({ error: 'Failed to retrieve recipe.' });
  }
};

/**
 * Save/Update Recipe ingredients for a MenuItem
 */
const saveRecipeForMenuItem = async (req, res) => {
  const { menuItemId } = req.params;
  const { ingredients } = req.body; // Array of { inventoryItemId, quantity, unit }

  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'Ingredients array is required.' });
  }

  try {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: parseInt(menuItemId, 10) }
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    // Branch consistency validation
    for (const ing of ingredients) {
      const invItem = await prisma.inventoryItem.findUnique({
        where: { id: parseInt(ing.inventoryItemId, 10) }
      });

      if (!invItem) {
        return res.status(404).json({ error: `Inventory item ID ${ing.inventoryItemId} not found.` });
      }

      if (menuItem.branchId && invItem.branchId && menuItem.branchId !== invItem.branchId) {
        return res.status(400).json({
          error: `Branch mismatch: MenuItem branch (${menuItem.branchId}) does not match InventoryItem "${invItem.name}" branch (${invItem.branchId}).`
        });
      }
    }

    // Replace existing recipe items atomically inside a transaction
    await prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({
        where: { menuItemId: menuItem.id }
      });

      for (const ing of ingredients) {
        await tx.recipeItem.create({
          data: {
            menuItemId: menuItem.id,
            inventoryItemId: parseInt(ing.inventoryItemId, 10),
            quantity: parseFloat(ing.quantity),
            unit: ing.unit || 'PCS'
          }
        });
      }
    });

    const updated = await prisma.menuItem.findUnique({
      where: { id: menuItem.id },
      include: {
        recipeItems: { include: { inventoryItem: true } }
      }
    });

    return res.json({ message: 'Recipe updated successfully.', menuItem: updated });
  } catch (error) {
    console.error('Save recipe error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save recipe.' });
  }
};

/**
 * Delete a recipe mapped to a menu item (clears all recipeItems)
 */
const deleteRecipeForMenuItem = async (req, res) => {
  const { menuItemId } = req.params;
  try {
    const mId = parseInt(menuItemId, 10);
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: mId },
      include: { recipeItems: true }
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    const { count } = await prisma.recipeItem.deleteMany({
      where: { menuItemId: mId }
    });

    return res.json({
      message: `Recipe for "${menuItem.name}" deleted successfully (${count} ingredients removed).`,
      count
    });
  } catch (error) {
    console.error('Delete recipe error:', error);
    return res.status(500).json({ error: 'Failed to delete recipe.' });
  }
};

/**
 * Bulk delete recipes for multiple menu items
 */
const bulkDeleteRecipes = async (req, res) => {
  const { menuItemIds = [] } = req.body;
  if (!Array.isArray(menuItemIds) || menuItemIds.length === 0) {
    return res.status(400).json({ error: 'Array of menuItemIds is required.' });
  }

  try {
    const ids = menuItemIds.map(i => parseInt(i, 10)).filter(i => !isNaN(i));
    const { count } = await prisma.recipeItem.deleteMany({
      where: { menuItemId: { in: ids } }
    });

    return res.json({
      message: `Successfully cleared recipes for ${ids.length} menu items (${count} ingredient links removed).`,
      clearedMenuItemsCount: ids.length,
      ingredientsRemovedCount: count
    });
  } catch (error) {
    console.error('Bulk delete recipes error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete recipes.' });
  }
};

/**
 * Recipe Margins and Food Cost calculation endpoint
 */
const getRecipeMargins = async (req, res) => {
  try {
    const menuItems = await prisma.menuItem.findMany({
      include: {
        recipeItems: {
          include: { inventoryItem: true }
        }
      }
    });

    const margins = menuItems.map((item) => {
      let foodCost = 0.0;
      let hasRecipe = item.recipeItems && item.recipeItems.length > 0;

      if (hasRecipe) {
        for (const r of item.recipeItems) {
          const inv = r.inventoryItem;
          if (inv && inv.costPrice) {
            try {
              const convertedQty = convertUnit(r.quantity, r.unit, inv.unit, inv.packageConversions);
              foodCost += convertedQty * inv.costPrice;
            } catch {
              foodCost += r.quantity * inv.costPrice;
            }
          }
        }
      }

      const grossMargin = item.price > 0 ? ((item.price - foodCost) / item.price) * 100 : 0;

      return {
        id: item.id,
        name: item.name,
        price: item.price,
        foodCost,
        grossMarginPercent: parseFloat(grossMargin.toFixed(1)),
        hasRecipe,
        recipeCount: item.recipeItems.length,
        category: item.category || 'Uncategorized'
      };
    });

    return res.json({ margins });
  } catch (error) {
    console.error('Get recipe margins error:', error);
    return res.status(500).json({ error: 'Failed to calculate recipe margins.' });
  }
};

/**
 * Get items nearing expiry date
 */
const getExpiringItems = async (req, res) => {
  try {
    const itemLevelExpiring = await prisma.inventoryItem.findMany({
      where: {
        expiryDate: { not: null }
      },
      include: { supplier: true, branch: true },
      orderBy: { expiryDate: 'asc' }
    });

    const batchLevelExpiring = await prisma.inventoryReceivingItem.findMany({
      where: {
        expiryDate: { not: null },
        receiving: { status: 'RECEIVED' }
      },
      include: {
        inventoryItem: { include: { supplier: true, branch: true } },
        receiving: { include: { supplier: true } }
      },
      orderBy: { expiryDate: 'asc' }
    });

    const now = new Date();
    const expiryMap = new Map();

    // Map item level expiries
    for (const item of itemLevelExpiring) {
      const daysUntilExpiry = Math.ceil((new Date(item.expiryDate) - now) / (1000 * 60 * 60 * 24));
      expiryMap.set(`item-${item.id}`, {
        id: item.id,
        inventoryItemId: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stockLevel: item.stockLevel,
        expiryDate: item.expiryDate,
        batchNumber: item.batchNumber || null,
        daysUntilExpiry,
        supplier: item.supplier || null,
        branch: item.branch || null,
        source: 'ITEM'
      });
    }

    // Map batch level expiries
    for (const bItem of batchLevelExpiring) {
      if (!bItem.inventoryItem) continue;
      const key = bItem.batchNumber ? `batch-${bItem.inventoryItemId}-${bItem.batchNumber}` : `rec-${bItem.id}`;
      const daysUntilExpiry = Math.ceil((new Date(bItem.expiryDate) - now) / (1000 * 60 * 60 * 24));
      expiryMap.set(key, {
        id: bItem.inventoryItem.id,
        receivingItemId: bItem.id,
        inventoryItemId: bItem.inventoryItem.id,
        name: bItem.inventoryItem.name,
        category: bItem.inventoryItem.category,
        unit: bItem.unit || bItem.inventoryItem.unit,
        stockLevel: bItem.quantity,
        expiryDate: bItem.expiryDate,
        batchNumber: bItem.batchNumber || null,
        daysUntilExpiry,
        supplier: bItem.receiving?.supplier || bItem.inventoryItem.supplier || null,
        branch: bItem.inventoryItem.branch || null,
        source: 'BATCH'
      });
    }

    const combined = Array.from(expiryMap.values()).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    return res.json({ items: combined });
  } catch (error) {
    console.error('Fetch expiring items error:', error);
    return res.status(500).json({ error: 'Failed to retrieve expiring inventory items.' });
  }
};

/**
 * Get Suppliers
 */
const getSuppliers = async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        _count: { select: { inventoryItems: true, receivings: true } }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ suppliers });
  } catch (error) {
    console.error('Fetch suppliers error:', error);
    return res.status(500).json({ error: 'Failed to retrieve suppliers.' });
  }
};

/**
 * Create Supplier
 */
const createSupplier = async (req, res) => {
  const { name, contactPerson, email, phone, address, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Supplier name is required.' });
  }

  const cleanName = name.trim();

  try {
    const existing = await prisma.supplier.findFirst({
      where: { name: { equals: cleanName, mode: 'insensitive' } }
    });

    if (existing) {
      return res.status(409).json({
        error: `A supplier named "${existing.name}" already exists.`,
        existingSupplier: existing
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: cleanName,
        contactPerson: contactPerson ? contactPerson.trim() : null,
        email: email ? email.trim() : null,
        phone: phone ? phone.trim() : null,
        address: address ? address.trim() : null,
        notes: notes ? notes.trim() : null
      }
    });

    await logAudit({
      userId: req.user.id,
      action: 'SUPPLIER_CREATED',
      entity: 'Supplier',
      entityId: String(supplier.id),
      newValue: { name: supplier.name },
      req
    });

    return res.status(201).json({ message: 'Supplier created successfully.', supplier });
  } catch (error) {
    console.error('Create supplier error:', error);
    return res.status(500).json({ error: 'Failed to create supplier.' });
  }
};

/**
 * Update Supplier
 */
const updateSupplier = async (req, res) => {
  const { id } = req.params;
  const { name, contactPerson, email, phone, address, notes } = req.body;

  try {
    const existing = await prisma.supplier.findUnique({
      where: { id: parseInt(id, 10) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.supplier.findFirst({
        where: {
          name: { equals: name.trim(), mode: 'insensitive' },
          id: { not: existing.id }
        }
      });
      if (duplicate) {
        return res.status(409).json({
          error: `Another supplier named "${duplicate.name}" already exists.`,
          existingSupplier: duplicate
        });
      }
    }

    const updated = await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name: name ? name.trim() : existing.name,
        contactPerson: contactPerson !== undefined ? (contactPerson ? contactPerson.trim() : null) : existing.contactPerson,
        email: email !== undefined ? (email ? email.trim() : null) : existing.email,
        phone: phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
        address: address !== undefined ? (address ? address.trim() : null) : existing.address,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : existing.notes,
      }
    });

    await logAudit({
      userId: req.user.id,
      action: 'SUPPLIER_UPDATED',
      entity: 'Supplier',
      entityId: String(updated.id),
      oldValue: { name: existing.name },
      newValue: { name: updated.name },
      req
    });

    return res.json({ message: 'Supplier updated successfully.', supplier: updated });
  } catch (error) {
    console.error('Update supplier error:', error);
    return res.status(500).json({ error: 'Failed to update supplier.' });
  }
};

/**
 * Delete / Archive Supplier
 */
const deleteSupplier = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await prisma.supplier.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        _count: { select: { receivings: true, inventoryItems: true } }
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const totalHistory = (existing._count?.receivings || 0) + (existing._count?.inventoryItems || 0);

    if (totalHistory > 0) {
      return res.status(400).json({
        error: `Cannot delete supplier "${existing.name}" because they have ${existing._count.receivings} receiving records and ${existing._count.inventoryItems} linked items. Historical records retain this supplier.`,
        isArchivable: true
      });
    }

    await prisma.supplier.delete({
      where: { id: existing.id }
    });

    await logAudit({
      userId: req.user.id,
      action: 'SUPPLIER_DELETED',
      entity: 'Supplier',
      entityId: String(existing.id),
      oldValue: { name: existing.name },
      req
    });

    return res.json({ message: 'Supplier deleted successfully.' });
  } catch (error) {
    console.error('Delete supplier error:', error);
    return res.status(500).json({ error: 'Failed to delete supplier.' });
  }
};

const bulkDeleteSuppliers = async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Please select suppliers to delete.' });
  }

  try {
    const supplierIds = ids.map((id) => parseInt(id, 10)).filter(Boolean);
    let deletedCount = 0;
    let skippedCount = 0;

    for (const supId of supplierIds) {
      const existing = await prisma.supplier.findUnique({
        where: { id: supId },
        include: { _count: { select: { receivings: true, inventoryItems: true } } },
      });
      if (!existing) continue;

      const totalHistory = (existing._count?.receivings || 0) + (existing._count?.inventoryItems || 0);
      if (totalHistory > 0) {
        skippedCount++;
        continue;
      }

      await prisma.supplier.delete({ where: { id: supId } });
      deletedCount++;
    }

    logAudit(req.user?.id || 1, 'BULK_DELETE_SUPPLIERS', 'Supplier', null, { deletedCount, skippedCount });

    return res.json({
      message: `Deleted ${deletedCount} supplier(s). ${skippedCount > 0 ? `${skippedCount} supplier(s) were preserved due to existing receiving/inventory links.` : ''}`,
      deletedCount,
      skippedCount,
      count: deletedCount,
    });
  } catch (error) {
    console.error('Bulk delete suppliers error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete suppliers.' });
  }
};

/**
 * Get inventory transaction history logs with filters
 */
const getInventoryLogs = async (req, res) => {
  const { type, inventoryItemId } = req.query;

  try {
    const where = {};
    if (type) {
      where.type = type.toUpperCase();
    }
    if (inventoryItemId) {
      where.inventoryItemId = parseInt(inventoryItemId, 10);
    }

    const logs = await prisma.inventoryLog.findMany({
      where,
      include: {
        inventoryItem: true,
        user: { select: { id: true, name: true, email: true } },
        supplier: true,
        receivingItem: {
          include: {
            receiving: {
              include: {
                supplier: true
              }
            }
          }
        },
        receiving: {
          include: {
            supplier: true,
            receivedBy: { select: { id: true, name: true, email: true } },
            items: {
              include: {
                inventoryItem: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 250
    });

    // Enrich logs with order and ordered items details where orderId is present
    const orderIds = [...new Set(logs.map(l => l.orderId).filter(Boolean))];
    if (orderIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          orderItems: {
            select: {
              id: true,
              menuItemId: true,
              nameSnapshot: true,
              priceSnapshot: true,
              quantity: true,
              subtotal: true
            }
          }
        }
      });
      const orderMap = new Map(orders.map(o => [o.id, o]));
      logs.forEach(l => {
        if (l.orderId && orderMap.has(l.orderId)) {
          l.order = orderMap.get(l.orderId);
        }
      });
    }

    return res.json({ logs });
  } catch (error) {
    console.error('Fetch inventory logs error:', error);
    return res.status(500).json({ error: 'Failed to retrieve inventory logs.' });
  }
};

/**
 * Delete a single inventory log entry
 */
const deleteInventoryLog = async (req, res) => {
  const { id } = req.params;
  try {
    const logId = parseInt(id, 10);
    const existing = await prisma.inventoryLog.findUnique({ where: { id: logId } });
    if (!existing) {
      return res.status(404).json({ error: 'Inventory log entry not found.' });
    }

    await prisma.inventoryLog.delete({ where: { id: logId } });

    return res.json({ message: 'Inventory log entry deleted successfully.' });
  } catch (error) {
    console.error('Delete inventory log error:', error);
    return res.status(500).json({ error: 'Failed to delete inventory log entry.' });
  }
};

/**
 * Bulk delete inventory logs
 */
const bulkDeleteInventoryLogs = async (req, res) => {
  const { ids = [], beforeDate } = req.body;

  try {
    const where = {};
    if (Array.isArray(ids) && ids.length > 0) {
      where.id = { in: ids.map(i => parseInt(i, 10)).filter(i => !isNaN(i)) };
    } else if (beforeDate) {
      where.createdAt = { lte: new Date(beforeDate) };
    } else {
      return res.status(400).json({ error: 'Provide either an array of log ids or a beforeDate cutoff.' });
    }

    const { count } = await prisma.inventoryLog.deleteMany({ where });

    return res.json({ message: `Successfully deleted ${count} inventory log records.`, count });
  } catch (error) {
    console.error('Bulk delete inventory logs error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete inventory logs.' });
  }
};

/**
 * Single Item demand forecast
 */
const getForecast = async (req, res) => {
  const { id } = req.params;
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: parseInt(id, 10) }
    });

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const past7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      return d;
    }).reverse();

    const menuItem = await prisma.menuItem.findFirst({
      where: { name: item.name }
    });

    const historicalSales = [];
    let totalHistoricalOrders = 0;

    if (menuItem) {
      const orderItems = await prisma.orderItem.findMany({
        where: {
          menuItemId: menuItem.id,
          order: {
            status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
            createdAt: { gte: past7Days[0] }
          }
        },
        include: { order: true }
      });

      totalHistoricalOrders = orderItems.length;

      for (const day of past7Days) {
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);

        const dailyQty = orderItems
          .filter(oi => oi.order.createdAt >= day && oi.order.createdAt < nextDay)
          .reduce((sum, oi) => sum + oi.quantity, 0);

        historicalSales.push(dailyQty);
      }
    } else {
      historicalSales.push(12, 15, 8, 14, 20, 18, 22);
    }

    const prediction = await getOrCalculateForecast(item, historicalSales, {}, false);

    const confidenceBadge = totalHistoricalOrders >= 30 ? 'HIGH' : (totalHistoricalOrders >= 10 ? 'MEDIUM' : 'LOW_HISTORY');

    return res.json({
      itemName: item.name,
      currentStock: item.stockLevel,
      minThreshold: item.minThreshold,
      historicalSales,
      forecast: prediction.forecast,
      confidence: prediction.confidence || 0.8,
      confidenceBadge,
      source: prediction.source
    });
  } catch (error) {
    console.error('Forecasting calculation error:', error);
    return res.status(500).json({ error: 'Failed to calculate inventory demand forecast.' });
  }
};

/**
 * AI Stockout Risk and Reorder Advice Alerts
 */
const getInventoryAlerts = async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' }
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekday = tomorrow.getDay();
    const month = tomorrow.getMonth() + 1;

    let season = 0;
    if (month >= 3 && month <= 5) season = 1;
    else if (month >= 6 && month <= 8) season = 2;
    else if (month >= 9 && month <= 11) season = 3;

    const weatherList = ['Clear', 'Rain', 'Hot/Sunny', 'Cold'];
    const weatherString = weatherList[weekday % weatherList.length];
    const weatherMapping = { 'Clear': 0, 'Rain': 1, 'Hot/Sunny': 2, 'Cold': 3 };
    const weather = weatherMapping[weatherString];

    const exams_season = (month === 6 || month === 12) ? 1 : 0;
    const promotions = (weekday === 5 || weekday === 6) ? 1 : 0;

    const features = { weekday, month, season, weather, weatherString, exams_season, promotions };

    // Batch fetch all menu items, demand forecasts, and recent 7-day order items in 3 parallel queries
    const past7DaysStart = new Date();
    past7DaysStart.setDate(past7DaysStart.getDate() - 7);
    past7DaysStart.setHours(0, 0, 0, 0);

    const [allMenuItems, allForecasts, recentOrderItems] = await Promise.all([
      prisma.menuItem.findMany({ select: { id: true, name: true } }),
      prisma.demandForecast.findMany(),
      prisma.orderItem.findMany({
        where: {
          order: {
            status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
            createdAt: { gte: past7DaysStart }
          }
        },
        select: {
          menuItemId: true,
          quantity: true,
          order: { select: { createdAt: true } }
        }
      })
    ]);

    const menuItemMap = new Map(allMenuItems.map(m => [m.name.toLowerCase(), m.id]));
    const forecastMap = new Map(allForecasts.map(f => [f.menuItemName.toLowerCase(), f]));

    const alerts = [];

    for (const item of items) {
      const lowerName = item.name.toLowerCase();
      const menuItemId = menuItemMap.get(lowerName);

      let orderCount = 0;
      const historicalSales = [];

      if (menuItemId) {
        const itemOrderItems = recentOrderItems.filter(oi => oi.menuItemId === menuItemId);
        orderCount = itemOrderItems.length;

        const past7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          d.setHours(0, 0, 0, 0);
          return d;
        }).reverse();

        for (const day of past7Days) {
          const nextDay = new Date(day);
          nextDay.setDate(nextDay.getDate() + 1);
          const dailyQty = itemOrderItems
            .filter(oi => oi.order.createdAt >= day && oi.order.createdAt < nextDay)
            .reduce((sum, oi) => sum + oi.quantity, 0);
          historicalSales.push(dailyQty);
        }
      } else {
        historicalSales.push(10, 12, 14, 11, 15, 13, 16);
      }

      // Check fast in-memory forecast cache
      const cachedForecast = forecastMap.get(lowerName);
      let forecast = item.minThreshold * 1.5;
      let percentChange = 0.0;
      let source = 'heuristic';

      if (cachedForecast) {
        forecast = cachedForecast.predictedQty;
        source = 'database-cache';
        try {
          const feat = JSON.parse(cachedForecast.features || '{}');
          percentChange = feat.percentChange || 0.0;
        } catch {
          // Cached forecast data remains usable without optional feature metadata.
        }
      } else {
        // Simple fast heuristic if no forecast generated yet
        const sumSales = historicalSales.reduce((a, b) => a + b, 0);
        forecast = sumSales > 0 ? (sumSales / historicalSales.length) : Math.max(item.minThreshold * 1.2, 5);
      }

      const confidenceBadge = orderCount >= 30 ? 'HIGH' : (orderCount >= 10 ? 'MEDIUM' : 'LOW_HISTORY');
      const isLow = item.stockLevel <= item.minThreshold;
      const isStockoutPredicted = item.stockLevel < forecast;

      let alertType = null;
      let alertMessage = '';
      let suggestedRestock = 0;
      let stockoutDate = null;

      if (isStockoutPredicted) {
        alertType = 'STOCKOUT_RISK';
        stockoutDate = 'Tomorrow';
        suggestedRestock = Math.ceil(forecast * 1.5 - item.stockLevel);

        const reasonText = percentChange > 10
          ? `demand is projected to rise by ${percentChange.toFixed(0)}% based on POS order trends`
          : `daily demand is projected at ${forecast.toFixed(0)} ${item.unit}`;

        alertMessage = `${item.name} ${reasonText}. Restock immediately to prevent operational delay.`;
      } else if (isLow) {
        alertType = 'LOW_STOCK';
        suggestedRestock = Math.ceil(item.minThreshold * 2.5 - item.stockLevel);
        alertMessage = `${item.name} stock level (${item.stockLevel.toFixed(1)} ${item.unit}) is below threshold (${item.minThreshold} ${item.unit}).`;
      }

      if (alertType) {
        alerts.push({
          id: item.id,
          name: item.name,
          unit: item.unit,
          currentStock: item.stockLevel,
          minThreshold: item.minThreshold,
          forecast,
          percentChange,
          alertType,
          message: alertMessage,
          suggestedRestock,
          stockoutDate,
          confidenceBadge,
          source
        });
      }
    }

    return res.json({ alerts, context: features });
  } catch (error) {
    console.error('Fetch inventory alerts error:', error);
    return res.status(500).json({ error: 'Failed to retrieve AI insights.' });
  }
};

/**
 * Force recalculation of AI forecasts
 */
const recalculateInventoryForecasts = async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' }
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekday = tomorrow.getDay();
    const month = tomorrow.getMonth() + 1;

    let season = 0;
    if (month >= 3 && month <= 5) season = 1;
    else if (month >= 6 && month <= 8) season = 2;
    else if (month >= 9 && month <= 11) season = 3;

    const weatherList = ['Clear', 'Rain', 'Hot/Sunny', 'Cold'];
    const weatherString = weatherList[weekday % weatherList.length];
    const weatherMapping = { 'Clear': 0, 'Rain': 1, 'Hot/Sunny': 2, 'Cold': 3 };
    const weather = weatherMapping[weatherString];
    const exams_season = (month === 6 || month === 12) ? 1 : 0;
    const promotions = (weekday === 5 || weekday === 6) ? 1 : 0;

    const features = { weekday, month, season, weather, weatherString, exams_season, promotions };

    for (const item of items) {
      const past7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        return d;
      }).reverse();

      const menuItem = await prisma.menuItem.findFirst({
        where: { name: item.name }
      });

      const historicalSales = [];
      if (menuItem) {
        const orderItems = await prisma.orderItem.findMany({
          where: {
            menuItemId: menuItem.id,
            order: {
              status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
              createdAt: { gte: past7Days[0] }
            }
          },
          include: { order: true }
        });

        for (const day of past7Days) {
          const nextDay = new Date(day);
          nextDay.setDate(nextDay.getDate() + 1);
          const dailyQty = orderItems
            .filter(oi => oi.order.createdAt >= day && oi.order.createdAt < nextDay)
            .reduce((sum, oi) => sum + oi.quantity, 0);
          historicalSales.push(dailyQty);
        }
      } else {
        historicalSales.push(10, 12, 14, 11, 15, 13, 16);
      }

      await getOrCalculateForecast(item, historicalSales, features, true);
    }

    return res.json({ message: 'AI demand forecasts recalculated successfully.' });
  } catch (error) {
    console.error('Recalculate inventory forecasts error:', error);
    return res.status(500).json({ error: 'Failed to recalculate AI demand forecasts.' });
  }
};

/**
 * Get list of stock receiving transactions with optional filters
 */

/**
 * Generate unique receiving reference RCV-YYYYMMDD-XXX
 */
const generateReceivingRef = async (req, res) => {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `RCV-${yyyy}${mm}${dd}`;

    const existing = await prisma.inventoryReceiving.findMany({
      where: {
        OR: [
          { invoiceNumber: { startsWith: datePrefix } },
          { receivingNumber: { startsWith: datePrefix } }
        ]
      },
      select: { invoiceNumber: true, receivingNumber: true }
    });

    let maxSeq = 0;
    for (const item of existing) {
      const refStr = item.invoiceNumber || item.receivingNumber;
      if (refStr) {
        const parts = refStr.split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
    }

    const reference = `${datePrefix}-${String(maxSeq + 1).padStart(3, '0')}`;
    return res.json({ reference });
  } catch {
    const fallbackDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return res.json({ reference: `RCV-${fallbackDate}-001` });
  }
};

const getReceivings = async (req, res) => {
  const { status, supplierId, branchId, search } = req.query;
  if (status && status.toUpperCase() !== 'ALL' && !isValid('InventoryReceivingStatus', status.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid inventory receiving status value.' });
  }
  try {
    const where = {};
    if (status && status !== 'ALL') where.status = status.toUpperCase();
    if (supplierId) where.supplierId = parseInt(supplierId, 10);
    if (branchId) where.branchId = parseInt(branchId, 10);
    if (search) {
      where.OR = [
        { receivingNumber: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const receivings = await prisma.inventoryReceiving.findMany({
      where,
      include: {
        supplier: true,
        branch: true,
        receivedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: { inventoryItem: true }
        },
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' },
    });

    const receivingsWithDraftLines = receivings.map((receiving) => {
      const marker = '__DRAFT_ITEMS__:';
      const markerIndex = String(receiving.notes || '').indexOf(marker);
      let draftItems = [];
      if (markerIndex >= 0) {
        try {
          const serialized = String(receiving.notes).slice(markerIndex + marker.length).split('\n')[0].trim();
          const parsed = JSON.parse(serialized);
          if (Array.isArray(parsed)) draftItems = parsed;
        } catch {
          console.warn(`Receiving draft lines could not be decoded for record ${receiving.id}.`);
        }
      }
      return { ...receiving, draftItems, itemCount: (receiving.items?.length || 0) + draftItems.length };
    });

    return res.json({ receivings: receivingsWithDraftLines });
  } catch (error) {
    console.error('Fetch receivings error:', error);
    return res.status(500).json({ error: 'Failed to retrieve stock receiving records.' });
  }
};

/**
 * Get single stock receiving transaction details by ID
 */
const getReceivingById = async (req, res) => {
  const { id } = req.params;
  try {
    const receiving = await prisma.inventoryReceiving.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        supplier: true,
        branch: true,
        receivedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: { inventoryItem: true }
        },
        logs: {
          include: { inventoryItem: true }
        }
      }
    });

    if (!receiving) {
      return res.status(404).json({ error: 'Stock receiving record not found.' });
    }

    return res.json({ receiving });
  } catch (error) {
    console.error('Fetch receiving by ID error:', error);
    return res.status(500).json({ error: 'Failed to retrieve receiving details.' });
  }
};

/**
 * Create new stock receiving transaction (DRAFT or CONFIRMED RECEIVED)
 */
const createReceiving = async (req, res) => {
  const { supplierId, invoiceNumber, receivingRef, branchId, receivingDate, notes, items, status, draftNewItems } = req.body;
  if (status != null && !isValid('InventoryReceivingStatus', String(status).toUpperCase())) {
    return res.status(400).json({ error: 'Invalid inventory receiving status value.' });
  }
  const requestedDiscountPercent = req.body.discountPercent == null ? null : Number(req.body.discountPercent);
  let discountAmount = roundReceivingMoney(Number(req.body.discount ?? 0));
  if (!Number.isFinite(discountAmount) || discountAmount < 0 || (requestedDiscountPercent !== null && (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent < 0 || requestedDiscountPercent > 100))) {
    return res.status(400).json({ error: 'Discount must be a valid non-negative amount.' });
  }

  const isConfirmed = status && status.toUpperCase() === 'RECEIVED';
  const targetStatus = isConfirmed ? 'RECEIVED' : 'DRAFT';

  // For RECEIVED status, items are required. For DRAFT, at least items OR draftNewItems must be present
  const hasKnownItems = Array.isArray(items) && items.length > 0;
  const hasDraftNewItems = Array.isArray(draftNewItems) && draftNewItems.length > 0;

  if (!hasKnownItems && !hasDraftNewItems) {
    return res.status(400).json({ error: 'At least one inventory item is required for stock receiving.' });
  }

  if (isConfirmed && !hasKnownItems) {
    return res.status(400).json({ error: 'All receiving items must specify a valid inventory item and positive quantity.' });
  }
  if (isConfirmed && hasDraftNewItems) {
    return res.status(400).json({ error: 'New catalog items must be reviewed in a draft before stock can be received.' });
  }
  if (hasDraftNewItems) {
    const invalidDraftItem = draftNewItems.find((item) => {
      const quantity = Number(item?.quantity ?? item?.stockLevel);
      const cost = Number(item?.unitCost ?? item?.costPrice ?? 0);
      return !String(item?.name || '').trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0;
    });
    if (invalidDraftItem) {
      return res.status(400).json({ error: `Draft item "${String(invalidDraftItem.name || 'Unnamed').trim()}" needs a name, a positive quantity, and a valid non-negative cost.` });
    }
  }

  try {
    let receivingNumber = receivingRef ? String(receivingRef).trim() : null;
    if (!receivingNumber) {
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      receivingNumber = `REC-${year}-${timestamp}`;
    }

    // Parallelize pre-checks to eliminate sequential round-trip network delays
    const candidateBranchId = branchId ? parseInt(branchId, 10) : (req.user?.branchId || null);
    const candidateSupplierId = supplierId ? parseInt(supplierId, 10) : null;

    const [initialExistingRec, branchCheck, supplierCheck] = await Promise.all([
      prisma.inventoryReceiving.findUnique({ where: { receivingNumber }, select: {
        id: true, status: true, supplierId: true, branchId: true, receivingNumber: true,
        invoiceNumber: true, receivingDate: true, notes: true, subtotal: true, discount: true, discountPercent: true,
        items: { select: { inventoryItemId: true, quantity: true, unit: true, unitCost: true, totalCost: true, batchNumber: true, expiryDate: true, notes: true } }
      } }),
      candidateBranchId ? prisma.branch.findUnique({ where: { id: candidateBranchId }, select: { id: true } }) : null,
      candidateSupplierId ? prisma.supplier.findUnique({ where: { id: candidateSupplierId }, select: { id: true } }) : null
    ]);

    if (candidateSupplierId && !supplierCheck) {
      return res.status(400).json({ error: 'Selected supplier was not found. Choose a valid supplier before saving this receiving.' });
    }
    if (candidateBranchId && !branchCheck) {
      return res.status(400).json({ error: 'Selected branch was not found. Choose a valid branch before saving this receiving.' });
    }

    let resolvedBranchId = branchCheck ? branchCheck.id : null;
    if (!resolvedBranchId) {
      const defaultBranch = await prisma.branch.findFirst({ select: { id: true } });
      resolvedBranchId = defaultBranch ? defaultBranch.id : null;
    }

    let resolvedSupplierId = supplierCheck ? supplierCheck.id : null;
    let existingRec = initialExistingRec;
    let existingDraftForRetry = false;

    // Receiving references are globally unique in the existing schema. Give the same
    // human-entered reference a stable supplier suffix so different suppliers stay separate.
    if (existingRec && targetStatus === 'DRAFT' && existingRec.status === 'DRAFT' &&
        existingRec.supplierId !== resolvedSupplierId) {
      receivingNumber = `${receivingNumber}-SUP-${resolvedSupplierId || 'LOCAL'}`;
      existingRec = await prisma.inventoryReceiving.findUnique({
        where: { receivingNumber },
        select: {
          id: true, status: true, supplierId: true, branchId: true, receivingNumber: true,
          invoiceNumber: true, receivingDate: true, notes: true, subtotal: true, discount: true, discountPercent: true,
          items: { select: { inventoryItemId: true, quantity: true, unit: true, unitCost: true, totalCost: true, batchNumber: true, expiryDate: true, notes: true } }
        }
      });
    }

    // A retry of the same draft reference for the same supplier is idempotent.
    // Never silently attach a retry to another supplier's draft or create a random duplicate.
    if (existingRec) {
      if (targetStatus === 'DRAFT' && existingRec.status === 'DRAFT' &&
          existingRec.supplierId === resolvedSupplierId && existingRec.branchId === resolvedBranchId) {
        existingDraftForRetry = true;
      } else {
        return res.status(409).json({ error: `Receiving reference "${receivingNumber}" is already in use. Use a unique reference for this supplier delivery.` });
      }
    }

    // Prevent duplicate invoice imports
    const cleanInv = invoiceNumber ? String(invoiceNumber).trim() : null;
    const isPlaceholder = !cleanInv || /^INV-\d{8}-\d{6}$/i.test(cleanInv) || ['not provided', 'n/a', 'none', 'null'].includes(cleanInv.toLowerCase());
    if (cleanInv && !isPlaceholder && resolvedSupplierId && targetStatus === 'RECEIVED') {
      const duplicateInv = await prisma.inventoryReceiving.findFirst({
        where: {
          supplierId: resolvedSupplierId,
          invoiceNumber: { equals: cleanInv, mode: 'insensitive' },
          status: 'RECEIVED'
        },
        select: { id: true, receivingNumber: true, invoiceNumber: true, createdAt: true }
      });
      if (duplicateInv) {
        return res.status(409).json({
          error: `Duplicate invoice detected! Invoice #${cleanInv} from this supplier was already received and posted in transaction #${duplicateInv.receivingNumber} on ${new Date(duplicateInv.createdAt).toLocaleDateString()}. Duplicate imports are blocked to prevent double-counting stock.`,
          duplicateReceiving: duplicateInv
        });
      }
    }

    const resolvedDate = receivingDate ? new Date(receivingDate) : new Date();

    const preparedItems = [];
    let calculatedTotalCost = 0.0;

    for (const item of (items || [])) {
      const invId = parseInt(item.inventoryItemId, 10);
      const qty = parseFloat(item.quantity);
      const cost = item.unitCost !== undefined && item.unitCost !== '' ? parseFloat(item.unitCost) : 0.0;

      if (!Number.isInteger(invId) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ error: 'All receiving items must specify a valid inventory item and positive quantity.' });
      }

      const itemTotal = roundReceivingMoney(qty * cost);
      calculatedTotalCost = roundReceivingMoney(calculatedTotalCost + itemTotal);

      preparedItems.push({
        inventoryItemId: invId,
        quantity: qty,
        remainingQuantity: qty,
        unit: item.unit || 'PCS',
        unitCost: cost,
        totalCost: itemTotal,
        batchNumber: item.batchNumber ? String(item.batchNumber).trim() : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        notes: item.notes ? String(item.notes).trim() : null,
      });
    }

    if (preparedItems.length > 0) {
      const requestedIds = [...new Set(preparedItems.map(item => item.inventoryItemId))];
      const existingCatalogItems = await prisma.inventoryItem.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true }
      });
      const existingIds = new Set(existingCatalogItems.map(item => item.id));
      const missingIds = requestedIds.filter(id => !existingIds.has(id));
      if (missingIds.length) {
        return res.status(400).json({ error: `Some selected inventory items no longer exist (IDs: ${missingIds.join(', ')}). Refresh the catalog and select those items again.` });
      }
    }

    // Include known and new lines in mixed drafts; saving a draft never posts stock.
    if (hasDraftNewItems) {
      draftNewItems.forEach(ni => {
        const niCost = parseFloat(ni.unitCost || ni.costPrice) || 0;
        const niQty = parseFloat(ni.quantity || ni.stockLevel) || 0;
        calculatedTotalCost = roundReceivingMoney(calculatedTotalCost + roundReceivingMoney(niQty * niCost));
      });
    }
    if (requestedDiscountPercent !== null) {
      discountAmount = roundReceivingMoney(calculatedTotalCost * requestedDiscountPercent / 100);
    }

    // Build notes: embed draftNewItems as JSON for later processing at confirm time
    let notesValue = notes ? String(notes).trim() : null;
    if (hasDraftNewItems) {
      const draftJson = JSON.stringify(draftNewItems);
      notesValue = notesValue
        ? `${notesValue}
__DRAFT_ITEMS__:${draftJson}`
        : `__DRAFT_ITEMS__:${draftJson}`;
    }

    if (existingDraftForRetry) {
      const canonicalItems = (list) => (list || []).map((item) => ({
        inventoryItemId: Number(item.inventoryItemId), quantity: Number(item.quantity), unit: item.unit || 'PCS',
        unitCost: Number(item.unitCost || 0), totalCost: Number(item.totalCost || 0),
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString() : null,
        notes: item.notes || null
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const existingDate = existingRec.receivingDate ? new Date(existingRec.receivingDate).toISOString() : null;
      const samePayload = (existingRec.invoiceNumber || null) === (invoiceNumber ? String(invoiceNumber).trim() : null) &&
        Number(existingRec.discount || 0) === discountAmount &&
        Number(existingRec.discountPercent ?? -1) === (requestedDiscountPercent ?? -1) &&
        existingDate === resolvedDate.toISOString() && existingRec.notes === notesValue &&
        JSON.stringify(canonicalItems(existingRec.items)) === JSON.stringify(canonicalItems(preparedItems));
      if (!samePayload) {
        return res.status(409).json({ error: 'This reference already has a draft with different contents. Resume and edit the saved draft, or use a new receiving reference.' });
      }
      const savedDraft = await prisma.inventoryReceiving.findUnique({
        where: { id: existingRec.id },
        include: { supplier: true, branch: true, receivedBy: { select: { id: true, name: true, email: true } }, items: { include: { inventoryItem: true } } }
      });
      return res.status(200).json({ message: 'This draft was already saved.', receiving: savedDraft, alreadySaved: true });
    }

    let receiving;
    if (targetStatus === 'DRAFT') {
      receiving = await prisma.inventoryReceiving.create({
        data: {
          receivingNumber,
          supplierId: resolvedSupplierId,
          invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
          branchId: resolvedBranchId,
          receivingDate: resolvedDate,
          receivedById: req.user?.id || null,
          notes: notesValue,
          status: 'DRAFT',
          subtotal: calculatedTotalCost,
          discount: discountAmount,
          discountPercent: requestedDiscountPercent,
          totalCost: roundReceivingMoney(Math.max(0, calculatedTotalCost - discountAmount)),
          items: {
            create: preparedItems,
          },
        },
        include: {
          supplier: true,
          branch: true,
          receivedBy: { select: { id: true, name: true, email: true } },
          items: { include: { inventoryItem: true } },
        },
      });
    } else {
      receiving = await prisma.$transaction(async (tx) => {
        const newReceiving = await tx.inventoryReceiving.create({
          data: {
            receivingNumber,
            supplierId: resolvedSupplierId,
            invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
            branchId: resolvedBranchId,
            receivingDate: resolvedDate,
            receivedById: req.user?.id || null,
            notes: notes ? String(notes).trim() : null,
            status: targetStatus,
            subtotal: calculatedTotalCost,
            discount: discountAmount,
            discountPercent: requestedDiscountPercent,
            totalCost: roundReceivingMoney(Math.max(0, calculatedTotalCost - discountAmount)),
            items: {
              create: preparedItems,
            },
          },
          include: {
            supplier: true,
            branch: true,
            receivedBy: { select: { id: true, name: true, email: true } },
            items: { include: { inventoryItem: true } },
          },
        });

        const itemIds = [...new Set(newReceiving.items.map(i => i.inventoryItemId))];
        const existingItems = await tx.inventoryItem.findMany({
          where: { id: { in: itemIds } }
        });
        const itemsMap = new Map(existingItems.map(i => [i.id, i]));
        const logsToCreate = [];

        for (const item of newReceiving.items) {
          const existingItem = itemsMap.get(item.inventoryItemId);

          if (!existingItem) {
            throw new Error(`Inventory item ID ${item.inventoryItemId} not found.`);
          }

          const qtyBefore = existingItem.stockLevel;
          const qtyAfter = qtyBefore + item.quantity;
          const purchaseQty = item.quantity;
          const purchaseUnitCost = item.unitCost > 0 ? item.unitCost : (existingItem.costPrice || 0);

          // Weighted-Average Costing: ((qtyBefore * oldCost) + (purchaseQty * purchaseCost)) / qtyAfter
          let calculatedCostPrice = existingItem.costPrice || 0;
          if (qtyAfter > 0) {
            if (qtyBefore <= 0) {
              calculatedCostPrice = purchaseUnitCost;
            } else {
              const prevTotalValue = qtyBefore * (existingItem.costPrice || 0);
              const purchaseTotalValue = purchaseQty * purchaseUnitCost;
              calculatedCostPrice = (prevTotalValue + purchaseTotalValue) / qtyAfter;
              calculatedCostPrice = Math.round(calculatedCostPrice * 10000) / 10000;
            }
          }

          existingItem.stockLevel = qtyAfter;
          existingItem.costPrice = calculatedCostPrice;

          const updateData = {
            stockLevel: qtyAfter,
            costPrice: calculatedCostPrice,
          };
          if (item.expiryDate) {
            updateData.expiryDate = item.expiryDate;
          }

          await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: updateData
          });

          logsToCreate.push({
            inventoryItemId: existingItem.id,
            type: 'STOCK_IN',
            quantity: item.quantity,
            quantityBefore: qtyBefore,
            quantityAfter: qtyAfter,
            changeQty: item.quantity,
            cost: item.totalCost,
            reason: `Stock receiving #${newReceiving.receivingNumber} (Inv: ${newReceiving.invoiceNumber || 'N/A'})`,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            supplierId: resolvedSupplierId,
            receivingId: newReceiving.id,
            userId: req.user?.id || null,
          });
        }

        if (logsToCreate.length > 0) {
          await tx.inventoryLog.createMany({
            data: logsToCreate
          });
        }

        return newReceiving;
      }, {
        maxWait: 20000,
        timeout: 60000
      });
    }

    logAudit({
      userId: req.user?.id || 1,
      action: isConfirmed ? 'STOCK_RECEIVING_CONFIRMED' : 'STOCK_RECEIVING_DRAFT_CREATED',
      entity: 'InventoryReceiving',
      entityId: String(receiving.id),
      newValue: { receivingNumber: receiving.receivingNumber, totalCost: receiving.totalCost, status: receiving.status },
      req
    }).catch(err => console.error('Audit log error:', err?.message));

    if (isConfirmed) {
      emitToAdmin('inventory:update', { receiving });
      emitToVendor('inventory:update', { receiving });
    }

    return res.status(201).json({
      message: isConfirmed ? 'Stock received successfully and inventory updated.' : 'Draft stock receiving saved successfully.',
      receiving
    });
  } catch (error) {
      console.error('Create receiving error:', String(error.message || 'Unknown error').replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]'));
    return res.status(500).json({ error: error.message || 'Failed to create stock receiving record.' });
  }
};

/**
 * Confirm a draft receiving transaction and update inventory atomically
 */
const confirmReceiving = async (req, res) => {
  const { id } = req.params;

  try {
    const existingReceiving = await prisma.inventoryReceiving.findUnique({
      where: { id: parseInt(id, 10) },
      include: { items: { include: { inventoryItem: true } } }
    });

    if (!existingReceiving) {
      return res.status(404).json({ error: 'Stock receiving record not found.' });
    }

    if (existingReceiving.status === 'RECEIVED') {
      return res.status(400).json({ error: 'This receiving record has already been confirmed and processed.' });
    }

    if (existingReceiving.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cancelled receiving records cannot be confirmed.' });
    }

    if (!existingReceiving.items || existingReceiving.items.length === 0) {
      // Check if there are draft new items stored in notes
      const hasPendingDraftItems = existingReceiving.notes && existingReceiving.notes.includes('__DRAFT_ITEMS__:');
      if (!hasPendingDraftItems) {
        return res.status(400).json({ error: 'Cannot confirm a receiving record with no items.' });
      }
    }

    const updatedReceiving = await prisma.$transaction(async (tx) => {
      let resolvedSupplierId = existingReceiving.supplierId;
      if (resolvedSupplierId) {
        const supExists = await tx.supplier.findUnique({ where: { id: resolvedSupplierId } });
        if (!supExists) resolvedSupplierId = null;
      }

      // ── Parse & materialise draftNewItems stored in notes ──
      let allReceivingItems = [...(existingReceiving.items || [])];
      let cleanedNotes = existingReceiving.notes || null;

      if (existingReceiving.notes && existingReceiving.notes.includes('__DRAFT_ITEMS__:')) {
        try {
          const marker = '__DRAFT_ITEMS__:';
          const markerIdx = existingReceiving.notes.indexOf(marker);
          const jsonStr = existingReceiving.notes.slice(markerIdx + marker.length).split('\n')[0].trim();
          const draftNewItems = JSON.parse(jsonStr);

          // Strip __DRAFT_ITEMS__ from notes so final record is clean
          cleanedNotes = existingReceiving.notes.slice(0, markerIdx).trim() || null;

          // Resolve branchId for new items
          let branchIdForNew = existingReceiving.branchId;
          if (!branchIdForNew) {
            const defaultBranch = await tx.branch.findFirst({ select: { id: true } });
            branchIdForNew = defaultBranch?.id || null;
          }

          for (const ni of draftNewItems) {
            const niName = (ni.name || '').trim();
            const niQty = parseFloat(ni.quantity ?? ni.stockLevel);
            const niCost = parseFloat(ni.costPrice ?? ni.unitCost) || 0;
            if (!niName || !Number.isFinite(niQty) || niQty <= 0 || !Number.isFinite(niCost) || niCost < 0) {
              throw new Error('A saved draft item has invalid name, quantity, or cost. No stock was posted.');
            }

            // Upsert: create if doesn't exist, leave stockLevel=0 (stock added below)
            let catalogItem = await tx.inventoryItem.findFirst({
              where: { name: { equals: niName, mode: 'insensitive' }, branchId: branchIdForNew }
            });

            if (!catalogItem) {
              catalogItem = await tx.inventoryItem.create({
                data: {
                  name: niName,
                  unit: ni.unit || 'KG',
                  category: ni.category || 'General',
                  costPrice: parseFloat(ni.costPrice || ni.unitCost) || 0,
                  stockLevel: 0, // stock will be added below via STOCK_IN
                  minThreshold: parseFloat(ni.minThreshold) || 10,
                  maxThreshold: parseFloat(ni.maxThreshold) || 100,
                  packageConversions: ni.packageConversions && typeof ni.packageConversions === 'object' ? ni.packageConversions : null,
                  supplierId: resolvedSupplierId || null,
                  branchId: branchIdForNew,
                  expiryDate: ni.expiryDate ? new Date(ni.expiryDate) : null,
                }
              });
            }

            // Create the receiving line for this new item
            {
              const newLine = await tx.inventoryReceivingItem.create({
                data: {
                  receivingId: existingReceiving.id,
                  inventoryItemId: catalogItem.id,
                  quantity: niQty,
                  remainingQuantity: niQty,
                  unit: ni.unit || 'KG',
                  unitCost: niCost,
                  totalCost: roundReceivingMoney(niQty * niCost),
                  batchNumber: ni.batchNumber ? String(ni.batchNumber).trim() : null,
                  expiryDate: ni.expiryDate ? new Date(ni.expiryDate) : null,
                  notes: null,
                },
                include: { inventoryItem: true }
              });
              allReceivingItems.push(newLine);
            }
          }
        } catch (parseErr) {
          throw new Error(`Saved draft items could not be read safely: ${parseErr.message}`, { cause: parseErr });
        }
      }

      const itemIds = [...new Set(allReceivingItems.map(i => i.inventoryItemId))];
      const existingItems = await tx.inventoryItem.findMany({
        where: { id: { in: itemIds } }
      });
      const itemsMap = new Map(existingItems.map(i => [i.id, i]));
      const logsToCreate = [];

      for (const item of allReceivingItems) {
        const existingItem = itemsMap.get(item.inventoryItemId);

        if (!existingItem) {
          throw new Error(`Inventory item ID ${item.inventoryItemId} not found.`);
        }

        const convertedReceivedQty = convertUnit(item.quantity, item.unit, existingItem.unit, existingItem.packageConversions);
        const qtyBefore = existingItem.stockLevel;
        const qtyAfter = qtyBefore + convertedReceivedQty;
        const purchaseQty = convertedReceivedQty;
        const purchaseUnitCost = item.unitCost > 0
          ? (item.quantity > 0 ? (item.quantity * item.unitCost) / convertedReceivedQty : item.unitCost)
          : (existingItem.costPrice || 0);

        // Weighted-Average Costing: ((qtyBefore * oldCost) + (purchaseQty * purchaseCost)) / qtyAfter
        let calculatedCostPrice = existingItem.costPrice || 0;
        if (qtyAfter > 0) {
          if (qtyBefore <= 0) {
            calculatedCostPrice = purchaseUnitCost;
          } else {
            const prevTotalValue = qtyBefore * (existingItem.costPrice || 0);
            const purchaseTotalValue = purchaseQty * purchaseUnitCost;
            calculatedCostPrice = (prevTotalValue + purchaseTotalValue) / qtyAfter;
            calculatedCostPrice = Math.round(calculatedCostPrice * 10000) / 10000;
          }
        }

        existingItem.stockLevel = qtyAfter;
        existingItem.costPrice = calculatedCostPrice;

        const updateData = {
          stockLevel: qtyAfter,
          costPrice: calculatedCostPrice,
        };
        if (item.expiryDate) {
          updateData.expiryDate = item.expiryDate;
        }

        await tx.inventoryItem.update({
          where: { id: existingItem.id },
          data: updateData
        });

        if (item.id) {
          await tx.inventoryReceivingItem.update({
            where: { id: item.id },
            data: { remainingQuantity: convertedReceivedQty }
          });
        }

        logsToCreate.push({
          inventoryItemId: existingItem.id,
          type: 'STOCK_IN',
          quantity: convertedReceivedQty,
          quantityBefore: qtyBefore,
          quantityAfter: qtyAfter,
          changeQty: convertedReceivedQty,
          cost: item.totalCost,
          reason: `Stock receiving #${existingReceiving.receivingNumber} (Inv: ${existingReceiving.invoiceNumber || 'N/A'}, Unit: ${item.quantity} ${item.unit} -> ${convertedReceivedQty} ${existingItem.unit})`,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          supplierId: resolvedSupplierId,
          receivingId: existingReceiving.id,
          userId: req.user?.id || null,
        });
      }

      if (logsToCreate.length > 0) {
        await tx.inventoryLog.createMany({
          data: logsToCreate
        });
      }

      const updated = await tx.inventoryReceiving.update({
        where: { id: existingReceiving.id },
        data: {
          status: 'RECEIVED',
          receivedById: req.user?.id || existingReceiving.receivedById,
          notes: cleanedNotes,
        },
        include: {
          supplier: true,
          branch: true,
          receivedBy: { select: { id: true, name: true, email: true } },
          items: { include: { inventoryItem: true } }
        }
      });

      return updated;
    }, {
      maxWait: 20000,
      timeout: 60000
    });

    logAudit({
      userId: req.user?.id || 1,
      action: 'STOCK_RECEIVING_CONFIRMED',
      entity: 'InventoryReceiving',
      entityId: String(updatedReceiving.id),
      newValue: { receivingNumber: updatedReceiving.receivingNumber, status: 'RECEIVED' },
      req
    }).catch(err => console.error('Audit log error:', err?.message));

    emitToAdmin('inventory:update', { receiving: updatedReceiving });
    emitToVendor('inventory:update', { receiving: updatedReceiving });

    return res.json({
      message: 'Stock receiving confirmed successfully. Inventory quantities updated.',
      receiving: updatedReceiving
    });
  } catch (error) {
    console.error('Confirm receiving error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to confirm stock receiving.' });
  }
};

/**
 * Cancel a draft stock receiving transaction
 */
const cancelReceiving = async (req, res) => {
  const { id } = req.params;

  try {
    const receiving = await prisma.inventoryReceiving.findUnique({
      where: { id: parseInt(id, 10) }
    });

    if (!receiving) {
      return res.status(404).json({ error: 'Stock receiving record not found.' });
    }

    if (receiving.status === 'RECEIVED') {
      return res.status(400).json({ error: 'Completed receivings cannot be cancelled.' });
    }

    const updated = await prisma.inventoryReceiving.update({
      where: { id: receiving.id },
      data: { status: 'CANCELLED' }
    });

    await logAudit({
      userId: req.user.id,
      action: 'STOCK_RECEIVING_CANCELLED',
      entity: 'InventoryReceiving',
      entityId: updated.id,
      newValue: { receivingNumber: updated.receivingNumber, status: 'CANCELLED' },
      req
    });

    return res.json({ message: 'Stock receiving draft cancelled.', receiving: updated });
  } catch (error) {
    console.error('Cancel receiving error:', error);
    return res.status(500).json({ error: 'Failed to cancel stock receiving.' });
  }
};

/** Remove selected receiving records and reverse their received quantities atomically. */
const removeReceivingRecords = async (tx, ids, userId = null) => {
  const records = await tx.inventoryReceiving.findMany({ where: { id: { in: ids } }, include: { items: true } });
  const recordIds = records.map((record) => record.id);
  const itemIds = records.flatMap((record) => record.items.map((item) => item.id));
  const quantityByInventoryItem = new Map();

  for (const record of records) {
    if (String(record.status).toUpperCase() !== 'RECEIVED') continue;
    for (const item of record.items) {
      quantityByInventoryItem.set(item.inventoryItemId, (quantityByInventoryItem.get(item.inventoryItemId) || 0) + Number(item.quantity || 0));
    }
  }

  for (const [inventoryItemId, quantity] of quantityByInventoryItem) {
    const item = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { stockLevel: true, costPrice: true } });
    if (!item) continue;
    const quantityAfter = item.stockLevel - quantity;
    await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { stockLevel: quantityAfter } });
    await tx.inventoryLog.create({
      data: {
        inventoryItemId,
        type: 'ADJUSTMENT',
        quantity,
        quantityBefore: item.stockLevel,
        quantityAfter,
        changeQty: -quantity,
        cost: quantity * (item.costPrice || 0),
        reason: 'Stock reversed after receiving history cleanup',
        userId,
      },
    });
  }

  const logConditions = [];
  if (recordIds.length) logConditions.push({ receivingId: { in: recordIds } });
  if (itemIds.length) logConditions.push({ receivingItemId: { in: itemIds } });
  if (logConditions.length) await tx.inventoryLog.deleteMany({ where: { OR: logConditions } });
  if (recordIds.length) {
    await tx.inventoryReceivingItem.deleteMany({ where: { receivingId: { in: recordIds } } });
    await tx.inventoryReceiving.deleteMany({ where: { id: { in: recordIds } } });
  }
  return records;
};

/** Delete a receiving record, reversing stock when it had already been received. */
const deleteReceiving = async (req, res) => {
  const { id } = req.params;

  try {
    const recId = parseInt(id, 10);
    const receiving = await prisma.inventoryReceiving.findUnique({ where: { id: recId }, select: { id: true, receivingNumber: true, status: true } });

    if (!receiving) {
      return res.status(404).json({ error: 'Stock receiving record not found.' });
    }

    const [deletedReceiving] = await prisma.$transaction((tx) => removeReceivingRecords(tx, [recId], req.user?.id || null));
    if (!deletedReceiving) return res.status(404).json({ error: 'Stock receiving record not found.' });

    await logAudit({
      userId: req.user?.id || 1,
      action: 'STOCK_RECEIVING_DELETED',
      entity: 'InventoryReceiving',
      entityId: String(recId),
      oldValue: { receivingNumber: receiving.receivingNumber, status: receiving.status, stockReversed: receiving.status === 'RECEIVED' },
      req
    });

    emitToAdmin('inventory:update', { receivingDeletedId: recId });
    emitToVendor('inventory:update', { receivingDeletedId: recId });

    return res.json({ message: `Stock receiving record #${receiving.receivingNumber} deleted successfully${receiving.status === 'RECEIVED' ? '; received quantities were subtracted from inventory.' : '.'}` });
  } catch (error) {
    console.error('Delete receiving error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete receiving record.' });
  }
};

/**
 * Bulk delete selected receiving records and reverse quantities from confirmed receipts.
 */
const bulkDeleteReceivings = async (req, res) => {
  const { ids, branchId, status = 'DRAFT' } = req.body;
  if (!Array.isArray(ids) && !isValid('InventoryReceivingStatus', String(status).toUpperCase())) {
    return res.status(400).json({ error: 'Invalid inventory receiving status value.' });
  }

  try {
    const where = {};
    if (Array.isArray(ids)) {
      const parsedIds = [...new Set(ids.map(id => Number.parseInt(id, 10)).filter(Number.isInteger))];
      if (!parsedIds.length) return res.status(400).json({ error: 'Select at least one valid receiving record.' });
      where.id = { in: parsedIds };
      where.status = { in: ['DRAFT', 'CANCELLED', 'RECEIVED'] };
    } else if (status === 'DRAFT' || status === 'CANCELLED') {
      where.status = status;
    } else {
      where.status = { in: ['DRAFT', 'CANCELLED'] };
    }

    if (branchId && branchId !== 'all') {
      where.branchId = parseInt(branchId, 10);
    }

    const targets = await prisma.inventoryReceiving.findMany({
      where,
      select: { id: true, receivingNumber: true, status: true }
    });

    if (targets.length === 0) {
      return res.json({ message: 'No eligible draft or cancelled receiving records found for deletion.', count: 0 });
    }

    const targetIds = targets.map(t => t.id);

    const receivedCount = targets.filter((record) => String(record.status).toUpperCase() === 'RECEIVED').length;
    await prisma.$transaction((tx) => removeReceivingRecords(tx, targetIds, req.user?.id || null));

    await logAudit({
      userId: req.user?.id || 1,
      action: 'BULK_STOCK_RECEIVING_DELETED',
      entity: 'InventoryReceiving',
      entityId: `bulk_${targetIds.length}`,
      oldValue: { count: targetIds.length, receivedCount, targetIds, stockReversed: receivedCount > 0 },
      req
    });

    emitToAdmin('inventory:update', { bulkDeletedReceivings: targetIds });
    emitToVendor('inventory:update', { bulkDeletedReceivings: targetIds });

    return res.json({
      message: `Successfully deleted ${targetIds.length} receiving records${receivedCount ? `; stock was reversed for ${receivedCount} received record(s)` : ''}.`,
      count: targetIds.length
    });
  } catch (error) {
    console.error('Bulk delete receivings error:', error);
    return res.status(500).json({ error: 'Failed to perform bulk deletion of receiving records.' });
  }
};

/**
 * Update an existing draft stock receiving transaction
 */
const updateReceiving = async (req, res) => {
  const { id } = req.params;
  const { supplierId, invoiceNumber, receivingRef, branchId, receivingDate, notes, items, status, batchNumber: docBatch, draftNewItems } = req.body;
  if (status != null && !isValid('InventoryReceivingStatus', String(status).toUpperCase())) {
    return res.status(400).json({ error: 'Invalid inventory receiving status value.' });
  }

  try {
    const recId = parseInt(id, 10);
    const existing = await prisma.inventoryReceiving.findUnique({
      where: { id: recId },
      include: { items: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Stock receiving record not found.' });
    }

    if (existing.status === 'RECEIVED') {
      return res.status(400).json({ error: 'Confirmed stock receiving records cannot be edited.' });
    }

    const isConfirmed = status && status.toUpperCase() === 'RECEIVED';
    const targetStatus = isConfirmed ? 'RECEIVED' : 'DRAFT';
    const requestedDiscountPercent = req.body.discountPercent !== undefined
      ? (req.body.discountPercent == null ? null : Number(req.body.discountPercent))
      : (existing.discountPercent ?? null);
    let discountAmount = roundReceivingMoney(Number(req.body.discount ?? existing.discount ?? 0));
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || (requestedDiscountPercent !== null && (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent < 0 || requestedDiscountPercent > 100))) {
      return res.status(400).json({ error: 'Discount must be a valid non-negative amount.' });
    }
    const newDraftLines = targetStatus === 'DRAFT' && Array.isArray(draftNewItems) ? draftNewItems : [];
    const invalidDraftLine = newDraftLines.find(item => {
      const quantity = Number(item?.quantity ?? item?.stockLevel);
      const cost = Number(item?.unitCost ?? item?.costPrice ?? 0);
      return !String(item?.name || '').trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0;
    });
    if (invalidDraftLine) {
      return res.status(400).json({ error: `Draft item "${String(invalidDraftLine.name || 'Unnamed').trim()}" needs a name, a positive quantity, and a valid non-negative cost.` });
    }

    const candidateBranchId = branchId !== undefined ? (branchId ? parseInt(branchId, 10) : null) : existing.branchId;
    const candidateSupplierId = supplierId !== undefined ? (supplierId ? parseInt(supplierId, 10) : null) : existing.supplierId;

    const [branchCheck, supplierCheck] = await Promise.all([
      candidateBranchId ? prisma.branch.findUnique({ where: { id: candidateBranchId }, select: { id: true } }) : null,
      candidateSupplierId ? prisma.supplier.findUnique({ where: { id: candidateSupplierId }, select: { id: true } }) : null
    ]);

    const resolvedBranchId = branchCheck ? branchCheck.id : existing.branchId;
    const resolvedSupplierId = supplierCheck ? supplierCheck.id : existing.supplierId;

    const resolvedDate = receivingDate ? new Date(receivingDate) : existing.receivingDate;
    const shipmentBatch = docBatch ? String(docBatch).trim() : null;

    let preparedItems = [];
    let calculatedTotalCost = 0.0;

    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const invId = parseInt(item.inventoryItemId, 10);
        const qty = parseFloat(item.quantity);
        const cost = item.unitCost !== undefined && item.unitCost !== '' ? parseFloat(item.unitCost) : 0.0;

        if (!Number.isInteger(invId) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) {
          return res.status(400).json({ error: 'All receiving items must specify a valid inventory item and positive quantity.' });
        }

        const itemTotal = roundReceivingMoney(qty * cost);
        calculatedTotalCost = roundReceivingMoney(calculatedTotalCost + itemTotal);

        preparedItems.push({
          inventoryItemId: invId,
          quantity: qty,
          unit: item.unit || 'PCS',
          unitCost: cost,
          totalCost: itemTotal,
          batchNumber: shipmentBatch || (item.batchNumber ? String(item.batchNumber).trim() : null),
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          notes: item.notes ? String(item.notes).trim() : null,
        });
      }
    }

    if (preparedItems.length > 0) {
      const requestedIds = [...new Set(preparedItems.map(item => item.inventoryItemId))];
      const existingCatalogItems = await prisma.inventoryItem.findMany({ where: { id: { in: requestedIds } }, select: { id: true } });
      const existingIds = new Set(existingCatalogItems.map(item => item.id));
      const missingIds = requestedIds.filter(itemId => !existingIds.has(itemId));
      if (missingIds.length) {
        return res.status(400).json({ error: `Some selected inventory items no longer exist (IDs: ${missingIds.join(', ')}). Refresh the catalog and select those items again.` });
      }
    }

    for (const item of newDraftLines) {
      calculatedTotalCost = roundReceivingMoney(calculatedTotalCost + roundReceivingMoney(Number(item.quantity ?? item.stockLevel) * Number(item.unitCost ?? item.costPrice ?? 0)));
    }
    if (requestedDiscountPercent !== null) {
      discountAmount = roundReceivingMoney(calculatedTotalCost * requestedDiscountPercent / 100);
    }
    let notesValue = notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes;
    if (newDraftLines.length) {
      const draftJson = JSON.stringify(newDraftLines);
      notesValue = notesValue ? `${notesValue}\n__DRAFT_ITEMS__:${draftJson}` : `__DRAFT_ITEMS__:${draftJson}`;
    }

    const updatedReceiving = await prisma.$transaction(async (tx) => {
      if (Array.isArray(items)) {
        await tx.inventoryReceivingItem.deleteMany({
          where: { receivingId: recId }
        });
      }

      const updated = await tx.inventoryReceiving.update({
        where: { id: recId },
        data: {
          ...(receivingRef && receivingRef.trim() !== existing.receivingNumber ? { receivingNumber: receivingRef.trim() } : {}),
          supplierId: resolvedSupplierId,
          invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : existing.invoiceNumber,
          branchId: resolvedBranchId,
          receivingDate: resolvedDate,
          receivedById: req.user?.id || existing.receivedById,
          notes: notesValue,
          status: targetStatus,
          ...(Array.isArray(items) || newDraftLines.length || req.body.discount !== undefined || req.body.discountPercent !== undefined ? {
            subtotal: calculatedTotalCost,
            discount: discountAmount,
            discountPercent: requestedDiscountPercent,
            totalCost: roundReceivingMoney(Math.max(0, calculatedTotalCost - discountAmount))
          } : {}),
          ...(preparedItems.length > 0 ? {
            items: {
              create: preparedItems
            }
          } : {})
        },
        include: {
          supplier: true,
          branch: true,
          receivedBy: { select: { id: true, name: true, email: true } },
          items: { include: { inventoryItem: true } }
        }
      });

      // Idempotency: only apply stock increments if transitioning from non-RECEIVED to RECEIVED
      if (existing.status !== 'RECEIVED' && targetStatus === 'RECEIVED') {
        const itemIds = [...new Set(updated.items.map(i => i.inventoryItemId))];
        const existingItems = await tx.inventoryItem.findMany({
          where: { id: { in: itemIds } }
        });
        const itemsMap = new Map(existingItems.map(i => [i.id, i]));
        const logsToCreate = [];

        for (const item of updated.items) {
          const existingItem = itemsMap.get(item.inventoryItemId);

          if (!existingItem) {
            throw new Error(`Inventory item ID ${item.inventoryItemId} not found.`);
          }

          const qtyBefore = existingItem.stockLevel;
          const qtyAfter = qtyBefore + item.quantity;
          const purchaseQty = item.quantity;
          const purchaseUnitCost = item.unitCost > 0 ? item.unitCost : (existingItem.costPrice || 0);

          // Weighted-Average Costing: ((qtyBefore * oldCost) + (purchaseQty * purchaseCost)) / qtyAfter
          let calculatedCostPrice = existingItem.costPrice || 0;
          if (qtyAfter > 0) {
            if (qtyBefore <= 0) {
              calculatedCostPrice = purchaseUnitCost;
            } else {
              const prevTotalValue = qtyBefore * (existingItem.costPrice || 0);
              const purchaseTotalValue = purchaseQty * purchaseUnitCost;
              calculatedCostPrice = (prevTotalValue + purchaseTotalValue) / qtyAfter;
              calculatedCostPrice = Math.round(calculatedCostPrice * 10000) / 10000;
            }
          }

          existingItem.stockLevel = qtyAfter;
          existingItem.costPrice = calculatedCostPrice;

          const updateData = {
            stockLevel: qtyAfter,
            costPrice: calculatedCostPrice,
          };
          if (item.expiryDate) {
            updateData.expiryDate = item.expiryDate;
          }

          await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: updateData
          });

          logsToCreate.push({
            inventoryItemId: existingItem.id,
            type: 'STOCK_IN',
            quantity: item.quantity,
            quantityBefore: qtyBefore,
            quantityAfter: qtyAfter,
            changeQty: item.quantity,
            cost: item.totalCost,
            reason: `Stock receiving #${updated.receivingNumber} (Inv: ${updated.invoiceNumber || 'N/A'})`,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            supplierId: resolvedSupplierId,
            receivingId: updated.id,
            userId: req.user?.id || null,
          });
        }

        if (logsToCreate.length > 0) {
          await tx.inventoryLog.createMany({
            data: logsToCreate
          });
        }
      }

      return updated;
    }, {
      maxWait: 20000,
      timeout: 60000
    });

    logAudit({
      userId: req.user?.id || 1,
      action: isConfirmed ? 'STOCK_RECEIVING_CONFIRMED' : 'STOCK_RECEIVING_DRAFT_UPDATED',
      entity: 'InventoryReceiving',
      entityId: String(updatedReceiving.id),
      newValue: { receivingNumber: updatedReceiving.receivingNumber, status: updatedReceiving.status },
      req
    }).catch(err => console.error('Audit log error:', err?.message));

    if (isConfirmed) {
      emitToAdmin('inventory:update', { receiving: updatedReceiving });
      emitToVendor('inventory:update', { receiving: updatedReceiving });
    }

    return res.json({
      message: isConfirmed ? 'Stock receiving confirmed successfully. Inventory quantities updated.' : 'Draft stock receiving updated successfully.',
      receiving: updatedReceiving
    });
  } catch (error) {
    console.error('Update receiving error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to update stock receiving.' });
  }
};

/**
 * Parse CSV/Excel upload and match items against inventory catalog
 */
const previewImportCSV = async (req, res) => {
  const { rows, rawText, fileBase64, fileName } = req.body;
  try {
    const result = await parseAndMatchInvoice({
      rawText: rawText || (Array.isArray(rows) ? JSON.stringify(rows) : ''),
      fileBase64,
      fileName,
    });
    return res.json(result);
  } catch (error) {
    console.error('Preview import error:', error);
    return res.status(500).json({ error: 'Failed to parse import data.' });
  }
};

/**
 * AI / OCR Invoice extraction & item matching preview
 */
const previewAiOcrInvoice = async (req, res) => {
  const { rawText, imageBase64, fileBase64, fileName, supplierName } = req.body;
  try {
    const result = await parseAndMatchInvoice({
      rawText,
      fileBase64: fileBase64 || imageBase64,
      fileName,
      supplierNameHint: supplierName,
    });
    return res.json(result);
  } catch (error) {
    console.error('AI OCR preview error:', error);
    return res.status(500).json({ error: 'Failed to extract invoice data.' });
  }
};


const aiInsightsCache = new Map();
const AI_INSIGHTS_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

/**
 * Real AI Machine Learning Insights & Demand Intelligence via Groq LLM
 */
const getSmartAIInsights = async (req, res) => {
  const { branchId, forceRefresh, refresh } = req.query;
  const branchKey = branchId || 'all';
  const shouldBypassCache = forceRefresh === 'true' || refresh === 'true';

  if (!shouldBypassCache && aiInsightsCache.has(branchKey)) {
    const cachedEntry = aiInsightsCache.get(branchKey);
    if (Date.now() - cachedEntry.timestamp < AI_INSIGHTS_CACHE_TTL_MS) {
      return res.json(cachedEntry.payload);
    }
  }

  const branchFilter = (branchId && branchId !== 'all') ? { branchId: parseInt(branchId, 10) } : {};

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      items,
      recentUsageLogs,
      completedOrders30Days,
      menuItemsWithRecipes,
      etaRecords,
      oldestOrder,
    ] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: branchFilter,
        include: { supplier: true, branch: true }
      }),
      prisma.inventoryLog.findMany({
        where: {
          type: 'USAGE',
          createdAt: { gte: sevenDaysAgo },
          ...(branchFilter.branchId ? { inventoryItem: { branchId: branchFilter.branchId } } : {})
        }
      }),
      prisma.order.findMany({
        where: {
          status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] },
          createdAt: { gte: thirtyDaysAgo },
          ...branchFilter,
        },
        include: {
          orderItems: { include: { menuItem: { include: { recipeItems: true } } } }
        }
      }),
      prisma.menuItem.findMany({
        where: branchFilter,
        include: { recipeItems: { include: { inventoryItem: true } } }
      }),
      prisma.eTAPrediction.findMany({
        where: { actualTime: { not: null } },
        take: 50,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.findFirst({
        where: branchFilter,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      })
    ]);

    // Calculate usage rates per inventory item over last 7 days
    const itemUsage7DaysMap = {};
    recentUsageLogs.forEach(log => {
      const id = log.inventoryItemId;
      itemUsage7DaysMap[id] = (itemUsage7DaysMap[id] || 0) + Math.abs(log.changeQty);
    });

    let lowStockCount = 0;
    let criticalCount = 0;
    let totalValuation = 0.0;
    let expiringCount = 0;

    const stockRiskAlerts = [];

    for (const item of items) {
      if (item.stockLevel <= item.minThreshold) lowStockCount++;
      if (item.stockLevel <= item.minThreshold / 2) criticalCount++;
      totalValuation += item.stockLevel * (item.costPrice || 0);

      const isExpiringSoon = item.expiryDate && new Date(item.expiryDate) <= sevenDaysFromNow;
      if (isExpiringSoon) expiringCount++;

      const usage7Days = itemUsage7DaysMap[item.id] || 0;
      const dailyUsageRate = usage7Days / 7;
      const projected7DayDemand = parseFloat((dailyUsageRate * 7).toFixed(1));
      const suggestedRestock = Math.max(0, Math.ceil((projected7DayDemand + item.minThreshold) - item.stockLevel));

      const hasSalesHistory = usage7Days > 0;

      let confidenceBadge = 'HIGH';
      if (!hasSalesHistory) confidenceBadge = 'LOW';
      else if (usage7Days < 5) confidenceBadge = 'MEDIUM';

      let riskMessage = null;
      if (item.stockLevel <= 0) {
        riskMessage = `Stock is depleted (0 ${item.unit}). Immediate restock needed.`;
      } else if (item.stockLevel <= item.minThreshold / 2) {
        riskMessage = `Critical stock level (${item.stockLevel} ${item.unit}). High risk of stockout.`;
        confidenceBadge = 'HIGH';
      } else if (item.stockLevel <= item.minThreshold) {
        riskMessage = `Stock (${item.stockLevel} ${item.unit}) is below safety threshold (${item.minThreshold} ${item.unit}).`;
      } else if (isExpiringSoon) {
        riskMessage = `Batch expiring within 7 days on ${new Date(item.expiryDate).toLocaleDateString()}.`;
      } else if (!hasSalesHistory) {
        riskMessage = `Not enough completed POS sales are available to produce a reliable demand forecast.`;
      }

      if (riskMessage || suggestedRestock > 0) {
        stockRiskAlerts.push({
          id: item.id,
          name: item.name,
          currentStock: item.stockLevel,
          minThreshold: item.minThreshold,
          unit: item.unit || 'PCS',
          confidenceBadge,
          hasSalesHistory,
          message: riskMessage || `Projected 7-day demand is ~${projected7DayDemand} ${item.unit}.`,
          forecast: projected7DayDemand,
          forecastLabel: hasSalesHistory ? `~${projected7DayDemand} ${item.unit}` : 'Insufficient Sales History',
          suggestedRestock: suggestedRestock > 0 ? suggestedRestock : (item.stockLevel <= item.minThreshold ? Math.ceil(item.minThreshold * 1.5 - item.stockLevel) : 0),
        });
      }
    }

    // Factual Food Cost & Margin Calculations for Menu Items
    const foodCostOptimization = [];
    const highFoodCostItems = [];

    menuItemsWithRecipes.forEach(m => {
      let recipeCost = 0.0;
      m.recipeItems.forEach(r => {
        if (r.inventoryItem) {
          recipeCost += r.quantity * (r.inventoryItem.costPrice || 0);
        }
      });

      if (m.price > 0 && recipeCost > 0) {
        const foodCostPct = (recipeCost / m.price) * 100;
        const grossMargin = m.price - recipeCost;
        if (foodCostPct > 35) {
          highFoodCostItems.push({
            name: m.name,
            sellingPrice: m.price,
            recipeCost: parseFloat(recipeCost.toFixed(2)),
            foodCostPct: parseFloat(foodCostPct.toFixed(1)),
            grossMargin: parseFloat(grossMargin.toFixed(2))
          });
        }
      }
    });

    if (highFoodCostItems.length > 0) {
      highFoodCostItems.sort((a, b) => b.foodCostPct - a.foodCostPct);
      highFoodCostItems.slice(0, 3).forEach(item => {
        foodCostOptimization.push({
          title: `High Food Cost: ${item.name}`,
          impact: item.foodCostPct > 50 ? 'High' : 'Medium',
          description: `Food cost ratio is ${item.foodCostPct}% (Cost: Rs.${item.recipeCost}, Selling Price: Rs.${item.sellingPrice}). Review supplier prices or portion sizes to improve margin.`
        });
      });
    } else {
      foodCostOptimization.push({
        title: 'Supplier Purchasing Optimization',
        impact: 'Medium',
        description: 'Review main supplier pricing for high-usage ingredients to maximize gross profit margins.'
      });
    }

    // Kitchen Prep Time Calculation (Req 12)
    let avgPrepTimeMins = null;
    let avgPrepTimeLabel = "Not Enough Data";
    let isActualPrepTime = false;

    if (etaRecords.length >= 3) {
      const totalActual = etaRecords.reduce((s, r) => s + (r.actualTime || 0), 0);
      avgPrepTimeMins = parseFloat((totalActual / etaRecords.length).toFixed(1));
      avgPrepTimeLabel = `${avgPrepTimeMins} mins`;
      isActualPrepTime = true;
    } else if (menuItemsWithRecipes.length > 0) {
      const totalConfigured = menuItemsWithRecipes.reduce((s, m) => s + (m.prepTime || 5), 0);
      avgPrepTimeMins = parseFloat((totalConfigured / menuItemsWithRecipes.length).toFixed(1));
      avgPrepTimeLabel = `${avgPrepTimeMins} mins (configured)`;
      isActualPrepTime = false;
    }

    // Model Prediction Accuracy (Req 11)
    let predictionAccuracy = null;
    let accuracyLabel = "Not Enough Data";
    let accuracyHelper = "Prediction accuracy will appear after enough forecast history is available.";

    if (etaRecords.length >= 10) {
      const varianceList = etaRecords.map(r => Math.abs(r.adjustedEta - (r.actualTime || r.adjustedEta)));
      const avgVariance = varianceList.reduce((s, v) => s + v, 0) / etaRecords.length;
      const basePrep = avgPrepTimeMins || 8;
      predictionAccuracy = parseFloat(Math.max(60, Math.min(99, 100 - (avgVariance / basePrep) * 100)).toFixed(1));
      accuracyLabel = `${predictionAccuracy}%`;
      accuracyHelper = "Evaluated against actual POS transaction trends";
    }

    // POS Data Confidence Score (Req 13)
    const oldestDate = oldestOrder?.createdAt ? new Date(oldestOrder.createdAt) : now;
    const dateSpanDays = Math.max(1, Math.ceil((now - oldestDate) / (1000 * 60 * 60 * 24)));
    const totalOrdersCountAllTime = completedOrders30Days.length;

    let posConfidenceScore = 'LOW — Limited Data';
    if (totalOrdersCountAllTime >= 50 && dateSpanDays >= 14) {
      posConfidenceScore = 'HIGH';
    } else if (totalOrdersCountAllTime >= 10 && dateSpanDays >= 3) {
      posConfidenceScore = 'MEDIUM';
    }

    const posConfidenceExplanation = `Based on ${totalOrdersCountAllTime} completed order(s) over ${dateSpanDays} day(s)`;

    // Call Groq LLM for AI analysis with multi-key failover
    const inventoryStatsPayload = {
      totalItems: items.length,
      lowStockCount,
      criticalCount,
      totalValuation: Math.round(totalValuation),
      expiringCount,
      stockRiskAlerts: stockRiskAlerts.slice(0, 5)
    };

    const salesSummaryPayload = {
      totalOrders30Days: completedOrders30Days.length,
      dateSpanDays
    };

    const kitchenStatsPayload = {
      avgPrepTime: avgPrepTimeMins,
      isActualPrepTime
    };

    let aiGroqResult = null;
    try {
      aiGroqResult = await generateRealAIInsightsWithGroq({
        inventoryStats: inventoryStatsPayload,
        salesSummary: salesSummaryPayload,
        kitchenStats: kitchenStatsPayload
      });
    } catch (groqErr) {
      console.warn('[GroqService] Groq call failed across all keys:', groqErr.message);
    }

    const isAiAvailable = !!aiGroqResult;
    const aiErrorMessage = isAiAvailable ? null : 'AI analysis is temporarily unavailable.';

    const executiveSummary = aiGroqResult?.executiveSummary ||
      (isAiAvailable ? `Monitored ${items.length} inventory items across ${completedOrders30Days.length} recent order(s).` : null);

    const finalOptimizations = (aiGroqResult?.foodCostOptimization && aiGroqResult.foodCostOptimization.length > 0)
      ? aiGroqResult.foodCostOptimization
      : (isAiAvailable ? foodCostOptimization : []);

    const payload = {
      success: true,
      aiAvailable: isAiAvailable,
      aiErrorMessage,
      insights: {
        predictionAccuracy,
        accuracyLabel,
        accuracyHelper,
        avgPrepTimeMins,
        avgPrepTimeLabel,
        isActualPrepTime,
        stockRiskAlerts: stockRiskAlerts.slice(0, 10),
        foodCostOptimization: finalOptimizations,
        executiveSummary,
        posConfidenceScore,
        posConfidenceExplanation,
        totalInventoryItems: items.length,
        lowStockCount,
        totalValuation: Math.round(totalValuation)
      }
    };

    if (isAiAvailable) {
      aiInsightsCache.set(branchKey, { payload, timestamp: Date.now() });
    }

    return res.json(payload);
  } catch (error) {
    console.error('getSmartAIInsights error:', error);
    return res.status(500).json({ error: 'Failed to generate AI insights.' });
  }
};

/**
 * AI Suggest ingredients for a MenuItem using existing inventory catalog items only
 */
const suggestRecipeForMenuItem = async (req, res) => {
  const { menuItemId } = req.body;
  if (!menuItemId) {
    return res.status(400).json({ error: 'menuItemId is required.' });
  }

  try {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: parseInt(menuItemId, 10) }
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    const inventoryItems = await prisma.inventoryItem.findMany({
      select: { id: true, name: true, category: true, unit: true, costPrice: true }
    });

    let suggestions = [];
    let aiAvailable = false;

    try {
      const prompt = `You are a professional chef & inventory system manager.
Menu Item Name: "${menuItem.name}"
Category: "${menuItem.category || 'General'}"
Description: "${menuItem.description || ''}"

Available Inventory Catalog:
${JSON.stringify(inventoryItems.map(i => ({ id: i.id, name: i.name, unit: i.unit, category: i.category })))}

CRITICAL RULE: You MUST ONLY suggest ingredients that exist in the Available Inventory Catalog list above. Do NOT invent new ingredient names.

Return ONLY a raw JSON array of objects with keys:
- "inventoryItemId": integer (matching exact id from catalog)
- "quantity": number (typical quantity for 1 serving, e.g. 0.15 for 150g in KG, 1 for PCS, 0.02 for 20g in KG)
- "unit": string (matching unit from catalog or standard sub-unit like G, ML, PCS, KG)
- "reason": brief string explanation`;

      const groqRes = await callGroqAPI({
        model: getGroqModel(),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      });

      const rawContent = groqRes?.choices?.[0]?.message?.content || '[]';
      const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        suggestions = parsed.filter(s => Number.isInteger(Number(s.inventoryItemId)) && Number.isFinite(Number(s.quantity)) && Number(s.quantity) > 0);
        aiAvailable = suggestions.length > 0;
      }
    } catch (aiErr) {
      console.warn('Groq AI recipe suggestion API error, switching to rule-based fallback:', String(aiErr.message || 'AI request failed').replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]').replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]'));
    }

    if (!suggestions || suggestions.length === 0) {
      const nameLower = menuItem.name.toLowerCase();
      suggestions = inventoryItems
        .filter(inv => {
          const invLower = inv.name.toLowerCase();
          return nameLower.includes(invLower) || invLower.split(' ').some(w => w.length > 3 && nameLower.includes(w));
        })
        .slice(0, 6)
        .map(inv => ({
          inventoryItemId: inv.id,
          quantity: inv.unit === 'KG' ? 0.15 : (inv.unit === 'G' ? 150 : 1),
          unit: inv.unit,
          reason: 'Matched from catalog'
        }));
    }

    const result = suggestions
      .map(s => {
        const inv = inventoryItems.find(i => i.id === parseInt(s.inventoryItemId, 10));
        if (!inv) return null;
        return {
          inventoryItemId: inv.id,
          name: inv.name,
          unit: s.unit || inv.unit,
          inventoryUnit: inv.unit,
          quantity: parseFloat(s.quantity) || 1,
          costPrice: inv.costPrice,
          isAiSuggested: aiAvailable,
          reason: s.reason || (aiAvailable ? 'AI Match' : 'Catalog match')
        };
      })
      .filter(Boolean);

    return res.json({ suggestions: result, aiAvailable, source: aiAvailable ? 'groq' : 'catalog-fallback' });
  } catch (error) {
    console.error('Suggest recipe error:', error);
    return res.status(500).json({ error: 'Failed to generate AI recipe suggestions.' });
  }
};

/**
 * Bulk import standard preset recipes for POS menu items using existing inventory
 */
const bulkImportPresetRecipes = async (req, res) => {
  try {
    const menuItems = await prisma.menuItem.findMany();
    const inventoryItems = await prisma.inventoryItem.findMany();

    const PRESET_MAPPINGS = {
      'Zinger Burger': [
        { name: 'Chicken Fillet', qty: 0.15, unit: 'KG' },
        { name: 'Burger Bun', qty: 1, unit: 'PCS' },
        { name: 'Fresh Lettuce', qty: 0.02, unit: 'KG' },
        { name: 'Mayonnaise Sauce', qty: 0.02, unit: 'KG' },
        { name: 'Cooking Oil', qty: 0.05, unit: 'L' }
      ],
      'Classic Beef Cheeseburger': [
        { name: 'Burger Bun', qty: 1, unit: 'PCS' },
        { name: 'Cheddar Cheese Slices', qty: 1, unit: 'PCS' },
        { name: 'Fresh Lettuce', qty: 0.02, unit: 'KG' },
        { name: 'Mayonnaise Sauce', qty: 0.015, unit: 'KG' }
      ],
      'Chicken Tikka Supreme Pizza': [
        { name: 'Pizza Dough Base', qty: 1, unit: 'PCS' },
        { name: 'Mozzarella Cheese', qty: 0.15, unit: 'KG' },
        { name: 'Chicken Boti / Tikka', qty: 0.2, unit: 'KG' },
        { name: 'Pizza Sauce', qty: 0.08, unit: 'KG' },
        { name: 'Fresh Onions', qty: 0.03, unit: 'KG' }
      ],
      'Margherita Pizza': [
        { name: 'Pizza Dough Base', qty: 1, unit: 'PCS' },
        { name: 'Mozzarella Cheese', qty: 0.18, unit: 'KG' },
        { name: 'Pizza Sauce', qty: 0.08, unit: 'KG' }
      ],
      'Special Chicken Biryani': [
        { name: 'Basmati Rice', qty: 0.25, unit: 'KG' },
        { name: 'Chicken Whole', qty: 0.25, unit: 'KG' },
        { name: 'Cooking Oil', qty: 0.04, unit: 'L' },
        { name: 'Biryani Spice Mix', qty: 0.015, unit: 'KG' },
        { name: 'Fresh Onions', qty: 0.05, unit: 'KG' }
      ],
      'Creamy Chicken Alfredo Pasta': [
        { name: 'Penne Pasta', qty: 0.15, unit: 'KG' },
        { name: 'Chicken Fillet', qty: 0.12, unit: 'KG' },
        { name: 'Heavy Cooking Cream', qty: 0.1, unit: 'L' },
        { name: 'Mozzarella Cheese', qty: 0.04, unit: 'KG' }
      ],
      'Fresh Mango Thick Shake': [
        { name: 'Fresh Milk', qty: 0.25, unit: 'L' },
        { name: 'Sugar', qty: 0.03, unit: 'KG' }
      ],
      'Special Karak Doodh Chai': [
        { name: 'Fresh Milk', qty: 0.2, unit: 'L' },
        { name: 'Black Tea Leaves (Chai Patti)', qty: 0.01, unit: 'KG' },
        { name: 'Sugar', qty: 0.015, unit: 'KG' }
      ]
    };

    let count = 0;

    await prisma.$transaction(async (tx) => {
      for (const [menuName, items] of Object.entries(PRESET_MAPPINGS)) {
        const menuItem = menuItems.find(m => m.name.toLowerCase().trim() === menuName.toLowerCase().trim());
        if (!menuItem) continue;

        const toCreate = [];
        for (const ing of items) {
          const invItem = inventoryItems.find(i =>
            i.name.toLowerCase().trim().includes(ing.name.toLowerCase().trim()) ||
            ing.name.toLowerCase().trim().includes(i.name.toLowerCase().trim())
          );
          if (invItem) {
            toCreate.push({
              menuItemId: menuItem.id,
              inventoryItemId: invItem.id,
              quantity: ing.qty,
              unit: ing.unit
            });
          }
        }

        if (toCreate.length > 0) {
          await tx.recipeItem.deleteMany({ where: { menuItemId: menuItem.id } });
          for (const item of toCreate) {
            await tx.recipeItem.create({ data: item });
          }
          count++;
        }
      }
    });

    return res.json({ message: `Successfully imported recipe presets for ${count} menu items.` });
  } catch (error) {
    console.error('Bulk import recipe error:', error);
    return res.status(500).json({ error: 'Failed to bulk import recipe presets.' });
  }
};

const updateBatchExpiry = async (req, res) => {
  const { source, receivingItemId, inventoryItemId, expiryDate, batchNumber, receivingRef, invoiceNumber } = req.body;

  try {
    const formattedExpiry = expiryDate ? new Date(expiryDate) : null;

    if (receivingItemId || source === 'BATCH') {
      const recItemId = parseInt(receivingItemId, 10);
      if (isNaN(recItemId)) {
        return res.status(400).json({ error: 'Valid receivingItemId is required.' });
      }

      const existing = await prisma.inventoryReceivingItem.findUnique({
        where: { id: recItemId },
        include: { receiving: true, inventoryItem: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Receiving item record not found.' });
      }

      const updatedRecItem = await prisma.inventoryReceivingItem.update({
        where: { id: recItemId },
        data: {
          expiryDate: formattedExpiry,
          ...(batchNumber !== undefined && batchNumber !== null ? { batchNumber: String(batchNumber).trim() } : {})
        },
        include: {
          inventoryItem: { include: { supplier: true, branch: true } },
          receiving: { include: { supplier: true } }
        }
      });

      // Update parent receiving record invoiceNumber & receivingNumber if updated
      if (existing.receivingId && (receivingRef || invoiceNumber)) {
        await prisma.inventoryReceiving.update({
          where: { id: existing.receivingId },
          data: {
            ...(receivingRef ? { receivingNumber: String(receivingRef).trim() } : {}),
            ...(invoiceNumber ? { invoiceNumber: String(invoiceNumber).trim() } : {}),
          }
        }).catch(() => null);
      }

      // Update associated catalog item expiry date if relevant
      if (existing.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: existing.inventoryItemId },
          data: {
            expiryDate: formattedExpiry,
            ...(batchNumber ? { sku: String(batchNumber).trim() } : {})
          }
        }).catch(() => null);
      }

      emitToAdmin('inventory:update', { type: 'BATCH_EXPIRY_UPDATE', item: updatedRecItem });
      emitToVendor('inventory:update', { type: 'BATCH_EXPIRY_UPDATE', item: updatedRecItem });
      await logAudit({
        userId: req.user?.id || 1,
        action: 'UPDATE_BATCH_EXPIRY',
        entity: 'InventoryReceivingItem',
        entityId: recItemId,
        newValue: { expiryDate, batchNumber },
        req
      });

      return res.json({ message: 'Batch expiry updated successfully.', item: updatedRecItem });
    } else if (inventoryItemId || source === 'ITEM') {
      const invId = parseInt(inventoryItemId, 10);
      if (isNaN(invId)) {
        return res.status(400).json({ error: 'Valid inventoryItemId is required.' });
      }

      const existing = await prisma.inventoryItem.findUnique({
        where: { id: invId }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found.' });
      }

      const updatedItem = await prisma.inventoryItem.update({
        where: { id: invId },
        data: {
          expiryDate: formattedExpiry,
          ...(batchNumber !== undefined && batchNumber !== null ? { sku: String(batchNumber).trim() } : {})
        },
        include: { supplier: true, branch: true }
      });

      emitToAdmin('inventory:update', { type: 'ITEM_EXPIRY_UPDATE', item: updatedItem });
      emitToVendor('inventory:update', { type: 'ITEM_EXPIRY_UPDATE', item: updatedItem });
      await logAudit({
        userId: req.user?.id || 1,
        action: 'UPDATE_ITEM_EXPIRY',
        entity: 'InventoryItem',
        entityId: invId,
        newValue: { expiryDate, batchNumber },
        req
      });

      return res.json({ message: 'Inventory item expiry updated successfully.', item: updatedItem });
    } else {
      return res.status(400).json({ error: 'Missing receivingItemId or inventoryItemId.' });
    }
  } catch (error) {
    console.error('Update batch expiry error:', error);
    return res.status(500).json({ error: 'Failed to update batch expiry date.' });
  }
};

/**
 * Clear expiry date for a single batch receiving item or catalog item
 */
const clearBatchExpiry = async (req, res) => {
  const { source, receivingItemId, inventoryItemId } = req.body;

  try {
    if (source === 'BATCH' || receivingItemId) {
      const recItemId = parseInt(receivingItemId, 10);
      if (isNaN(recItemId)) {
        return res.status(400).json({ error: 'Valid receivingItemId is required.' });
      }

      const existing = await prisma.inventoryReceivingItem.findUnique({
        where: { id: recItemId },
        include: { inventoryItem: true }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Batch receiving item not found.' });
      }

      await prisma.inventoryReceivingItem.update({
        where: { id: recItemId },
        data: { expiryDate: null }
      });

      emitToAdmin('inventory:update', { type: 'BATCH_EXPIRY_CLEARED', receivingItemId: recItemId });
      emitToVendor('inventory:update', { type: 'BATCH_EXPIRY_CLEARED', receivingItemId: recItemId });

      await logAudit({
        userId: req.user?.id || 1,
        action: 'CLEAR_BATCH_EXPIRY',
        entity: 'InventoryReceivingItem',
        entityId: recItemId,
        newValue: { expiryDate: null },
        req
      });

      return res.json({ message: 'Batch expiry date removed successfully.' });
    } else if (inventoryItemId || source === 'ITEM') {
      const invId = parseInt(inventoryItemId, 10);
      if (isNaN(invId)) {
        return res.status(400).json({ error: 'Valid inventoryItemId is required.' });
      }

      const existing = await prisma.inventoryItem.findUnique({
        where: { id: invId }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Inventory item not found.' });
      }

      await prisma.inventoryItem.update({
        where: { id: invId },
        data: { expiryDate: null }
      });

      emitToAdmin('inventory:update', { type: 'ITEM_EXPIRY_CLEARED', inventoryItemId: invId });
      emitToVendor('inventory:update', { type: 'ITEM_EXPIRY_CLEARED', inventoryItemId: invId });

      await logAudit({
        userId: req.user?.id || 1,
        action: 'CLEAR_ITEM_EXPIRY',
        entity: 'InventoryItem',
        entityId: invId,
        newValue: { expiryDate: null },
        req
      });

      return res.json({ message: 'Item expiry date removed successfully.' });
    } else {
      return res.status(400).json({ error: 'Missing receivingItemId or inventoryItemId.' });
    }
  } catch (error) {
    console.error('Clear batch expiry error:', error);
    return res.status(500).json({ error: 'Failed to clear expiry date.' });
  }
};

/**
 * Bulk clear expiry date for multiple batch items / catalog items
 */
const bulkClearBatchExpiry = async (req, res) => {
  const { items = [] } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Array of items is required.' });
  }

  try {
    let clearedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.source === 'BATCH' || item.receivingItemId) {
          const recItemId = parseInt(item.receivingItemId, 10);
          if (!isNaN(recItemId)) {
            await tx.inventoryReceivingItem.update({
              where: { id: recItemId },
              data: { expiryDate: null }
            }).catch(() => null);
            clearedCount++;
          }
        } else if (item.inventoryItemId || item.source === 'ITEM') {
          const invId = parseInt(item.inventoryItemId, 10);
          if (!isNaN(invId)) {
            await tx.inventoryItem.update({
              where: { id: invId },
              data: { expiryDate: null }
            }).catch(() => null);
            clearedCount++;
          }
        }
      }
    });

    emitToAdmin('inventory:update', { type: 'BULK_EXPIRY_CLEARED', count: clearedCount });
    emitToVendor('inventory:update', { type: 'BULK_EXPIRY_CLEARED', count: clearedCount });

    await logAudit({
      userId: req.user?.id || 1,
      action: 'BULK_CLEAR_EXPIRY',
      entity: 'InventoryReceivingItem',
      entityId: 'BULK',
      newValue: { clearedCount },
      req
    });

    return res.json({
      message: `Successfully cleared expiry dates for ${clearedCount} batch / item records.`,
      clearedCount
    });
  } catch (error) {
    console.error('Bulk clear expiry error:', error);
    return res.status(500).json({ error: 'Failed to bulk clear expiry dates.' });
  }
};

/**
 * Bulk add new inventory items to catalog (without stock increment)
 */
const bulkAddInventoryItems = async (req, res) => {
  const { items, branchId } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required.' });
  }

  try {
    let resolvedBranchId = branchId ? parseInt(branchId, 10) : (req.user?.branchId || null);
    if (resolvedBranchId) {
      const bExists = await prisma.branch.findUnique({ where: { id: resolvedBranchId } });
      if (!bExists) {
        const firstB = await prisma.branch.findFirst({ select: { id: true } });
        resolvedBranchId = firstB ? firstB.id : 1;
      }
    } else {
      const firstB = await prisma.branch.findFirst({ select: { id: true } });
      resolvedBranchId = firstB ? firstB.id : 1;
    }

    const results = [];
    let importedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const itemData = items[i];
      const {
        name,
        unit,
        category,
        sku,
        costPrice,
        minThreshold,
        maxThreshold,
        supplierId,
        expiryDate,
        rowIndex
      } = itemData;

      if (!name || !String(name).trim()) {
        results.push({
          index: rowIndex !== undefined ? rowIndex : i,
          name: name || 'Unnamed Item',
          success: false,
          error: 'Item name is required.'
        });
        failedCount++;
        continue;
      }

      if (!unit || !String(unit).trim()) {
        results.push({
          index: rowIndex !== undefined ? rowIndex : i,
          name: String(name).trim(),
          success: false,
          error: 'Unit is required.'
        });
        failedCount++;
        continue;
      }

      const trimmedName = String(name).trim();
      const trimmedUnit = String(unit).trim().toUpperCase();

      // Check if duplicate item name already exists in branch
      const existing = await prisma.inventoryItem.findFirst({
        where: {
          name: { equals: trimmedName, mode: 'insensitive' },
          branchId: resolvedBranchId
        }
      });

      if (existing) {
        results.push({
          index: rowIndex !== undefined ? rowIndex : i,
          name: trimmedName,
          success: true,
          alreadyExists: true,
          duplicate: true,
          item: existing,
          message: 'Item already exists in catalog; linked existing item.'
        });
        duplicateCount++;
        continue;
      }

      // Check SKU uniqueness if provided
      if (sku && String(sku).trim()) {
        const existingSku = await prisma.inventoryItem.findFirst({
          where: {
            sku: String(sku).trim(),
            branchId: resolvedBranchId
          }
        });
        if (existingSku) {
          results.push({
            index: rowIndex !== undefined ? rowIndex : i,
            name: trimmedName,
            success: false,
            error: `SKU "${sku}" is already assigned to item "${existingSku.name}".`,
            existingItem: existingSku
          });
          failedCount++;
          continue;
        }
      }

      try {
        const newItem = await prisma.inventoryItem.create({
          data: {
            name: trimmedName,
            stockLevel: 0.0, // Strictly 0 initial stock! Catalog creation does NOT increase stock!
            unit: trimmedUnit,
            minThreshold: minThreshold ? parseFloat(minThreshold) : 10.0,
            maxThreshold: maxThreshold ? parseFloat(maxThreshold) : 100.0,
            category: (category && category !== 'General') ? category : inferCategoryFromItemName(trimmedName),
            sku: sku ? String(sku).trim() : null,
            costPrice: costPrice ? parseFloat(costPrice) : 0.0,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            supplierId: supplierId ? parseInt(supplierId, 10) : null,
            branchId: resolvedBranchId
          },
          include: { supplier: true, branch: true }
        });

        emitToAdmin('inventory:update', newItem);
        emitToVendor('inventory:update', newItem);

        results.push({
          index: rowIndex !== undefined ? rowIndex : i,
          name: trimmedName,
          success: true,
          item: newItem
        });
        importedCount++;
      } catch (itemErr) {
        console.error(`Bulk add catalog item "${trimmedName}" error:`, itemErr);
        results.push({
          index: rowIndex !== undefined ? rowIndex : i,
          name: trimmedName,
          success: false,
          error: itemErr.code === 'P2002' ? 'Duplicate item name in this branch.' : (itemErr.message || 'Database error')
        });
        failedCount++;
      }
    }

    return res.status(200).json({
      message: `${items.length} items processed: ${importedCount} imported, ${duplicateCount} duplicates skipped, ${failedCount} failed.`,
      summary: {
        total: items.length,
        imported: importedCount,
        skipped: duplicateCount,
        duplicates: duplicateCount,
        failed: failedCount,
        // Keep these aliases for existing clients.
        savedCount: importedCount + duplicateCount,
        failedCount
      },
      results
    });
  } catch (error) {
    console.error('Bulk add inventory items error:', error);
    return res.status(500).json({ error: 'Failed to process bulk catalog saving.' });
  }
};

/**
 * Confirm and save a user-validated alias for intelligent item matching
 */
const confirmItemAlias = async (req, res) => {
  const { rawName, confirmedName, inventoryItemId } = req.body;

  if (!rawName || !confirmedName) {
    return res.status(400).json({ error: 'Both rawName and confirmedName are required to learn an alias.' });
  }

  try {
    const success = saveLearnedAlias(rawName, confirmedName, inventoryItemId);
    if (!success) {
      return res.status(400).json({ error: 'Failed to save alias. Please provide valid item names.' });
    }

    return res.json({
      message: `Alias learned successfully: "${rawName}" will now automatically match "${confirmedName}".`,
      rawName,
      confirmedName,
      inventoryItemId: inventoryItemId ? parseInt(inventoryItemId, 10) : null
    });
  } catch (error) {
    console.error('Confirm alias error:', error);
    return res.status(500).json({ error: 'Internal server error while saving alias.' });
  }
};

/**
 * Get all learned aliases
 */
const getLearnedAliasesController = async (req, res) => {
  try {
    const aliases = getLearnedAliases();
    return res.json({ aliases });
  } catch (error) {
    console.error('Get aliases error:', error);
    return res.status(500).json({ error: 'Failed to retrieve learned aliases.' });
  }
};

module.exports = {
  getSmartAIInsights,
  getInventorySummary,
  getInventoryItems,
  addInventoryItem,
  bulkAddInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
  bulkDeleteInventoryItems,
  stockIn,
  adjustStock,
  restockItem,
  getRecipeForMenuItem,
  saveRecipeForMenuItem,
  deleteRecipeForMenuItem,
  bulkDeleteRecipes,
  getRecipeMargins,
  getExpiringItems,
  updateBatchExpiry,
  clearBatchExpiry,
  bulkClearBatchExpiry,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers,
  getInventoryLogs,
  deleteInventoryLog,
  bulkDeleteInventoryLogs,
  getForecast,
  getInventoryAlerts,
  recalculateInventoryForecasts,
  getReceivings,
  generateReceivingRef,
  getReceivingById,
  createReceiving,
  confirmReceiving,
  cancelReceiving,
  deleteReceiving,
  bulkDeleteReceivings,
  updateReceiving,
  previewImportCSV,
  previewAiOcrInvoice,
  suggestRecipeForMenuItem,
  bulkImportPresetRecipes,
  confirmItemAlias,
  getLearnedAliasesController
};
