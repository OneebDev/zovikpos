const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roundMoney } = require('../src/utils/money');

test('roundMoney rounds computed monetary values to two decimals safely', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(2.675), 2.68);
  assert.equal(roundMoney('12.345'), 12.35);
  assert.equal(roundMoney(null), 0);
  assert.equal(roundMoney(Number.NaN), 0);
});
