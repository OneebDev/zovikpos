/**
 * Unit Converter Utility for ZovikPOS Inventory Management
 * Handles standard measurement unit conversions between recipe requirements,
 * supplier invoices, and inventory stock units.
 * Supports:
 * 1. Standard Measurement Conversions (KG <-> G, L <-> ML)
 * 2. Count Conversions (DOZEN <-> PCS)
 * 3. Item-Specific Packaging Conversions (BOX, PACK, BOTTLE, BAG, BORI, CRATE, etc.)
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
  'BAG',
  'BORI',
  'CRATE',
  'TIN',
  'CARTON',
  'BLOCK',
  'GALLON'
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
    'BORI', 'BORIS',
    'CARTON', 'CARTONS', 'CTN',
    'CAN', 'CANS', 'TIN', 'TINS',
    'CRATE', 'CRATES', 'TRAY', 'TRAYS',
    'PETI', 'PETIS',
    'BLOCK', 'BLOCKS',
    'GALLON', 'GALLONS',
    'TUB', 'TUBS', 'JAR', 'JARS',
    'ROLL', 'ROLLS', 'STRIP', 'STRIPS'
  ]
};

// Preset packaging defaults for standard restaurant/canteen ingredients
const RESTAURANT_PRESET_PACKAGING = {
  'mozzarella cheese': {
    'BLOCK': { factor: 2, targetUnit: 'KG' },
    'PACK': { factor: 2, targetUnit: 'KG' },
    'CARTON': { factor: 12, targetUnit: 'KG' }
  },
  'cheddar cheese': {
    'BLOCK': { factor: 2.5, targetUnit: 'KG' },
    'PACK': { factor: 0.2, targetUnit: 'KG' },
    'CARTON': { factor: 10, targetUnit: 'KG' }
  },
  'cheese': {
    'BLOCK': { factor: 2, targetUnit: 'KG' },
    'PACK': { factor: 2, targetUnit: 'KG' }
  },
  'tetrapak milk': {
    'PACK': { factor: 1, targetUnit: 'L' },
    'CARTON': { factor: 12, targetUnit: 'L' }
  },
  'milk': {
    'PACK': { factor: 1, targetUnit: 'L' },
    'CARTON': { factor: 12, targetUnit: 'L' }
  },
  'fresh cream': {
    'PACK': { factor: 1, targetUnit: 'L' },
    'CARTON': { factor: 12, targetUnit: 'L' }
  },
  'cooking oil': {
    'TIN': { factor: 16, targetUnit: 'L' },
    'CAN': { factor: 5, targetUnit: 'L' },
    'CARTON': { factor: 16, targetUnit: 'L' },
    'BOTTLE': { factor: 1, targetUnit: 'L' }
  },
  'banaspati ghee': {
    'TIN': { factor: 16, targetUnit: 'KG' },
    'CARTON': { factor: 16, targetUnit: 'KG' },
    'POUCH': { factor: 1, targetUnit: 'KG' }
  },
  'wheat flour': {
    'BORI': { factor: 50, targetUnit: 'KG' },
    'BAG': { factor: 20, targetUnit: 'KG' }
  },
  'flour': {
    'BORI': { factor: 50, targetUnit: 'KG' }
  },
  'maida': {
    'BORI': { factor: 50, targetUnit: 'KG' },
    'BAG': { factor: 25, targetUnit: 'KG' }
  },
  'basmati rice': {
    'BORI': { factor: 50, targetUnit: 'KG' },
    'BAG': { factor: 25, targetUnit: 'KG' }
  },
  'sugar': {
    'BORI': { factor: 50, targetUnit: 'KG' },
    'BAG': { factor: 10, targetUnit: 'KG' }
  },
  'eggs': {
    'DOZEN': { factor: 12, targetUnit: 'PCS' },
    'CRATE': { factor: 30, targetUnit: 'PCS' },
    'TRAY': { factor: 30, targetUnit: 'PCS' },
    'PETI': { factor: 360, targetUnit: 'PCS' }
  },
  'burger buns': {
    'PACK': { factor: 4, targetUnit: 'PCS' },
    'CRATE': { factor: 48, targetUnit: 'PCS' }
  },
  'ketchup': {
    'GALLON': { factor: 4.5, targetUnit: 'KG' },
    'POUCH': { factor: 1, targetUnit: 'KG' },
    'BOTTLE': { factor: 1, targetUnit: 'KG' },
    'PACK': { factor: 1, targetUnit: 'KG' }
  },
  'tomato ketchup': {
    'GALLON': { factor: 4.5, targetUnit: 'KG' },
    'POUCH': { factor: 1, targetUnit: 'KG' }
  },
  'mayonnaise': {
    'GALLON': { factor: 4, targetUnit: 'KG' },
    'POUCH': { factor: 1, targetUnit: 'KG' }
  },
  'tea leaves': {
    'PACK': { factor: 0.9, targetUnit: 'KG' },
    'BORI': { factor: 50, targetUnit: 'KG' }
  }
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
  if (['PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS', 'POUCH', 'POUCHES'].includes(u)) return 'PACK';
  if (['BOTTLE', 'BOTTLES', 'BTL'].includes(u)) return 'BOTTLE';
  if (['BAG', 'BAGS', 'SACK', 'SACKS'].includes(u)) return 'BAG';
  if (['BORI', 'BORIS'].includes(u)) return 'BORI';
  if (['CARTON', 'CARTONS', 'CTN'].includes(u)) return 'CARTON';
  if (['CAN', 'CANS', 'TIN', 'TINS'].includes(u)) return 'TIN';
  if (['CRATE', 'CRATES', 'TRAY', 'TRAYS'].includes(u)) return 'CRATE';
  if (['PETI', 'PETIS'].includes(u)) return 'PETI';
  if (['BLOCK', 'BLOCKS'].includes(u)) return 'BLOCK';
  if (['GALLON', 'GALLONS'].includes(u)) return 'GALLON';
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
 */
const resolvePackageFactor = (source, target, packageConversions, itemName = '') => {
  let conversions = packageConversions;

  // Fallback to restaurant preset packaging if not provided or empty
  if ((!conversions || typeof conversions !== 'object' || Object.keys(conversions).length === 0) && itemName) {
    const clean = itemName.toLowerCase();
    for (const [key, preset] of Object.entries(RESTAURANT_PRESET_PACKAGING)) {
      if (clean.includes(key)) {
        conversions = preset;
        break;
      }
    }
  }

  if (!conversions || typeof conversions !== 'object') return null;

  for (const [pkgUnit, cfg] of Object.entries(conversions)) {
    const normPkg = normalizeUnit(pkgUnit);
    if (typeof cfg === 'number' && cfg > 0) {
      if (source === normPkg) return cfg;
      if (target === normPkg) return 1 / cfg;
    } else if (cfg && typeof cfg === 'object') {
      const factor = Number(cfg.factor);
      const cfgTarget = normalizeUnit(cfg.targetUnit || cfg.toUnit);
      if (factor > 0) {
        if (source === normPkg && target === cfgTarget) return factor;
        if (target === normPkg && source === cfgTarget) return 1 / factor;
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
 */
const convertUnit = (qty, fromUnit, toUnit, packageFactorOrConversions = null, itemName = '') => {
  const amount = Number(qty);
  if (isNaN(amount)) throw new Error(`Invalid numeric quantity: ${qty}`);

  const source = normalizeUnit(fromUnit);
  const target = normalizeUnit(toUnit);

  if (source === target) return amount;

  // 1. Direct numeric factor passed
  if (typeof packageFactorOrConversions === 'number' && packageFactorOrConversions > 0) {
    return amount * packageFactorOrConversions;
  }

  // 2. Standard physical conversions
  const stdResult = convertStandardUnits(amount, source, target);
  if (stdResult !== null) return stdResult;

  // 2.5 Kitchen Liquid Density Bridge (Milk, Water, Cream, Oil, Vinegar, etc. 1 KG ~= 1 L)
  const isLiquid = /milk|water|cream|oil|vinegar|syrup|juice|sauce|ketchup|mayo|paste|puree/i.test(itemName || '');
  if (isLiquid) {
    if ((source === 'KG' && target === 'L') || (source === 'L' && target === 'KG')) return amount;
    if ((source === 'G' && target === 'ML') || (source === 'ML' && target === 'G')) return amount;
    if (source === 'KG' && target === 'ML') return amount * 1000;
    if (source === 'ML' && target === 'KG') return amount / 1000;
    if (source === 'G' && target === 'L') return amount / 1000;
    if (source === 'L' && target === 'G') return amount * 1000;
  }

  // 3. Item-specific package conversion lookup
  const factor = resolvePackageFactor(source, target, packageFactorOrConversions, itemName);
  if (factor !== null && factor > 0) {
    return amount * factor;
  }

  // 3.4 Bridge two package units through a common base target unit (e.g. BLOCK -> PACK via KG)
  const conversionsObj = (typeof packageFactorOrConversions === 'object' && packageFactorOrConversions !== null) ? packageFactorOrConversions : null;
  if (conversionsObj) {
    let sourceToBase = null;
    let targetToBase = null;
    let commonBaseUnit = null;

    for (const [pkgUnit, cfg] of Object.entries(conversionsObj)) {
      const normPkg = normalizeUnit(pkgUnit);
      if (cfg && typeof cfg === 'object') {
        const factor = Number(cfg.factor);
        const tUnit = normalizeUnit(cfg.targetUnit || cfg.toUnit);
        if (normPkg === source && factor > 0) {
          sourceToBase = factor;
          commonBaseUnit = tUnit;
        }
        if (normPkg === target && factor > 0) {
          targetToBase = factor;
          if (!commonBaseUnit) commonBaseUnit = tUnit;
        }
      }
    }

    if (sourceToBase !== null && targetToBase !== null && targetToBase > 0) {
      // Both source and target have conversion to base unit: amount * (sourceToBase / targetToBase)
      return amount * (sourceToBase / targetToBase);
    }
  }

  // 3.5 Common kitchen fallback: If converting between packaging units or packaging <-> standard, fallback gracefully
  const pkgTypes = ['PACK', 'BOTTLE', 'POUCH', 'CAN', 'TUB', 'JAR', 'BLOCK', 'BOX', 'PIECE', 'PCS', 'CARTON', 'BAG', 'BORI', 'TIN', 'CRATE'];
  if (pkgTypes.includes(source) && ['KG', 'L', 'PCS'].includes(target)) {
    return amount * 1;
  }
  if (pkgTypes.includes(target) && ['KG', 'L', 'PCS'].includes(source)) {
    return amount * 1;
  }
  // If converting between two packaging units directly (e.g. BLOCK <-> PACK), default 1:1 fallback
  if (pkgTypes.includes(source) && pkgTypes.includes(target)) {
    return amount * 1;
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
  RESTAURANT_PRESET_PACKAGING,
  normalizeUnit,
  areUnitsCompatible,
  convertStandardUnits,
  resolvePackageFactor,
  convertUnit
};
