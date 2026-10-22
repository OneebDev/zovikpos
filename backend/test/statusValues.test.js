const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OrderStatus, OrderPaymentStatus, InventoryReceivingStatus, SessionStatus, isValid } = require('../src/utils/statusValues');

test('status allow-lists contain the requested values', () => {
  assert.deepEqual(OrderStatus, ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'REFUNDED']);
  assert.deepEqual(OrderPaymentStatus, ['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'VERIFIED', 'FAILED', 'REFUNDED']);
  assert.deepEqual(InventoryReceivingStatus, ['DRAFT', 'RECEIVED', 'CANCELLED', 'CONFIRMING']);
  assert.deepEqual(SessionStatus, ['ACTIVE', 'CHECKOUT', 'COMPLETED', 'EXPIRED', 'CANCELLED']);
});

test('isValid accepts listed values and rejects unknown kinds or values', () => {
  assert.equal(isValid('OrderStatus', 'PENDING'), true);
  assert.equal(isValid('OrderPaymentStatus', 'VERIFIED'), true);
  assert.equal(isValid('InventoryReceivingStatus', 'RECEIVED'), true);
  assert.equal(isValid('InventoryReceivingStatus', 'CONFIRMING'), true);
  assert.equal(isValid('SessionStatus', 'ACTIVE'), true);
  assert.equal(isValid('OrderStatus', 'UNKNOWN'), false);
  assert.equal(isValid('SessionStatus', 'active'), false);
  assert.equal(isValid('UnknownStatus', 'ACTIVE'), false);
});
