const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/db');
const { convertUnit } = require('../utils/unitConverter');
const { logAudit } = require('../middleware/auditMiddleware');
const { emitToAdmin, emitToVendor } = require('../sockets/socket');

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

class BatchError extends Error {
  constructor(message, status = 400, card = null) {
    super(message);
    this.status = status;
    this.card = card;
  }
}

const asPositiveIntegerOrNull = (value, label, cardLabel) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new BatchError(`${label} is invalid.`, 400, cardLabel);
  return parsed;
};

const normalizeDraft = (draft, index) => {
  const label = String(draft?.label || draft?.receivingRef || `Delivery ${index + 1}`);
  const items = Array.isArray(draft?.items) ? draft.items : [];
  const newItems = Array.isArray(draft?.draftNewItems) ? draft.draftNewItems : [];
  if (!items.length && !newItems.length) throw new BatchError('Add at least one item with a positive quantity.', 400, label);

  const normalizedItems = items.map((item) => {
    const inventoryItemId = Number(item?.inventoryItemId);
    const quantity = Number(item?.quantity);
    const unitCost = item?.unitCost == null || item.unitCost === '' ? 0 : Number(item.unitCost);
    if (!Number.isInteger(inventoryItemId) || inventoryItemId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw new BatchError('An existing catalog item needs a valid item, positive quantity, and non-negative cost.', 400, label);
    }
    return {
      ...item,
      inventoryItemId,
      name: String(item?.name || item?.searchTerm || '').trim(),
      quantity,
      unitCost,
      unit: String(item.unit || 'PCS'),
    };
  });
  const normalizedNewItems = newItems.map((item) => {
    const quantity = Number(item?.quantity ?? item?.stockLevel);
    const unitCost = Number(item?.unitCost ?? item?.costPrice ?? 0);
    const name = String(item?.name || '').trim();
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw new BatchError(`New item “${name || 'Unnamed'}” needs a name, positive quantity, and non-negative cost.`, 400, label);
    }
    return { ...item, name, quantity, unitCost, unit: String(item.unit || 'KG') };
  });
  const requestedDiscountPercent = draft?.discountPercent == null ? null : Number(draft.discountPercent);
  if (requestedDiscountPercent !== null && (!Number.isFinite(requestedDiscountPercent) || requestedDiscountPercent < 0 || requestedDiscountPercent > 100)) {
    throw new BatchError('Discount percentage must be between 0 and 100.', 400, label);
  }
  let subtotal = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  subtotal += normalizedNewItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  subtotal = roundMoney(subtotal);
  const requestedDiscount = Number(draft?.discount || 0);
  if (!Number.isFinite(requestedDiscount) || requestedDiscount < 0) throw new BatchError('Discount must be non-negative.', 400, label);
  const discount = requestedDiscountPercent == null ? roundMoney(requestedDiscount) : roundMoney(subtotal * requestedDiscountPercent / 100);
  if (discount > subtotal) throw new BatchError('Discount cannot exceed the delivery subtotal.', 400, label);

  const receivingDate = draft?.receivingDate ? new Date(draft.receivingDate) : new Date();
  if (Number.isNaN(receivingDate.getTime())) throw new BatchError('Receiving date is invalid.', 400, label);
  const rawReference = String(draft?.receivingRef || '').trim();
  const receivingNumber = rawReference || `REC-${new Date().getFullYear()}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  return {
    label,
    existingId: draft?.existingReceivingId ? asPositiveIntegerOrNull(draft.existingReceivingId, 'Existing draft id', label) : null,
    receivingNumber,
    supplierId: asPositiveIntegerOrNull(draft?.supplierId, 'Supplier', label),
    branchId: asPositiveIntegerOrNull(draft?.branchId, 'Branch', label),
    invoiceNumber: draft?.invoiceNumber ? String(draft.invoiceNumber).trim() : null,
    shipmentBatchNumber: draft?.batchNumber ? String(draft.batchNumber).trim() : null,
    receivingDate,
    notes: draft?.notes ? String(draft.notes).trim() : null,
    subtotal,
    discount,
    discountPercent: requestedDiscountPercent,
    items: normalizedItems,
    draftNewItems: normalizedNewItems,
  };
};

const resolveDraftScope = async (tx, draft, req) => {
  if (draft.supplierId && !await tx.supplier.findUnique({ where: { id: draft.supplierId }, select: { id: true } })) {
    throw new BatchError('Selected supplier was not found.', 400, draft.label);
  }
  let branchId = draft.branchId || req.user?.branchId || null;
  if (branchId && !await tx.branch.findUnique({ where: { id: branchId }, select: { id: true } })) {
    throw new BatchError('Selected branch was not found.', 400, draft.label);
  }
  if (!branchId) branchId = (await tx.branch.findFirst({ select: { id: true } }))?.id || null;
  const knownIds = [...new Set(draft.items.map((item) => item.inventoryItemId))];
  if (knownIds.length) {
    const found = await tx.inventoryItem.findMany({ where: { id: { in: knownIds } }, select: { id: true } });
    const foundIds = new Set(found.map((item) => item.id));
    const stillValidItems = [];
    for (const line of draft.items) {
      if (foundIds.has(line.inventoryItemId)) {
        stillValidItems.push(line);
        continue;
      }
      if (!line.name) {
        throw new BatchError(`Inventory item ${line.inventoryItemId} no longer exists and has no saved item name. Refresh the catalog and select it again.`, 400, draft.label);
      }
      const replacement = await tx.inventoryItem.findFirst({
        where: { name: { equals: line.name, mode: 'insensitive' }, branchId },
        select: { id: true },
      });
      if (replacement) {
        stillValidItems.push({ ...line, inventoryItemId: replacement.id });
        continue;
      }
      draft.draftNewItems.push({
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        category: line.category || 'General',
        expiryDate: line.expiryDate || null,
        batchNumber: line.batchNumber || null,
      });
    }
    draft.items = stillValidItems;
  }
  return { branchId, supplierId: draft.supplierId };
};

const createDraftInTransaction = async (tx, draft, req) => {
  const scope = await resolveDraftScope(tx, draft, req);
  const duplicate = await tx.inventoryReceiving.findUnique({ where: { receivingNumber: draft.receivingNumber }, select: { id: true } });
  if (duplicate && duplicate.id !== draft.existingId) throw new BatchError(`Reference “${draft.receivingNumber}” is already in use. Generate a new reference for ${draft.label}.`, 409, draft.label);
  if (draft.invoiceNumber && tx.inventoryReceiving.findFirst) {
    const duplicateInvoice = await tx.inventoryReceiving.findFirst({
      where: { invoiceNumber: draft.invoiceNumber, ...(draft.existingId ? { id: { not: draft.existingId } } : {}) },
      select: { id: true },
    });
    if (duplicateInvoice) throw new BatchError(`Supplier invoice “${draft.invoiceNumber}” is already assigned to another delivery.`, 409, draft.label);
  }
  if (draft.shipmentBatchNumber && tx.inventoryReceivingItem.findFirst) {
    const duplicateBatch = await tx.inventoryReceivingItem.findFirst({
      where: { batchNumber: draft.shipmentBatchNumber, ...(draft.existingId ? { receivingId: { not: draft.existingId } } : {}) },
      select: { id: true },
    });
    if (duplicateBatch) throw new BatchError(`Shipment batch “${draft.shipmentBatchNumber}” is already assigned to another delivery.`, 409, draft.label);
  }
  const notes = draft.draftNewItems.length
    ? [draft.notes, `__DRAFT_ITEMS__:${JSON.stringify(draft.draftNewItems)}`].filter(Boolean).join('\n')
    : draft.notes;
  const preparedItems = draft.items.map((item) => ({
    inventoryItemId: item.inventoryItemId,
    quantity: item.quantity,
    unit: item.unit,
    unitCost: item.unitCost,
    totalCost: roundMoney(item.quantity * item.unitCost),
    batchNumber: item.batchNumber ? String(item.batchNumber).trim() : null,
    expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
    notes: item.notes ? String(item.notes).trim() : null,
  }));
  const data = {
      receivingNumber: draft.receivingNumber,
      supplierId: scope.supplierId,
      branchId: scope.branchId,
      invoiceNumber: draft.invoiceNumber,
      receivingDate: draft.receivingDate,
      receivedById: req.user?.id || null,
      notes,
      status: 'DRAFT',
      subtotal: draft.subtotal,
      discount: draft.discount,
      discountPercent: draft.discountPercent,
      totalCost: roundMoney(draft.subtotal - draft.discount),
      items: { create: preparedItems },
    };
  if (draft.existingId) {
    const existing = await tx.inventoryReceiving.findUnique({ where: { id: draft.existingId }, select: { id: true, status: true } });
    if (!existing || existing.status !== 'DRAFT') throw new BatchError('The draft being edited no longer exists or is no longer a draft.', 409, draft.label);
    await tx.inventoryReceivingItem.deleteMany({ where: { receivingId: draft.existingId } });
    return tx.inventoryReceiving.update({
      where: { id: draft.existingId },
      data,
      include: { supplier: true, branch: true, items: { include: { inventoryItem: true } } },
    });
  }
  return tx.inventoryReceiving.create({
    data,
    include: { supplier: true, branch: true, items: { include: { inventoryItem: true } } },
  });
};

const saveReceivingBatch = async (req, res) => {
  const raw = req.body?.deliveries;
  if (!Array.isArray(raw) || raw.length === 0) return res.status(400).json({ error: 'Provide at least one delivery to save.' });
  try {
    const drafts = raw.map(normalizeDraft);
    const references = drafts.map((draft) => draft.receivingNumber);
    if (new Set(references).size !== references.length) throw new BatchError('Each delivery must have a unique internal reference.', 409);
    const receivings = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const draft of drafts) {
        try { created.push(await createDraftInTransaction(tx, draft, req)); }
        catch (error) {
          if (error.card) throw error;
          throw new BatchError(error.message || 'Could not save this delivery.', error.code === 'P2002' ? 409 : 500, draft.label);
        }
      }
      return created;
    }, { maxWait: 20000, timeout: 60000 });
    return res.status(201).json({ message: `Saved ${receivings.length} delivery drafts.`, receivings });
  } catch (error) {
    const status = error.status || (error.code === 'P2002' ? 409 : 500);
    console.error('Save receiving batch error:', error.stack || error);
    return res.status(status).json({ error: error.message || 'Could not save delivery drafts.', card: error.card || null });
  }
};

const materializeDeferredItems = async (tx, receiving) => {
  let notes = receiving.notes || null;
  const marker = '__DRAFT_ITEMS__:';
  if (!notes?.includes(marker)) return { receiving, notes };
  const markerIndex = notes.indexOf(marker);
  let newItems;
  try { newItems = JSON.parse(notes.slice(markerIndex + marker.length).split('\n')[0]); }
  catch { throw new BatchError('Deferred new-item data is invalid.', 400, receiving.receivingNumber); }
  if (!Array.isArray(newItems)) throw new BatchError('Deferred new-item data is invalid.', 400, receiving.receivingNumber);
  notes = notes.slice(0, markerIndex).trim() || null;
  for (const raw of newItems) {
    const name = String(raw.name || '').trim();
    const quantity = Number(raw.quantity ?? raw.stockLevel);
    const unitCost = Number(raw.unitCost ?? raw.costPrice ?? 0);
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw new BatchError(`Deferred item “${name || 'Unnamed'}” has invalid name, quantity, or cost.`, 400, receiving.receivingNumber);
    }
    const inventoryItem = await tx.inventoryItem.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, branchId: receiving.branchId },
    }) || await tx.inventoryItem.create({
      data: {
        name,
        unit: String(raw.unit || 'KG'),
        category: raw.category || 'General',
        costPrice: unitCost,
        stockLevel: 0,
        minThreshold: Number(raw.minThreshold) || 10,
        maxThreshold: Number(raw.maxThreshold) || 100,
        supplierId: receiving.supplierId,
        branchId: receiving.branchId,
        expiryDate: raw.expiryDate ? new Date(raw.expiryDate) : null,
      },
    });
    await tx.inventoryReceivingItem.create({
      data: {
        receivingId: receiving.id,
        inventoryItemId: inventoryItem.id,
        quantity,
        unit: String(raw.unit || 'KG'),
        unitCost,
        totalCost: roundMoney(quantity * unitCost),
        batchNumber: raw.batchNumber ? String(raw.batchNumber).trim() : null,
        expiryDate: raw.expiryDate ? new Date(raw.expiryDate) : null,
        notes: null,
      },
    });
  }
  const refreshed = await tx.inventoryReceiving.findUnique({
    where: { id: receiving.id },
    include: { items: { include: { inventoryItem: true } }, supplier: true, branch: true },
  });
  return { receiving: refreshed, notes };
};

const receiveOneInTransaction = async (tx, receivingId) => {
  const before = await tx.inventoryReceiving.findUnique({
    where: { id: receivingId },
    include: { items: { include: { inventoryItem: true } }, supplier: true, branch: true },
  });
  if (!before) throw new BatchError(`Receiving draft ${receivingId} was not found.`, 404);
  if (before.status === 'CANCELLED') throw new BatchError(`Draft ${before.receivingNumber} is cancelled and cannot be confirmed.`, 409, before.receivingNumber);
  const claim = await tx.inventoryReceiving.updateMany({
    where: { id: receivingId, status: 'DRAFT' },
    data: { status: 'CONFIRMING' },
  });
  if (claim.count !== 1) throw new BatchError(`Draft ${before.receivingNumber} is already received or being confirmed.`, 409, before.receivingNumber);

  const materialized = await materializeDeferredItems(tx, before);
  const receiving = materialized.receiving;
  if (!receiving.items?.length) throw new BatchError(`Draft ${receiving.receivingNumber} has no items to receive.`, 400, receiving.receivingNumber);
  const itemIds = [...new Set(receiving.items.map((line) => line.inventoryItemId))].sort((a, b) => a - b);
  for (const itemId of itemIds) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} FOR UPDATE`);
  }

  const logs = [];
  const convertedItems = [];
  for (const line of receiving.items) {
    const item = await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
    if (!item) throw new BatchError(`Catalog item ${line.inventoryItemId} no longer exists.`, 400, receiving.receivingNumber);
    let quantity;
    try { quantity = convertUnit(line.quantity, line.unit, item.unit); }
    catch (error) {
      throw new BatchError(`${item.name}: ${error.message}`, 400, receiving.receivingNumber);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BatchError(`${item.name}: converted quantity must be greater than zero.`, 400, receiving.receivingNumber);
    const totalCost = Number(line.totalCost ?? line.quantity * line.unitCost ?? 0);
    const quantityBefore = Number(item.stockLevel);
    if (!Number.isFinite(quantityBefore) || quantityBefore < 0) {
      throw new BatchError(`${item.name}: current stock is invalid or negative. Correct the stock balance before receiving this delivery.`, 409, receiving.receivingNumber);
    }
    const quantityAfter = quantityBefore + quantity;
    if (!Number.isFinite(quantityAfter) || quantityAfter < 0) {
      throw new BatchError(`${item.name}: this delivery would produce an invalid stock balance.`, 409, receiving.receivingNumber);
    }
    const newCostPrice = quantityAfter > 0
      ? Math.round((((quantityBefore * Number(item.costPrice || 0)) + totalCost) / quantityAfter) * 10000) / 10000
      : Number(item.costPrice || 0);
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        stockLevel: { increment: quantity },
        costPrice: newCostPrice,
        ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      },
    });
    logs.push({
      inventoryItemId: item.id,
      type: 'STOCK_IN',
      quantity,
      quantityBefore,
      quantityAfter,
      changeQty: quantity,
      cost: totalCost,
      unitCost: quantity ? totalCost / quantity : 0,
      reason: `Stock receiving #${receiving.receivingNumber} (Inv: ${receiving.invoiceNumber || 'N/A'})`,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      supplierId: receiving.supplierId,
      receivingId: receiving.id,
      receivingItemId: line.id,
    });
    convertedItems.push({ inventoryItemId: item.id, name: item.name, quantity, unit: item.unit });
  }
  if (logs.length) await tx.inventoryLog.createMany({ data: logs });
  const updated = await tx.inventoryReceiving.update({
    where: { id: receiving.id },
    data: { status: 'RECEIVED', notes: materialized.notes },
    include: { supplier: true, branch: true, items: { include: { inventoryItem: true } } },
  });
  return { receiving: updated, convertedItems };
};

const confirmReceivingBatch = async (req, res) => {
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 200) return res.status(400).json({ error: 'A valid Idempotency-Key header is required.' });
  const existingIds = Array.isArray(req.body?.receivingIds) ? req.body.receivingIds.map(Number) : [];
  const rawCurrent = Array.isArray(req.body?.currentDeliveries)
    ? req.body.currentDeliveries
    : (req.body?.currentDelivery ? [req.body.currentDelivery] : []);
  if (!existingIds.length && !rawCurrent.length) return res.status(400).json({ error: 'Select at least one draft or add the current delivery.' });
  if (existingIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(existingIds).size !== existingIds.length) {
    return res.status(400).json({ error: 'Draft selection contains an invalid or repeated receiving id.' });
  }
  let currentDraft;
  try { currentDraft = rawCurrent.map(normalizeDraft); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message, card: error.card || null }); }
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ receivingIds: existingIds, currentDeliveries: rawCurrent })).digest('hex');

  try {
    const savedAttempt = await prisma.inventoryReceivingConfirmAttempt.findUnique({ where: { idempotencyKey } });
    if (savedAttempt) {
      if (savedAttempt.requestHash !== requestHash) return res.status(409).json({ error: 'This idempotency key was already used for a different confirmation.' });
      return res.status(200).json(savedAttempt.response);
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.inventoryReceivingConfirmAttempt.create({ data: { idempotencyKey, requestHash, response: { pending: true } } });
      const selectedIds = [...existingIds];
      for (const draft of currentDraft) {
        const created = await createDraftInTransaction(tx, draft, req);
        selectedIds.push(created.id);
      }
      if (new Set(selectedIds).size !== selectedIds.length) throw new BatchError('The same draft was selected more than once.', 400);
      const outcomes = [];
      for (const id of selectedIds) {
        try { outcomes.push(await receiveOneInTransaction(tx, id)); }
        catch (error) {
          if (error.card) throw error;
          const receiving = await tx.inventoryReceiving.findUnique({ where: { id }, select: { receivingNumber: true } }).catch(() => null);
          throw new BatchError(error.message || 'Could not confirm this draft.', error.status || 500, receiving?.receivingNumber || `Draft ${id}`);
        }
      }
      const response = {
        message: `Confirmed ${outcomes.length} receiving${outcomes.length === 1 ? '' : 's'} successfully.`,
        receivings: outcomes.map((outcome) => outcome.receiving),
        convertedItems: outcomes.flatMap((outcome) => outcome.convertedItems),
      };
      await tx.inventoryReceivingConfirmAttempt.update({
        where: { idempotencyKey },
        data: { response: JSON.parse(JSON.stringify(response)) },
      });
      return response;
    }, { maxWait: 20000, timeout: 60000 });

    for (const receiving of result.receivings) {
      logAudit({
        userId: req.user?.id || 1,
        action: 'STOCK_RECEIVING_CONFIRMED',
        entity: 'InventoryReceiving',
        entityId: String(receiving.id),
        newValue: { receivingNumber: receiving.receivingNumber, status: 'RECEIVED' },
        req,
      }).catch((error) => console.error('Audit log error:', error?.message));
      emitToAdmin('inventory:update', { receiving });
      emitToVendor('inventory:update', { receiving });
    }
    return res.json(result);
  } catch (error) {
    if (error.code === 'P2002') {
      const replay = await prisma.inventoryReceivingConfirmAttempt.findUnique({ where: { idempotencyKey } }).catch(() => null);
      if (replay?.requestHash === requestHash) return res.status(200).json(replay.response);
      if (replay) return res.status(409).json({ error: 'This idempotency key was already used for a different confirmation.' });
    }
    const status = error.status || (error.code === 'P2002' ? 409 : 500);
    console.error('Confirm receiving batch error:', error.stack || error);
    return res.status(status).json({ error: error.message || 'Could not confirm all selected receiving drafts.', card: error.card || null });
  }
};

module.exports = { saveReceivingBatch, confirmReceivingBatch };
