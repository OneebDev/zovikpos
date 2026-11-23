const { prisma: defaultPrisma } = require('../config/db');
const { Prisma } = require('@prisma/client');
const { convertUnit } = require('../utils/unitConverter');
const { emitToAdmin, emitToVendor } = require('../sockets/socket');

/**
 * FIFO batch deduction helper.
 * Deducts `neededQty` from the oldest InventoryReceivingItem batches first,
 * recording a separate InventoryLog per batch consumed with full traceability.
 *
 * @param {object}  db        Prisma client (or transaction)
 * @param {object}  invItem   InventoryItem record (stockLevel = level before any deduction)
 * @param {number}  neededQty Total quantity to deduct (in invItem.unit)
 * @param {object}  logMeta   Extra log fields: { reason, orderId, orderItemId, userId }
 * @returns {number} totalDeducted
 */
async function _fifoBatchDeduct(db, invItem, neededQty, logMeta) {
  const batches = await db.inventoryReceivingItem.findMany({
    where: {
      inventoryItemId: invItem.id,
      remainingQuantity: { gt: 0 }
    },
    orderBy: { createdAt: 'asc' }
  });

  let remaining = neededQty;
  let totalDeducted = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;

    const batchAvail = batch.remainingQuantity ?? batch.quantity;
    const takeFromBatch = Math.min(remaining, batchAvail);
    const newBatchRemaining = batchAvail - takeFromBatch;

    // Update batch remaining quantity
    await db.inventoryReceivingItem.update({
      where: { id: batch.id },
      data: { remainingQuantity: newBatchRemaining }
    });

    const qtyBefore = invItem.stockLevel - totalDeducted;
    const qtyAfter = qtyBefore - takeFromBatch;

    await db.inventoryLog.create({
      data: {
        inventoryItemId: invItem.id,
        quantityBefore: qtyBefore,
        quantityAfter: qtyAfter,
        changeQty: -takeFromBatch,
        cost: (batch.unitCost || 0) * takeFromBatch,
        unitCost: batch.unitCost || 0,
        type: 'USAGE',
        batchRemaining: newBatchRemaining,
        batchNumber: batch.batchNumber || null,
        expiryDate: batch.expiryDate || null,
        receivingItemId: batch.id,
        receivingId: batch.receivingId || null,
        reason: logMeta.reason,
        orderId: logMeta.orderId || null,
        orderItemId: logMeta.orderItemId || null,
        userId: logMeta.userId || null
      }
    });

    totalDeducted += takeFromBatch;
    remaining -= takeFromBatch;
  }

  // If remaining > 0 here, batches are exhausted but stockLevel was already updated by caller
  return totalDeducted;
}

/**
 * Deducts inventory for a confirmed order (status: PAID).
 * Uses FIFO batch-layer deduction from InventoryReceivingItem records when available.
 * Sorts inventory rows in ascending order to prevent deadlocks.
 *
 * @param {number} orderId Order ID to deduct stock for
 * @param {number|null} userId Staff/System User ID triggering deduction
 * @param {object} [tx] Optional Prisma Transaction Client. If null, creates its own transaction.
 */
const deductInventoryForConfirmedOrder = async (orderId, userId = null, tx = null) => {
  const runDeduction = async (db) => {
    const order = await db.order.findUnique({
      where: { id: parseInt(orderId, 10) },
      include: {
        orderItems: {
          include: {
            menuItem: {
              include: {
                recipeItems: {
                  include: {
                    inventoryItem: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!order) {
      throw new Error(`Order #${orderId} not found for inventory deduction.`);
    }

    // Idempotency check: check if order already has an INVENTORY_DEDUCTED status history entry or USAGE logs (Rule 3)
    const existingDeductionRecord = await db.orderStatusHistory.findFirst({
      where: {
        orderId: order.id,
        newStatus: 'INVENTORY_DEDUCTED',
      },
    });

    const existingUsageLogs = await db.inventoryLog.findMany({
      where: {
        orderId: order.id,
        type: 'USAGE',
      },
    });

    if (existingDeductionRecord || existingUsageLogs.length > 0) {
      console.log(`[InventoryDeduction] Order #${order.orderNumber} already has deduction record. Skipping redundant deduction.`);
      return { success: true, message: 'Already deducted.', itemsToEmit: [] };
    }

    // Identify and lock all target inventory items in ASCENDING ID order to avoid deadlocks
    const targetInvItemIds = new Set();
    for (const orderItem of order.orderItems) {
      const recipes = orderItem.menuItem?.recipeItems || [];
      if (recipes.length > 0) {
        for (const recipe of recipes) {
          if (recipe.inventoryItem?.id) targetInvItemIds.add(recipe.inventoryItem.id);
        }
      } else {
        const targetName = orderItem.nameSnapshot || orderItem.menuItem?.name;
        if (targetName) {
          const match = await db.inventoryItem.findFirst({
            where: {
              name: { equals: targetName, mode: 'insensitive' },
              ...(order.branchId ? { branchId: order.branchId } : {})
            },
            select: { id: true }
          });
          if (match) targetInvItemIds.add(match.id);
        }
      }
    }

    const sortedInvIds = Array.from(targetInvItemIds).sort((a, b) => a - b);
    if (sortedInvIds.length > 0) {
      await db.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id IN (${Prisma.join(sortedInvIds)})
        ORDER BY id ASC
        FOR UPDATE;
      `;
    }

    const itemsToEmit = [];

    for (const orderItem of order.orderItems) {
      const menuItem = orderItem.menuItem;
      const itemQty = orderItem.quantity;
      if (!menuItem) continue;

      // Rule 2 & Rule 4: Deduct prepared portion without ever dropping below 0
      const currentPreparedStock = Math.max(0, menuItem.stock ?? 0);
      const preparedDeduct = Math.min(currentPreparedStock, itemQty);
      const cookToOrderDeduct = itemQty - preparedDeduct;

      if (preparedDeduct > 0) {
        await db.menuItem.update({
          where: { id: menuItem.id },
          data: { stock: { decrement: preparedDeduct } }
        });
        console.log(`[InventoryDeduction] Item "${orderItem.nameSnapshot}" (Order #${order.orderNumber}): deducted ${preparedDeduct} prepared portion(s). Remaining: ${currentPreparedStock - preparedDeduct}`);
      }

      // If cookToOrderDeduct <= 0, no raw ingredients need to be deducted
      if (cookToOrderDeduct <= 0) {
        continue;
      }

      // Check if menuItem has explicit RecipeItems mapped
      const recipes = menuItem?.recipeItems || [];

      if (recipes.length > 0) {
        for (const recipe of recipes) {
          const invItem = recipe.inventoryItem;
          if (!invItem) continue;

          // Branch consistency check
          if (order.branchId && invItem.branchId && invItem.branchId !== order.branchId) {
            console.warn(`[InventoryDeduction] Branch mismatch: Order branch ${order.branchId} vs Inventory branch ${invItem.branchId} for ${invItem.name}`);
          }

          const rawNeededQty = recipe.quantity * cookToOrderDeduct;
          let convertedQty;
          try {
            convertedQty = convertUnit(rawNeededQty, recipe.unit, invItem.unit, invItem.packageConversions);
          } catch (convErr) {
            console.warn(`[InventoryDeduction] Unit conversion failed from '${recipe.unit}' to '${invItem.unit}' for '${invItem.name}': ${convErr.message}. Falling back to raw qty ${rawNeededQty}.`);
            convertedQty = rawNeededQty;
          }

          // Atomic stock update & re-fetch current value
          const currentInv = await db.inventoryItem.findUnique({
            where: { id: invItem.id },
            select: { stockLevel: true, costPrice: true, name: true }
          });
          const qtyBefore = currentInv?.stockLevel ?? invItem.stockLevel;

          const updatedInv = await db.inventoryItem.update({
            where: { id: invItem.id },
            data: { stockLevel: { decrement: convertedQty } }
          });
          const qtyAfter = updatedInv.stockLevel;

          const logMeta = {
            reason: `Order #${order.orderNumber} confirmed (${orderItem.nameSnapshot} x${itemQty})`,
            orderId: order.id,
            orderItemId: orderItem.id,
            userId: userId || order.userId || null
          };

          const hasBatches = await db.inventoryReceivingItem.count({
            where: { inventoryItemId: invItem.id, remainingQuantity: { gt: 0 } }
          });

          if (hasBatches > 0) {
            await _fifoBatchDeduct(db, { ...invItem, stockLevel: qtyBefore }, convertedQty, logMeta);
          } else {
            await db.inventoryLog.create({
              data: {
                inventoryItemId: invItem.id,
                quantityBefore: qtyBefore,
                quantityAfter: qtyAfter,
                changeQty: -convertedQty,
                cost: (invItem.costPrice || 0) * convertedQty,
                unitCost: invItem.costPrice || 0,
                type: 'USAGE',
                reason: logMeta.reason,
                orderId: order.id,
                orderItemId: orderItem.id,
                userId: userId || order.userId || null
              }
            });
          }

          itemsToEmit.push(updatedInv);
        }
      } else {
        // Fallback: search for inventory item with matching name
        const targetName = orderItem.nameSnapshot || menuItem?.name;
        const matchingInvItem = targetName ? await db.inventoryItem.findFirst({
          where: {
            name: { equals: targetName, mode: 'insensitive' },
            ...(order.branchId ? { branchId: order.branchId } : {})
          }
        }) : null;

        if (matchingInvItem) {
          const currentInv = await db.inventoryItem.findUnique({
            where: { id: matchingInvItem.id },
            select: { stockLevel: true, costPrice: true }
          });
          const qtyBefore = currentInv?.stockLevel ?? matchingInvItem.stockLevel;

          const updatedInv = await db.inventoryItem.update({
            where: { id: matchingInvItem.id },
            data: { stockLevel: { decrement: itemQty } }
          });
          const qtyAfter = updatedInv.stockLevel;

          const logMeta = {
            reason: `Order #${order.orderNumber} confirmed (${orderItem.nameSnapshot} x${itemQty})`,
            orderId: order.id,
            orderItemId: orderItem.id,
            userId: userId || order.userId || null
          };

          const hasBatches = await db.inventoryReceivingItem.count({
            where: { inventoryItemId: matchingInvItem.id, remainingQuantity: { gt: 0 } }
          });

          if (hasBatches > 0) {
            await _fifoBatchDeduct(db, { ...matchingInvItem, stockLevel: qtyBefore }, itemQty, logMeta);
          } else {
            await db.inventoryLog.create({
              data: {
                inventoryItemId: matchingInvItem.id,
                quantityBefore: qtyBefore,
                quantityAfter: qtyAfter,
                changeQty: -itemQty,
                cost: (matchingInvItem.costPrice || 0) * itemQty,
                unitCost: matchingInvItem.costPrice || 0,
                type: 'USAGE',
                reason: logMeta.reason,
                orderId: order.id,
                orderItemId: orderItem.id,
                userId: userId || order.userId || null
              }
            });
          }

          itemsToEmit.push(updatedInv);
        } else {
          console.warn(`[InventoryDeduction] No recipe or name match for "${orderItem.nameSnapshot || menuItem?.name}" in Order #${order.orderNumber}. Skipping stock deduction for this item.`);
        }
      }
    }

    // Record atomic idempotency status history entry (Rule 3)
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        previousStatus: order.status,
        newStatus: 'INVENTORY_DEDUCTED',
        changedByUserId: userId || order.userId || null,
        note: `Inventory deducted for Order #${order.orderNumber}`,
      },
    });

    return { success: true, message: `Inventory deducted for Order #${order.orderNumber}`, itemsToEmit };
  };

  let result;
  if (tx) {
    result = await runDeduction(tx);
  } else {
    result = await defaultPrisma.$transaction(async (innerTx) => {
      return await runDeduction(innerTx);
    });
  }

  // Emit socket events asynchronously after DB operations complete
  if (result.itemsToEmit && result.itemsToEmit.length > 0) {
    setImmediate(() => {
      for (const item of result.itemsToEmit) {
        emitToAdmin('inventory:update', item);
        emitToVendor('inventory:update', item);
      }
    });
  }

  return { success: true, message: result.message };
};

/**
 * Restores inventory for a cancelled or refunded order.
 * Reverses FIFO batch deductions by restoring remainingQuantity on each batch.
 * Ensures strict idempotency at (orderId, orderItemId, inventoryItemId, receivingItemId) level.
 *
 * @param {number} orderId Order ID to restore stock for
 * @param {number|null} userId Staff/System User ID triggering restoration
 * @param {string} reason Reason for restoration
 * @param {object} [tx] Optional Prisma Transaction Client. If null, runs in own transaction.
 */
const restoreInventoryForOrder = async (orderId, userId = null, reason = 'Order cancelled', tx = null) => {
  const runRestoration = async (db) => {
    const order = await db.order.findUnique({
      where: { id: parseInt(orderId, 10) },
      include: {
        orderItems: {
          include: {
            menuItem: true
          }
        }
      }
    });

    if (!order) {
      throw new Error(`Order #${orderId} not found for inventory restoration.`);
    }

    // Rule 3: Idempotency check: if already restored, exit immediately
    const existingRestoreRecord = await db.orderStatusHistory.findFirst({
      where: {
        orderId: order.id,
        newStatus: 'INVENTORY_RESTORED',
      },
    });

    if (existingRestoreRecord) {
      console.log(`[InventoryRestoration] Order #${order.orderNumber} already has INVENTORY_RESTORED record. Skipping.`);
      return { success: true, message: 'Already restored.', itemsToEmit: [] };
    }

    // Only restore if inventory was actually deducted!
    const wasDeducted = await db.orderStatusHistory.findFirst({
      where: {
        orderId: order.id,
        newStatus: 'INVENTORY_DEDUCTED',
      },
    });

    // Find all USAGE logs generated for this order
    const usageLogs = await db.inventoryLog.findMany({
      where: {
        orderId: order.id,
        type: 'USAGE',
      },
    });

    if (!wasDeducted && usageLogs.length === 0) {
      console.log(`[InventoryRestoration] Order #${order.orderNumber} was never deducted. Skipping restoration.`);
      return { success: true, message: 'Never deducted.', itemsToEmit: [] };
    }

    // Find any existing RESTORATION logs for this order to guarantee idempotency
    const existingRestorations = await db.inventoryLog.findMany({
      where: {
        orderId: order.id,
        type: 'RESTORATION',
      },
    });

    // Restore MenuItem stock for prepared portions that were deducted
    for (const orderItem of order.orderItems) {
      if (orderItem.menuItem) {
        const itemUsageLogs = usageLogs.filter(l => l.orderItemId === orderItem.id);
        let cookedPortions = 0;
        if (itemUsageLogs.length > 0 && orderItem.menuItem.recipeItems?.length > 0) {
          const firstRecipe = orderItem.menuItem.recipeItems[0];
          const matchedLog = itemUsageLogs.find(l => l.inventoryItemId === firstRecipe.inventoryItemId);
          if (matchedLog && firstRecipe.quantity > 0) {
            const rawUsed = Math.abs(matchedLog.changeQty);
            cookedPortions = Math.min(orderItem.quantity, Math.round(rawUsed / firstRecipe.quantity));
          }
        }
        const preparedToRestore = Math.max(0, orderItem.quantity - cookedPortions);
        if (preparedToRestore > 0) {
          await db.menuItem.update({
            where: { id: orderItem.menuItemId },
            data: { stock: { increment: preparedToRestore } },
          });
          console.log(`[InventoryRestoration] Restored ${preparedToRestore} prepared portion(s) for "${orderItem.nameSnapshot}" (Order #${order.orderNumber})`);
        }
      }
    }

    // Sort target inventory item IDs in ascending order for lock
    const targetInvItemIds = [...new Set(usageLogs.map(l => l.inventoryItemId).filter(Boolean))].sort((a, b) => a - b);
    if (targetInvItemIds.length > 0) {
      await db.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id IN (${Prisma.join(targetInvItemIds)})
        ORDER BY id ASC
        FOR UPDATE;
      `;
    }

    const itemsToEmit = [];

    // Restore raw inventory stock based on USAGE logs
    for (const usageLog of usageLogs) {
      const alreadyRestored = existingRestorations.some(
        r => r.orderItemId === usageLog.orderItemId &&
             r.inventoryItemId === usageLog.inventoryItemId &&
             r.receivingItemId === usageLog.receivingItemId
      );

      if (alreadyRestored) {
        console.log(`[InventoryRestoration] Usage log ID ${usageLog.id} already restored for Order #${order.orderNumber}. Skipping.`);
        continue;
      }

      const invItem = await db.inventoryItem.findUnique({
        where: { id: usageLog.inventoryItemId }
      });

      if (invItem) {
        const restoreQty = Math.abs(usageLog.changeQty);
        const qtyBefore = invItem.stockLevel;

        const updatedInv = await db.inventoryItem.update({
          where: { id: invItem.id },
          data: { stockLevel: { increment: restoreQty } }
        });
        const qtyAfter = updatedInv.stockLevel;

        // If this log was tied to a specific FIFO batch, restore that batch's remainingQuantity
        if (usageLog.receivingItemId) {
          const batch = await db.inventoryReceivingItem.findUnique({
            where: { id: usageLog.receivingItemId }
          });
          if (batch) {
            const restoredBatchRemaining = (batch.remainingQuantity ?? 0) + restoreQty;
            const cappedRemaining = Math.min(restoredBatchRemaining, batch.quantity);
            await db.inventoryReceivingItem.update({
              where: { id: batch.id },
              data: { remainingQuantity: cappedRemaining }
            });
          }
        }

        await db.inventoryLog.create({
          data: {
            inventoryItemId: invItem.id,
            quantityBefore: qtyBefore,
            quantityAfter: qtyAfter,
            changeQty: restoreQty,
            cost: (usageLog.unitCost || invItem.costPrice || 0) * restoreQty,
            unitCost: usageLog.unitCost || invItem.costPrice || 0,
            batchNumber: usageLog.batchNumber || null,
            receivingItemId: usageLog.receivingItemId || null,
            type: 'RESTORATION',
            reason: `${reason} - Order #${order.orderNumber}`,
            orderId: order.id,
            orderItemId: usageLog.orderItemId,
            userId: userId || null
          }
        });

        itemsToEmit.push(updatedInv);
      }
    }

    // Record atomic idempotency status history entry (Rule 3)
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        previousStatus: order.status,
        newStatus: 'INVENTORY_RESTORED',
        changedByUserId: userId || null,
        note: `Inventory restored for Order #${order.orderNumber}: ${reason}`,
      },
    });

    return { success: true, message: `Inventory restored for Order #${order.orderNumber}`, itemsToEmit };
  };

  let result;
  if (tx) {
    result = await runRestoration(tx);
  } else {
    result = await defaultPrisma.$transaction(async (innerTx) => {
      return await runRestoration(innerTx);
    });
  }

  setImmediate(() => {
    if (result.itemsToEmit && result.itemsToEmit.length > 0) {
      for (const item of result.itemsToEmit) {
        emitToAdmin('inventory:update', item);
        emitToVendor('inventory:update', item);
      }
    }
  });

  return { success: true, message: result.message };
};

module.exports = {
  deductInventoryForConfirmedOrder,
  deductInventoryForOrder: deductInventoryForConfirmedOrder,
  restoreInventoryForOrder
};
