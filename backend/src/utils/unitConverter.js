/**
 * Unit Converter Utility for ZovikPOS Inventory Management
 * Handles standard measurement unit conversions between recipe requirements,
 * supplier invoices, and inventory stock units.
 */

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
  COUNT: [
    'PCS', 'PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS',
    'DOZEN', 'DOZENS', 'DZ',
    'PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS',
    'BOX', 'BOXES', 'BX',
    'CARTON', 'CARTONS', 'CTN',
    'BOTTLE', 'BOTTLES', 'BTL',
    'CAN', 'CANS', 'TIN', 'TINS',
    'BAG', 'BAGS', 'SACK', 'SACKS',
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

  // Count / Packaging canonical forms
  if (['DOZEN', 'DOZENS', 'DZ'].includes(u)) return 'DOZEN';
  if (['PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS'].includes(u)) return 'PACK';
  if (['BOX', 'BOXES', 'BX'].includes(u)) return 'BOX';
  if (['CARTON', 'CARTONS', 'CTN'].includes(u)) return 'CARTON';
  if (['BOTTLE', 'BOTTLES', 'BTL'].includes(u)) return 'BOTTLE';
  if (['CAN', 'CANS', 'TIN', 'TINS'].includes(u)) return 'CAN';
  if (['BAG', 'BAGS', 'SACK', 'SACKS'].includes(u)) return 'BAG';
  if (['TUB', 'TUBS', 'JAR', 'JARS'].includes(u)) return 'TUB';
  if (['ROLL', 'ROLLS'].includes(u)) return 'ROLL';
  if (['STRIP', 'STRIPS'].includes(u)) return 'STRIP';
  if (['PCS', 'PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS'].includes(u)) return 'PCS';

  return u;
};

/**
 * Checks if two units belong to the same physical measurement family
 */
const areUnitsCompatible = (unitA, unitB) => {
  const normA = normalizeUnit(unitA);
  const normB = normalizeUnit(unitB);
  if (normA === normB) return true;

  for (const group of Object.values(UNIT_GROUPS)) {
    const hasA = group.includes(normA);
    const hasB = group.includes(normB);
    if (hasA && hasB) return true;
  }
  return false;
};

/**
 * Converts a quantity from recipe/invoice unit to target inventory unit.
 * Supports standard weight, volume, dozen conversions, and optional package conversion factor.
 * Throws an explicit error if units belong to incompatible measurement families without a package conversion factor.
 * 
 * @param {number} qty Quantity to convert
 * @param {string} fromUnit Unit of the quantity
 * @param {string} toUnit Target unit to convert into
 * @param {number|null} packageFactor Optional item-specific conversion factor (e.g. 1 carton = 24 pcs, or 1 pack = 0.5 kg)
 * @returns {number} Converted quantity
 */
const convertUnit = (qty, fromUnit, toUnit, packageFactor = null) => {
  const amount = Number(qty);
  if (isNaN(amount)) throw new Error(`Invalid numeric quantity: ${qty}`);

  const source = normalizeUnit(fromUnit);
  const target = normalizeUnit(toUnit);

  if (source === target) return amount;

  // 1. If explicit package conversion factor is provided (e.g. 1 carton = 12 pcs)
  if (packageFactor && typeof packageFactor === 'number' && packageFactor > 0) {
    return amount * packageFactor;
  }

  // 2. Weight conversions
  const isWeightSource = UNIT_GROUPS.WEIGHT.includes(source);
  const isWeightTarget = UNIT_GROUPS.WEIGHT.includes(target);

  if (isWeightSource && isWeightTarget) {
    // Convert source to Grams baseline
    let grams = amount;
    if (source === 'KG') grams = amount * 1000;
    else if (source === 'MG') grams = amount / 1000;
    else if (source === 'LB') grams = amount * 453.59237;
    else if (source === 'OZ') grams = amount * 28.34952;

    // Convert Grams to target
    if (target === 'KG') return grams / 1000;
    if (target === 'G') return grams;
    if (target === 'MG') return grams * 1000;
    if (target === 'LB') return grams / 453.59237;
    if (target === 'OZ') return grams / 28.34952;
  }

  // 3. Volume conversions
  const isVolumeSource = UNIT_GROUPS.VOLUME.includes(source);
  const isVolumeTarget = UNIT_GROUPS.VOLUME.includes(target);

  if (isVolumeSource && isVolumeTarget) {
    // Convert source to Milliliters baseline
    let ml = amount;
    if (source === 'L') ml = amount * 1000;
    else if (source === 'CL') ml = amount * 10;

    // Convert Milliliters to target
    if (target === 'L') return ml / 1000;
    if (target === 'ML') return ml;
    if (target === 'CL') return ml / 10;
  }

  // 4. Count conversions (DOZEN <-> PCS)
  if (source === 'DOZEN' && target === 'PCS') return amount * 12;
  if (source === 'PCS' && target === 'DOZEN') return amount / 12;

  // Incompatible unit conversion guard (e.g. KG -> L or PCS -> KG without specific conversion factor)
  throw new Error(
    `Incompatible unit conversion from "${fromUnit}" (${source}) to "${toUnit}" (${target}). ` +
    `Weight, volume, and packaging count units cannot be converted automatically without an item-specific package conversion factor.`
  );
};

module.exports = {
  UNIT_GROUPS,
  normalizeUnit,
  areUnitsCompatible,
  convertUnit
};
