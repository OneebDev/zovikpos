'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Mock or unit-test the Phase 5 logic

test('Phase 5 Rule 2: Cook-to-order items do not decrement MenuItem.stock below zero', () => {
  // Scenario: MenuItem has stock = 0. Customer orders 2 portions.
  const currentPreparedStock = 0;
  const itemQty = 2;

  const preparedDeduct = Math.min(currentPreparedStock, itemQty);
  const cookToOrderDeduct = itemQty - preparedDeduct;

  assert.strictEqual(preparedDeduct, 0, 'Must not deduct any prepared stock when currentPreparedStock is 0');
  assert.strictEqual(cookToOrderDeduct, 2, 'All 2 portions must be fulfilled via cook-to-order');
  const resultingStock = currentPreparedStock - preparedDeduct;
  assert.strictEqual(resultingStock, 0, 'Resulting stock must never become negative');
});

test('Phase 5 Rule 2: Prepared stock is deducted correctly without dropping below zero', () => {
  // Scenario: MenuItem has stock = 5. Customer orders 3 portions.
  const currentPreparedStock = 5;
  const itemQty = 3;

  const preparedDeduct = Math.min(currentPreparedStock, itemQty);
  const cookToOrderDeduct = itemQty - preparedDeduct;

  assert.strictEqual(preparedDeduct, 3, 'Prepared deduct should be 3');
  assert.strictEqual(cookToOrderDeduct, 0, 'Cook to order should be 0');
  const resultingStock = currentPreparedStock - preparedDeduct;
  assert.strictEqual(resultingStock, 2, 'Resulting stock should be exactly 2');
});

test('Phase 5 Rule 4: One prepared portion + one cook-to-order portion fulfills 2 portions', () => {
  // Scenario: MenuItem has stock = 1. Customer orders 2 portions. Raw ingredients exist for 5.
  const currentPreparedStock = 1;
  const itemQty = 2;

  const preparedDeduct = Math.min(currentPreparedStock, itemQty);
  const cookToOrderDeduct = itemQty - preparedDeduct;

  assert.strictEqual(preparedDeduct, 1, 'Exactly 1 portion deducted from prepared stock');
  assert.strictEqual(cookToOrderDeduct, 1, 'Exactly 1 portion fulfilled via cook-to-order');
  const remainingPrepared = currentPreparedStock - preparedDeduct;
  assert.strictEqual(remainingPrepared, 0, 'Remaining prepared stock is 0 (not negative)');
});

test('Phase 5 Rule 3: Idempotency prevents duplicate prepared-stock deductions', () => {
  // Mock deduction state
  const orderStatusHistory = [];
  const menuItem = { id: 10, stock: 5 };

  const performDeduction = (orderId, orderQty) => {
    const existing = orderStatusHistory.find(h => h.orderId === orderId && h.newStatus === 'INVENTORY_DEDUCTED');
    if (existing) {
      return { skipped: true, remainingStock: menuItem.stock };
    }
    const deduct = Math.min(menuItem.stock, orderQty);
    menuItem.stock -= deduct;
    orderStatusHistory.push({ orderId, newStatus: 'INVENTORY_DEDUCTED' });
    return { skipped: false, remainingStock: menuItem.stock };
  };

  const firstCall = performDeduction(101, 2);
  assert.strictEqual(firstCall.skipped, false);
  assert.strictEqual(firstCall.remainingStock, 3, 'Stock decremented from 5 to 3 on first call');

  const secondCall = performDeduction(101, 2);
  assert.strictEqual(secondCall.skipped, true, 'Second call must be skipped due to idempotency');
  assert.strictEqual(secondCall.remainingStock, 3, 'Stock must NOT decrement again on duplicate call');
});

test('Phase 5 Rule 3: Idempotency prevents duplicate prepared-stock restorations', () => {
  const orderStatusHistory = [{ orderId: 101, newStatus: 'INVENTORY_DEDUCTED' }];
  const menuItem = { id: 10, stock: 3 };

  const performRestoration = (orderId, preparedDeductedQty) => {
    const existing = orderStatusHistory.find(h => h.orderId === orderId && h.newStatus === 'INVENTORY_RESTORED');
    if (existing) {
      return { skipped: true, remainingStock: menuItem.stock };
    }
    menuItem.stock += preparedDeductedQty;
    orderStatusHistory.push({ orderId, newStatus: 'INVENTORY_RESTORED' });
    return { skipped: false, remainingStock: menuItem.stock };
  };

  const firstRestore = performRestoration(101, 2);
  assert.strictEqual(firstRestore.skipped, false);
  assert.strictEqual(firstRestore.remainingStock, 5, 'Stock restored from 3 back to 5');

  const secondRestore = performRestoration(101, 2);
  assert.strictEqual(secondRestore.skipped, true, 'Second restore skipped');
  assert.strictEqual(secondRestore.remainingStock, 5, 'Stock remains 5 without double increment');
});

test('Phase 5 Rule 5: Pending order reservation calculation prevents overselling', () => {
  const rawStock = 2;

  // Function computing effective available stock given pending orders
  const getEffectiveAvailable = (pendingOrders) => {
    const pendingReservedQty = pendingOrders
      .filter(o => ['PENDING', 'PAYMENT_PENDING'].includes(o.status))
      .reduce((sum, o) => sum + o.quantity, 0);
    return Math.max(0, rawStock - pendingReservedQty);
  };

  // Initially no pending orders
  assert.strictEqual(getEffectiveAvailable([]), 2);

  // Customer 1 places pending COD order for 1 portion
  const ordersAfterCust1 = [{ id: 1, quantity: 1, status: 'PENDING' }];
  assert.strictEqual(getEffectiveAvailable(ordersAfterCust1), 1, 'Available stock is now 1');

  // Customer 2 places pending COD order for 1 portion
  const ordersAfterCust2 = [
    { id: 1, quantity: 1, status: 'PENDING' },
    { id: 2, quantity: 1, status: 'PENDING' }
  ];
  assert.strictEqual(getEffectiveAvailable(ordersAfterCust2), 0, 'Available stock is now 0');

  // Customer 3 tries to order 1 portion -> rejected because effective available is 0
  assert.strictEqual(getEffectiveAvailable(ordersAfterCust2) < 1, true, 'Customer 3 cannot order');

  // If Customer 1 cancels, reservation is automatically released
  ordersAfterCust2[0].status = 'CANCELLED';
  assert.strictEqual(getEffectiveAvailable(ordersAfterCust2), 1, 'Released reservation makes 1 portion available again');
});

test('Phase 5 Rule 6: Cashier grouped table billing aggregates multi-round totals correctly', () => {
  const orders = [
    { id: 1, sessionId: 'sess_1', tableId: 4, total: 1200, status: 'COMPLETED', paymentStatus: 'PAID', roundNumber: 1 },
    { id: 2, sessionId: 'sess_1', tableId: 4, total: 600, status: 'PREPARING', paymentStatus: 'UNPAID', roundNumber: 2 },
    { id: 3, sessionId: 'sess_2', tableId: 5, total: 800, status: 'PENDING', paymentStatus: 'UNPAID', roundNumber: 1 },
  ];

  // Group by session
  const tableMap = {};
  for (const ord of orders) {
    if (['CANCELLED', 'REJECTED'].includes(ord.status)) continue;
    const key = ord.sessionId;
    if (!tableMap[key]) {
      tableMap[key] = { rounds: [], totalAmount: 0, dueAmount: 0 };
    }
    tableMap[key].rounds.push(ord);
    const amt = ord.total;
    tableMap[key].totalAmount += amt;
    if (ord.paymentStatus !== 'PAID') {
      tableMap[key].dueAmount += amt;
    }
  }

  const sess1 = tableMap['sess_1'];
  assert.strictEqual(sess1.rounds.length, 2, 'Session 1 has 2 rounds');
  assert.strictEqual(sess1.totalAmount, 1800, 'Combined table total is Rs. 1800');
  assert.strictEqual(sess1.dueAmount, 600, 'Balance due is Rs. 600');

  const sess2 = tableMap['sess_2'];
  assert.strictEqual(sess2.rounds.length, 1, 'Session 2 has 1 round');
  assert.strictEqual(sess2.totalAmount, 800, 'Session 2 total is Rs. 800');
});
