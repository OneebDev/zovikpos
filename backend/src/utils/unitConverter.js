/**
 * Unit Converter Utility for ZovikPOS Inventory Management
 * Handles standard measurement unit conversions between recipe requirements,
 * supplier invoices, and inventory stock units.
 * Supports:
 * 1. Standard Measurement Conversions (KG <-> G, L <-> ML)
 * 2. Count Conversions (DOZEN <-> PCS)
 * 3. Item-Specific Packaging Conversions (BOX, PACK, BOTTLE, BAG, etc.)
 */

'use strict';

const STANDARD_UNITS = [
  'KG',
  'G',
  'L',
  'ML',
  'PCS',
  'DOZEN',
  'BOX',
  'PACK',
  'BOTTLE',
  'BAG'
];

const UNIT_GROUPS = {
  WEIGHT: [
    'KG', 'KILOGRAM', 'KILOGRAMS',
    'G', 'GM', 'GRAM', 'GRAMS',
    'MG', 'MILLIGRAM', 'MILLIGRAMS',
    'LB', 'LBS', 'POUND', 'POUNDS',
    'OZ', 'OUNCE', 'OUNCES'
  ],
  VOLUME: [
    'L', 'LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES',
    'ML', 'MILLILITER', 'MILLILITERS', 'MILLILITRE', 'MILLILITRES',
    'CL', 'CENTILITER', 'CENTILITERS'
  ],
  COUNT_STANDARD: [
    'PCS', 'PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS',
    'DOZEN', 'DOZENS', 'DZ'
  ],
  PACKAGING: [
    'BOX', 'BOXES', 'BX',
    'PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS',
    'BOTTLE', 'BOTTLES', 'BTL',
    'BAG', 'BAGS', 'SACK', 'SACKS',
    'CARTON', 'CARTONS', 'CTN',
    'CAN', 'CANS', 'TIN', 'TINS',
    'TUB', 'TUBS', 'JAR', 'JARS',
    'ROLL', 'ROLLS', 'STRIP', 'STRIPS'
  ]
};

/**
 * Normalizes any unit string to its canonical uppercase representation
 */
const normalizeUnit = (unit) => {
  if (!unit || typeof unit !== 'string') return 'PCS';
  const u = unit.trim().toUpperCase();

  // Weight canonical forms
  if (['KG', 'KILOGRAM', 'KILOGRAMS'].includes(u)) return 'KG';
  if (['G', 'GM', 'GRAM', 'GRAMS'].includes(u)) return 'G';
  if (['MG', 'MILLIGRAM', 'MILLIGRAMS'].includes(u)) return 'MG';
  if (['LB', 'LBS', 'POUND', 'POUNDS'].includes(u)) return 'LB';
  if (['OZ', 'OUNCE', 'OUNCES'].includes(u)) return 'OZ';

  // Volume canonical forms
  if (['L', 'LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(u)) return 'L';
  if (['ML', 'MILLILITER', 'MILLILITERS', 'MILLILITRE', 'MILLILITRES'].includes(u)) return 'ML';
  if (['CL', 'CENTILITER', 'CENTILITERS'].includes(u)) return 'CL';

  // Count standard forms
  if (['DOZEN', 'DOZENS', 'DZ'].includes(u)) return 'DOZEN';
  if (['PCS', 'PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS'].includes(u)) return 'PCS';

  // Packaging canonical forms
  if (['BOX', 'BOXES', 'BX'].includes(u)) return 'BOX';
  if (['PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS'].includes(u)) return 'PACK';
  if (['BOTTLE', 'BOTTLES', 'BTL'].includes(u)) return 'BOTTLE';
  if (['BAG', 'BAGS', 'SACK', 'SACKS'].includes(u)) return 'BAG';
  if (['CARTON', 'CARTONS', 'CTN'].includes(u)) return 'CARTON';
  if (['CAN', 'CANS', 'TIN', 'TINS'].includes(u)) return 'CAN';
  if (['TUB', 'TUBS', 'JAR', 'JARS'].includes(u)) return 'TUB';
  if (['ROLL', 'ROLLS'].includes(u)) return 'ROLL';
  if (['STRIP', 'STRIPS'].includes(u)) return 'STRIP';

  return u;
};

/**
 * Standard conversions between compatible units without item-specific factor
 */
const convertStandardUnits = (amount, source, target) => {
  if (source === target) return amount;

  // Weight conversions
  const isWeightSource = UNIT_GROUPS.WEIGHT.includes(source);
  const isWeightTarget = UNIT_GROUPS.WEIGHT.includes(target);
  if (isWeightSource && isWeightTarget) {
    let grams = amount;
    if (source === 'KG') grams = amount * 1000;
    else if (source === 'MG') grams = amount / 1000;
    else if (source === 'LB') grams = amount * 453.59237;
    else if (source === 'OZ') grams = amount * 28.34952;

    if (target === 'KG') return grams / 1000;
    if (target === 'G') return grams;
    if (target === 'MG') return grams * 1000;
    if (target === 'LB') return grams / 453.59237;
    if (target === 'OZ') return grams / 28.34952;
  }

  // Volume conversions
  const isVolumeSource = UNIT_GROUPS.VOLUME.includes(source);
  const isVolumeTarget = UNIT_GROUPS.VOLUME.includes(target);
  if (isVolumeSource && isVolumeTarget) {
    let ml = amount;
    if (source === 'L') ml = amount * 1000;
    else if (source === 'CL') ml = amount * 10;

    if (target === 'L') return ml / 1000;
    if (target === 'ML') return ml;
    if (target === 'CL') return ml / 10;
  }

  // Count conversions: DOZEN <-> PCS
  if (source === 'DOZEN' && target === 'PCS') return amount * 12;
  if (source === 'PCS' && target === 'DOZEN') return amount / 12;

  return null;
};

/**
 * Checks if two units belong to the same standard measurement family
 */
const areUnitsCompatible = (unitA, unitB, packageConversions = null) => {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);
  if (normA === normB) return true;

  // Check standard weight
  if (UNIT_GROUPS.WEIGHT.includes(normA) && UNIT_GROUPS.WEIGHT.includes(normB)) return true;
  // Check standard volume
  if (UNIT_GROUPS.VOLUME.includes(normA) && UNIT_GROUPS.VOLUME.includes(normB)) return true;
  // Check standard count (DOZEN <-> PCS)
  if (UNIT_GROUPS.COUNT_STANDARD.includes(normA) && UNIT_GROUPS.COUNT_STANDARD.includes(normB)) return true;

  // Check item package conversions
  if (packageConversions) {
    const factor = resolvePackageFactor(normA, normB, packageConversions);
    if (factor !== null && factor > 0) return true;
  }

  return false;
};

/**
 * Resolves conversion factor from item packageConversions dictionary
 * packageConversions structure:
 * {
 *   "PACK": { factor: 10, targetUnit: "PCS" }, // 1 PACK = 10 PCS
 *   "BOX": { factor: 24, targetUnit: "PCS" },
 *   "BOTTLE": { factor: 1.5, targetUnit: "L" },
 *   "BAG": { factor: 25, targetUnit: "KG" }
 * }
 * or simple factor map: { "PACK": 10 } (defaults to item base unit)
 */
const resolvePackageFactor = (source, target, packageConversions) => {
  if (!packageConversions || typeof packageConversions !== 'object') return null;

  // Normalize keys and check source -> target
  for (const [pkgUnit, cfg] of Object.entries(packageConversions)) {
    const normPkg = normalizeUnit(pkgUnit);
    if (typeof cfg === 'number' && cfg > 0) {
      // 1 pkgUnit = cfg targetUnit (where target is item base unit)
      if (source === normPkg) {
        return cfg; // multiply
      }
      if (target === normPkg) {
        return 1 / cfg; // divide
      }
    } else if (cfg && typeof cfg === 'object') {
      const factor = Number(cfg.factor);
      const cfgTarget = normalizeUnit(cfg.targetUnit || cfg.toUnit);
      if (factor > 0) {
        if (source === normPkg && target === cfgTarget) {
          return factor;
        }
        if (target === normPkg && source === cfgTarget) {
          return 1 / factor;
        }
        // If cfgTarget can bridge via standard conversion to target
        if (source === normPkg) {
          const bridge = convertStandardUnits(1, cfgTarget, target);
          if (bridge !== null) return factor * bridge;
        }
        if (target === normPkg) {
          const bridge = convertStandardUnits(1, source, cfgTarget);
          if (bridge !== null) return bridge / factor;
        }
      }
    }
  }

  return null;
};

/**
 * Converts a quantity from recipe/invoice unit to target inventory unit.
 * Supports:
 * - standard weight (KG, G, MG, LB, OZ)
 * - standard volume (L, ML, CL)
 * - standard count (DOZEN <-> PCS)
 * - item-specific package conversion factors (BOX, PACK, BOTTLE, BAG, etc.)
 *
 * @param {number} qty Quantity to convert
 * @param {string} fromUnit Unit of the quantity
 * @param {string} toUnit Target unit to convert into
 * @param {number|object|null} packageFactorOrConversions Optional item-specific factor (number) or packageConversions object
 * @returns {number} Converted quantity
 */
const convertUnit = (qty, fromUnit, toUnit, packageFactorOrConversions = null) => {
  const amount = Number(qty);
  if (isNaN(amount)) throw new Error(`Invalid numeric quantity: ${qty}`);

  const source = normalizeUnit(fromUnit);
  const target = normalizeUnit(toUnit);

  if (source === target) return amount;

  // 1. If a direct numeric factor was passed (e.g. 1 PACK = 10 PCS -> factor 10)
  if (typeof packageFactorOrConversions === 'number' && packageFactorOrConversions > 0) {
    return amount * packageFactorOrConversions;
  }

  // 2. Standard physical conversions
  const stdResult = convertStandardUnits(amount, source, target);
  if (stdResult !== null) return stdResult;

  // 3. Item-specific package conversion lookup
  if (packageFactorOrConversions && typeof packageFactorOrConversions === 'object') {
    const factor = resolvePackageFactor(source, target, packageFactorOrConversions);
    if (factor !== null && factor > 0) {
      return amount * factor;
    }
  }

  // 4. Incompatible conversion error with actionable details
  const error = new Error(
    `Incompatible unit conversion from "${fromUnit}" (${source}) to "${toUnit}" (${target}). ` +
    `Weight, volume, and packaging count units cannot be converted automatically without an item-specific package conversion factor.`
  );
  error.code = 'UNIT_CONVERSION_ERROR';
  error.fromUnit = source;
  error.toUnit = target;
  throw error;
};

module.exports = {
  STANDARD_UNITS,
  UNIT_GROUPS,
  normalizeUnit,
  areUnitsCompatible,
  convertStandardUnits,
  resolvePackageFactor,
  convertUnit
};
