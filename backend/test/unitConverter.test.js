'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STANDARD_UNITS,
  normalizeUnit,
  areUnitsCompatible,
  convertStandardUnits,
  resolvePackageFactor,
  convertUnit
} = require('../src/utils/unitConverter');

test('Preserve existing 10 units', () => {
  const expected = ['KG', 'G', 'L', 'ML', 'PCS', 'DOZEN', 'BOX', 'PACK', 'BOTTLE', 'BAG'];
  for (const u of expected) {
    assert.ok(STANDARD_UNITS.includes(u), `STANDARD_UNITS must include ${u}`);
    assert.equal(normalizeUnit(u), u, `Normalized ${u} should be ${u}`);
  }
});

test('Standard conversions: KG <-> G', () => {
  assert.equal(convertUnit(1, 'KG', 'G'), 1000);
  assert.equal(convertUnit(2500, 'G', 'KG'), 2.5);
  assert.equal(convertUnit(0.25, 'KG', 'G'), 250);
});

test('Standard conversions: L <-> ML', () => {
  assert.equal(convertUnit(1, 'L', 'ML'), 1000);
  assert.equal(convertUnit(500, 'ML', 'L'), 0.5);
  assert.equal(convertUnit(1.5, 'L', 'ML'), 1500);
});

test('Count conversions: DOZEN <-> PCS', () => {
  assert.equal(convertUnit(1, 'DOZEN', 'PCS'), 12);
  assert.equal(convertUnit(24, 'PCS', 'DOZEN'), 2);
  assert.equal(convertUnit(2.5, 'DOZEN', 'PCS'), 30);
});

test('Reject incompatible conversions without configured factor', () => {
  // KG -> PACK
  assert.throws(
    () => convertUnit(5, 'KG', 'PACK'),
    (err) => err.code === 'UNIT_CONVERSION_ERROR' || err.message.includes('Incompatible unit conversion')
  );
  // PACK -> KG
  assert.throws(
    () => convertUnit(10, 'PACK', 'KG'),
    (err) => err.code === 'UNIT_CONVERSION_ERROR' || err.message.includes('Incompatible unit conversion')
  );
  // KG -> L
  assert.throws(
    () => convertUnit(2, 'KG', 'L'),
    (err) => err.code === 'UNIT_CONVERSION_ERROR' || err.message.includes('Incompatible unit conversion')
  );
  // PCS -> KG
  assert.throws(
    () => convertUnit(10, 'PCS', 'KG'),
    (err) => err.code === 'UNIT_CONVERSION_ERROR' || err.message.includes('Incompatible unit conversion')
  );
});

test('Item-specific package conversions: BOX, PACK, BOTTLE, BAG', () => {
  // Cheese example: 1 PACK = 10 PCS (or base unit PCS)
  const cheeseConfig = {
    PACK: { factor: 10, targetUnit: 'PCS' }
  };
  assert.equal(convertUnit(5, 'PACK', 'PCS', cheeseConfig), 50);
  assert.equal(convertUnit(50, 'PCS', 'PACK', cheeseConfig), 5);

  // Flour example: 1 BAG = 25 KG (base unit KG)
  const flourConfig = {
    BAG: { factor: 25, targetUnit: 'KG' }
  };
  assert.equal(convertUnit(2, 'BAG', 'KG', flourConfig), 50);
  assert.equal(convertUnit(50, 'KG', 'BAG', flourConfig), 2);
  // Bridge BAG -> G via KG (2 BAG = 50 KG = 50,000 G)
  assert.equal(convertUnit(2, 'BAG', 'G', flourConfig), 50000);

  // Beverage example: 1 BOTTLE = 1.5 L (base unit L)
  const drinkConfig = {
    BOTTLE: { factor: 1.5, targetUnit: 'L' }
  };
  assert.equal(convertUnit(4, 'BOTTLE', 'L', drinkConfig), 6);
  assert.equal(convertUnit(6, 'L', 'BOTTLE', drinkConfig), 4);
  // Bridge BOTTLE -> ML via L (2 BOTTLE = 3 L = 3,000 ML)
  assert.equal(convertUnit(2, 'BOTTLE', 'ML', drinkConfig), 3000);

  // Box example: 1 BOX = 24 PCS
  const eggBoxConfig = {
    BOX: { factor: 24, targetUnit: 'PCS' }
  };
  assert.equal(convertUnit(3, 'BOX', 'PCS', eggBoxConfig), 72);
  assert.equal(convertUnit(72, 'PCS', 'BOX', eggBoxConfig), 3);
  // Bridge BOX -> DOZEN via PCS (1 BOX = 24 PCS = 2 DOZEN)
  assert.equal(convertUnit(1, 'BOX', 'DOZEN', eggBoxConfig), 2);
});

test('areUnitsCompatible utility with and without package factor', () => {
  assert.equal(areUnitsCompatible('KG', 'G'), true);
  assert.equal(areUnitsCompatible('L', 'ML'), true);
  assert.equal(areUnitsCompatible('DOZEN', 'PCS'), true);

  assert.equal(areUnitsCompatible('KG', 'PACK'), false);
  assert.equal(areUnitsCompatible('KG', 'L'), false);

  const packConversions = { PACK: { factor: 0.5, targetUnit: 'KG' } };
  assert.equal(areUnitsCompatible('PACK', 'KG', packConversions), true);
  assert.equal(areUnitsCompatible('PACK', 'G', packConversions), true);
});
