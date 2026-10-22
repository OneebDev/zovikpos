const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const state = { receivings: [], lines: [], items: [], logs: [], attempts: [], nextReceivingId: 1, nextLineId: 1, nextItemId: 1 };
let transactionQueue = Promise.resolve();
const clone = (value) => structuredClone(value);
const reset = (seed = {}) => {
  Object.assign(state, {
    receivings: [], lines: [], items: [], logs: [], attempts: [], nextReceivingId: 1, nextLineId: 1, nextItemId: 1,
    ...clone(seed),
  });
  transactionQueue = Promise.resolve();
};
const attachRelations = (record) => record && ({
  ...clone(record),
  items: state.lines.filter((line) => line.receivingId === record.id).map((line) => ({
    ...clone(line), inventoryItem: clone(state.items.find((item) => item.id === line.inventoryItemId)),
  })),
  supplier: record.supplierId ? { id: record.supplierId, name: 'Test supplier' } : null,
  branch: record.branchId ? { id: record.branchId, name: 'Test branch' } : null,
});
const matches = (value, where = {}) => Object.entries(where).every(([key, expected]) => {
  if (expected && typeof expected === 'object' && 'in' in expected) return expected.in.includes(value[key]);
  if (expected && typeof expected === 'object' && 'equals' in expected) return String(value[key] || '').toLowerCase() === String(expected.equals).toLowerCase();
  return value[key] === expected;
});
const makeTx = () => ({
  supplier: { findUnique: async ({ where }) => where.id === 1 ? { id: 1 } : null },
  branch: { findUnique: async ({ where }) => where.id === 1 ? { id: 1 } : null, findFirst: async () => ({ id: 1 }) },
  inventoryItem: {
    findMany: async ({ where }) => clone(state.items.filter((row) => matches(row, where))),
    findUnique: async ({ where }) => clone(state.items.find((row) => row.id === where.id) || null),
    findFirst: async ({ where }) => clone(state.items.find((row) => String(row.name).toLowerCase() === String(where.name.equals).toLowerCase() && row.branchId === where.branchId) || null),
    create: async ({ data }) => { const row = { id: state.nextItemId++, ...clone(data) }; state.items.push(row); return clone(row); },
    update: async ({ where, data }) => {
      const row = state.items.find((item) => item.id === where.id);
      if (data.stockLevel?.increment != null) row.stockLevel += data.stockLevel.increment;
      else if (data.stockLevel != null) row.stockLevel = data.stockLevel;
      if (data.costPrice != null) row.costPrice = data.costPrice;
      if (data.expiryDate) row.expiryDate = data.expiryDate;
      return clone(row);
    },
  },
  inventoryReceiving: {
    findUnique: async ({ where }) => {
      const row = state.receivings.find((entry) => (where.id != null && entry.id === where.id) || (where.receivingNumber && entry.receivingNumber === where.receivingNumber));
      return attachRelations(row);
    },
    findMany: async ({ where }) => clone(state.receivings.filter((entry) => matches(entry, where))),
    create: async ({ data }) => {
      const { items: nested = {}, ...fields } = data;
      const row = { id: state.nextReceivingId++, ...clone(fields) };
      state.receivings.push(row);
      for (const item of nested.create || []) state.lines.push({ id: state.nextLineId++, receivingId: row.id, ...clone(item) });
      return attachRelations(row);
    },
    update: async ({ where, data }) => {
      const row = state.receivings.find((entry) => entry.id === where.id);
      const { items: nested = {}, ...fields } = data;
      Object.assign(row, clone(fields));
      for (const item of nested.create || []) state.lines.push({ id: state.nextLineId++, receivingId: row.id, ...clone(item) });
      return attachRelations(row);
    },
    updateMany: async ({ where, data }) => {
      const row = state.receivings.find((entry) => entry.id === where.id && entry.status === where.status);
      if (!row) return { count: 0 };
      Object.assign(row, clone(data));
      return { count: 1 };
    },
  },
  inventoryReceivingItem: {
    deleteMany: async ({ where }) => { state.lines = state.lines.filter((line) => line.receivingId !== where.receivingId); return { count: 1 }; },
    create: async ({ data }) => { const row = { id: state.nextLineId++, ...clone(data) }; state.lines.push(row); return clone(row); },
  },
  inventoryLog: { createMany: async ({ data }) => { state.logs.push(...clone(data)); return { count: data.length }; } },
  inventoryReceivingConfirmAttempt: {
    findUnique: async ({ where }) => clone(state.attempts.find((row) => row.idempotencyKey === where.idempotencyKey) || null),
    create: async ({ data }) => {
      if (state.attempts.some((row) => row.idempotencyKey === data.idempotencyKey)) {
        const error = new Error('Unique constraint failed on idempotency key');
        error.code = 'P2002';
        throw error;
      }
      const row = clone(data); state.attempts.push(row); return row;
    },
    update: async ({ where, data }) => { const row = state.attempts.find((entry) => entry.idempotencyKey === where.idempotencyKey); Object.assign(row, clone(data)); return row; },
  },
  $queryRaw: async () => [],
});

const prisma = {
  ...makeTx(),
  $transaction: async (callback) => {
    const run = transactionQueue.then(async () => {
      const snapshot = clone(state);
      try { return await callback(makeTx()); }
      catch (error) { Object.assign(state, snapshot); throw error; }
    });
    transactionQueue = run.catch(() => {});
    return run;
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../config/db' && parent?.filename.endsWith('inventoryReceivingBatchController.js')) return { prisma };
  if (request === '../middleware/auditMiddleware' && parent?.filename.endsWith('inventoryReceivingBatchController.js')) return { logAudit: async () => {} };
  if (request === '../sockets/socket' && parent?.filename.endsWith('inventoryReceivingBatchController.js')) return { emitToAdmin: () => {}, emitToVendor: () => {} };
  if (request === '@prisma/client' && parent?.filename.endsWith('inventoryReceivingBatchController.js')) return { Prisma: { sql: (strings, ...values) => ({ strings, values }) } };
  return originalLoad.call(this, request, parent, isMain);
};
const { saveReceivingBatch, confirmReceivingBatch } = require('../src/controllers/inventoryReceivingBatchController');
Module._load = originalLoad;

const callHandler = async (handler, body, headers = {}) => {
  let status = 200;
  let payload;
  const req = { body, user: { id: 9, role: 'ADMIN', branchId: 1 }, get: (name) => headers[name] || headers[name.toLowerCase()] };
  const res = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
  await handler(req, res);
  return { status, payload };
};
const seededItem = (unit = 'KG') => ({ id: 1, name: 'Rice', unit, stockLevel: 2, costPrice: 100, branchId: 1 });
const delivery = (unit = 'KG', quantity = 1) => ({
  receivingRef: `RCV-${Math.random()}`, supplierId: 1, branchId: 1, receivingDate: '2026-10-22',
  items: [{ inventoryItemId: 1, quantity, unit, unitCost: 100 }],
});

test('batch draft save creates all deliveries in one commit', async () => {
  reset({ items: [seededItem()], nextItemId: 2 });
  const result = await callHandler(saveReceivingBatch, { deliveries: [delivery(), delivery()] });
  assert.equal(result.status, 201);
  assert.equal(result.payload.receivings.length, 2);
  assert.equal(state.receivings.length, 2);
  assert.equal(state.items[0].stockLevel, 2);
});

test('one invalid delivery rolls the entire batch back', async () => {
  reset({ items: [seededItem()], nextItemId: 2 });
  const result = await callHandler(saveReceivingBatch, { deliveries: [delivery(), { ...delivery(), items: [{ inventoryItemId: 999, quantity: 1, unit: 'KG', unitCost: 10 }] }] });
  assert.equal(result.status, 400);
  assert.equal(state.receivings.length, 0);
  assert.equal(state.lines.length, 0);
});

test('a removed catalog id with a saved item name remains a draft and materializes on confirmation', async () => {
  reset({ items: [], nextItemId: 229 });
  const staleLineDelivery = {
    receivingRef: 'RCV-stale-catalog-id', supplierId: 1, branchId: 1, receivingDate: '2026-10-22',
    items: [{ inventoryItemId: 228, name: 'Biscuits (Family Pack)', quantity: 40, unit: 'KG', unitCost: 10, category: 'Dry Goods' }],
  };
  const saved = await callHandler(saveReceivingBatch, { deliveries: [staleLineDelivery] });
  assert.equal(saved.status, 201);
  assert.equal(saved.payload.receivings[0].items.length, 0);
  assert.match(saved.payload.receivings[0].notes, /__DRAFT_ITEMS__/);
  assert.equal(state.items.length, 0);

  const confirmed = await callHandler(confirmReceivingBatch, { receivingIds: [saved.payload.receivings[0].id] }, { 'Idempotency-Key': 'test-confirm-stale-id' });
  assert.equal(confirmed.status, 200);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].name, 'Biscuits (Family Pack)');
  assert.equal(state.items[0].stockLevel, 40);
});

test('confirm converts units, writes before/after log, and replays idempotently', async () => {
  reset({ items: [seededItem()] });
  const saved = await callHandler(saveReceivingBatch, { deliveries: [delivery('G', 500)] });
  const id = saved.payload.receivings[0].id;
  const first = await callHandler(confirmReceivingBatch, { receivingIds: [id] }, { 'Idempotency-Key': 'test-confirm-1' });
  const replay = await callHandler(confirmReceivingBatch, { receivingIds: [id] }, { 'Idempotency-Key': 'test-confirm-1' });
  assert.equal(first.status, 200);
  assert.equal(state.items[0].stockLevel, 2.5);
  assert.equal(state.logs[0].quantityBefore, 2);
  assert.equal(state.logs[0].quantityAfter, 2.5);
  assert.equal(replay.status, 200);
  assert.equal(state.items[0].stockLevel, 2.5);
});

test('incompatible units fail without changing stock', async () => {
  reset({ items: [seededItem('KG')] });
  const saved = await callHandler(saveReceivingBatch, { deliveries: [delivery('PCS', 3)] });
  const result = await callHandler(confirmReceivingBatch, { receivingIds: [saved.payload.receivings[0].id] }, { 'Idempotency-Key': 'test-confirm-incompatible' });
  assert.equal(result.status, 400);
  assert.match(result.payload.error, /Incompatible unit conversion/);
  assert.equal(state.items[0].stockLevel, 2);
  assert.equal(state.receivings[0].status, 'DRAFT');
});

test('one invalid receipt rolls back every selected draft in the confirmation batch', async () => {
  reset({ items: [seededItem('KG')] });
  const saved = await callHandler(saveReceivingBatch, { deliveries: [delivery('KG', 1), delivery('PCS', 3)] });
  const result = await callHandler(confirmReceivingBatch, { receivingIds: saved.payload.receivings.map((record) => record.id) }, { 'Idempotency-Key': 'test-confirm-rollback' });
  assert.equal(result.status, 400);
  assert.equal(state.items[0].stockLevel, 2);
  assert.deepEqual(state.receivings.map((record) => record.status), ['DRAFT', 'DRAFT']);
  assert.equal(state.logs.length, 0);
});

test('two concurrent requests for the same draft and key post stock once', async () => {
  reset({ items: [seededItem()] });
  const saved = await callHandler(saveReceivingBatch, { deliveries: [delivery()] });
  const body = { receivingIds: [saved.payload.receivings[0].id] };
  const headers = { 'Idempotency-Key': 'test-confirm-concurrent' };
  const results = await Promise.all([
    callHandler(confirmReceivingBatch, body, headers),
    callHandler(confirmReceivingBatch, body, headers),
  ]);
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  assert.equal(state.items[0].stockLevel, 3);
  assert.equal(state.logs.length, 1);
});
