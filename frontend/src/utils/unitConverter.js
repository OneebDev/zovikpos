/**
 * Frontend Unit Converter & Compatibility Utility
 * Mirrors backend unitConverter to provide instant client-side conversion,
 * previewing, and validation before submitting forms.
 */

export const STANDARD_UNITS = [
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

export const UNIT_GROUPS = {
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

export const normalizeUnit = (unit) => {
  if (!unit || typeof unit !== 'string') return 'PCS';
  const u = unit.trim().toUpperCase();

  if (['KG', 'KILOGRAM', 'KILOGRAMS'].includes(u)) return 'KG';
  if (['G', 'GM', 'GRAM', 'GRAMS'].includes(u)) return 'G';
  if (['MG', 'MILLIGRAM', 'MILLIGRAMS'].includes(u)) return 'MG';
  if (['LB', 'LBS', 'POUND', 'POUNDS'].includes(u)) return 'LB';
  if (['OZ', 'OUNCE', 'OUNCES'].includes(u)) return 'OZ';

  if (['L', 'LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(u)) return 'L';
  if (['ML', 'MILLILITER', 'MILLILITERS', 'MILLILITRE', 'MILLILITRES'].includes(u)) return 'ML';
  if (['CL', 'CENTILITER', 'CENTILITERS'].includes(u)) return 'CL';

  if (['DOZEN', 'DOZENS', 'DZ'].includes(u)) return 'DOZEN';
  if (['PCS', 'PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS'].includes(u)) return 'PCS';

  if (['BOX', 'BOXES', 'BX'].includes(u)) return 'BOX';
  if (['PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS'].includes(u)) return 'PACK';
  if (['BOTTLE', 'BOTTLES', 'BTL'].includes(u)) return 'BOTTLE';
  if (['BAG', 'BAGS', 'SACK', 'SACKS'].includes(u)) return 'BAG';

  return u;
};

export const convertStandardUnits = (amount, source, target) => {
  if (source === target) return amount;

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

  if (source === 'DOZEN' && target === 'PCS') return amount * 12;
  if (source === 'PCS' && target === 'DOZEN') return amount / 12;

  return null;
};

export const resolvePackageFactor = (source, target, packageConversions) => {
  if (!packageConversions || typeof packageConversions !== 'object') return null;

  for (const [pkgUnit, cfg] of Object.entries(packageConversions)) {
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

export const areUnitsCompatible = (unitA, unitB, packageConversions = null) => {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);
  if (normA === normB) return true;

  if (UNIT_GROUPS.WEIGHT.includes(normA) && UNIT_GROUPS.WEIGHT.includes(normB)) return true;
  if (UNIT_GROUPS.VOLUME.includes(normA) && UNIT_GROUPS.VOLUME.includes(normB)) return true;
  if (UNIT_GROUPS.COUNT_STANDARD.includes(normA) && UNIT_GROUPS.COUNT_STANDARD.includes(normB)) return true;

  if (packageConversions) {
    const factor = resolvePackageFactor(normA, normB, packageConversions);
    if (factor !== null && factor > 0) return true;
  }

  return false;
};

export const convertUnit = (qty, fromUnit, toUnit, packageFactorOrConversions = null) => {
  const amount = Number(qty);
  if (isNaN(amount)) throw new Error(`Invalid numeric quantity: ${qty}`);

  const source = normalizeUnit(fromUnit);
  const target = normalizeUnit(toUnit);

  if (source === target) return amount;

  if (typeof packageFactorOrConversions === 'number' && packageFactorOrConversions > 0) {
    return amount * packageFactorOrConversions;
  }

  const stdResult = convertStandardUnits(amount, source, target);
  if (stdResult !== null) return stdResult;

  if (packageFactorOrConversions && typeof packageFactorOrConversions === 'object') {
    const factor = resolvePackageFactor(source, target, packageFactorOrConversions);
    if (factor !== null && factor > 0) return amount * factor;
  }

  const error = new Error(
    `Incompatible unit conversion from "${fromUnit}" (${source}) to "${toUnit}" (${target}). ` +
    `Weight, volume, and packaging count units cannot be converted automatically without an item-specific package conversion factor.`
  );
  error.code = 'UNIT_CONVERSION_ERROR';
  error.fromUnit = source;
  error.toUnit = target;
  throw error;
};

export default {
  STANDARD_UNITS,
  UNIT_GROUPS,
  normalizeUnit,
  areUnitsCompatible,
  convertStandardUnits,
  resolvePackageFactor,
  convertUnit
};
