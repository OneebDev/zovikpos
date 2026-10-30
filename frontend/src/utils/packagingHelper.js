/**
 * Shared Packaging and Unit Conversion Helper for ZovikPOS
 * Supports:
 * - Standard measurement conversions (KG, G, L, ML, PCS, DOZEN)
 * - Preset packaging conversions for 200+ restaurant/canteen ingredients
 * - Dynamic custom packaging per item
 */

export const STANDARD_MEASUREMENT_UNITS = [
  'KG',
  'G',
  'L',
  'ML',
  'PCS',
  'DOZEN',
  'PACK',
  'BOX',
  'CARTON',
  'BOTTLE',
  'CAN',
  'TIN',
  'BAG',
  'BORI',
  'CRATE',
  'TRAY',
  'ROLL'
];

/**
 * Standard Restaurant & Canteen Preset Packaging Map
 * Maps ingredient name keywords to standard packaging configurations.
 */
export const PRESET_PACKAGING_DEFAULTS = {
  // Cheese
  'mozzarella cheese': {
    'BLOCK': { factor: 2, targetUnit: 'KG', label: 'Block (2 KG)' },
    'PACK': { factor: 2, targetUnit: 'KG', label: 'Pack (2 KG)' },
    'CARTON': { factor: 12, targetUnit: 'KG', label: 'Carton (6x2kg = 12 KG)' }
  },
  'cheddar cheese': {
    'BLOCK': { factor: 2.5, targetUnit: 'KG', label: 'Block (2.5 KG)' },
    'PACK': { factor: 0.2, targetUnit: 'KG', label: 'Retail Pack (200g)' },
    'CARTON': { factor: 10, targetUnit: 'KG', label: 'Carton (10 KG)' }
  },
  'cheese slices': {
    'PACK': { factor: 12, targetUnit: 'PCS', label: 'Pack of 12 Slices' },
    'PACK_24': { factor: 24, targetUnit: 'PCS', label: 'Pack of 24 Slices' },
    'BOX': { factor: 84, targetUnit: 'PCS', label: 'Box (84 Slices)' }
  },

  // Milk & Dairy
  'tetrapak milk': {
    'PACK': { factor: 1, targetUnit: 'L', label: '1 Liter Pack' },
    'CARTON': { factor: 12, targetUnit: 'L', label: 'Carton (12x1L)' },
    'MINI': { factor: 0.25, targetUnit: 'L', label: 'Mini Pack (250 ML)' }
  },
  'milk': {
    'PACK': { factor: 1, targetUnit: 'L', label: '1 Liter Pack' },
    'CARTON': { factor: 12, targetUnit: 'L', label: 'Carton (12 Liters)' },
    'CANDY_CAN': { factor: 10, targetUnit: 'L', label: 'Milk Can (10 Liters)' }
  },
  'fresh cream': {
    'PACK': { factor: 1, targetUnit: 'L', label: '1 Liter Pack' },
    'PACK_200ML': { factor: 0.2, targetUnit: 'L', label: 'Small Pack (200 ML)' },
    'CARTON': { factor: 12, targetUnit: 'L', label: 'Carton (12 Packs)' }
  },
  'butter': {
    'BLOCK': { factor: 1, targetUnit: 'KG', label: 'Block (1 KG)' },
    'PACK': { factor: 0.2, targetUnit: 'KG', label: 'Pack (200g)' },
    'CARTON': { factor: 10, targetUnit: 'KG', label: 'Carton (10 KG)' }
  },

  // Eggs
  'eggs': {
    'DOZEN': { factor: 12, targetUnit: 'PCS', label: 'Dozen (12 Eggs)' },
    'CRATE': { factor: 30, targetUnit: 'PCS', label: 'Tray / Crate (30 Eggs)' },
    'TRAY': { factor: 30, targetUnit: 'PCS', label: 'Tray / Crate (30 Eggs)' },
    'PETI': { factor: 360, targetUnit: 'PCS', label: 'Peti (12 Crates = 360 Eggs)' }
  },

  // Oils & Ghee
  'cooking oil': {
    'TIN': { factor: 16, targetUnit: 'L', label: 'Tin (16 Liters)' },
    'CAN': { factor: 5, targetUnit: 'L', label: 'Can (5 Liters)' },
    'CARTON': { factor: 16, targetUnit: 'L', label: 'Carton (16 Liters)' },
    'BOTTLE': { factor: 1, targetUnit: 'L', label: 'Bottle (1 Liter)' }
  },
  'banaspati ghee': {
    'TIN': { factor: 16, targetUnit: 'KG', label: 'Tin (16 KG)' },
    'CARTON': { factor: 16, targetUnit: 'KG', label: 'Carton (16x1kg)' },
    'POUCH': { factor: 1, targetUnit: 'KG', label: 'Pouch (1 KG)' }
  },

  // Flours & Grains
  'wheat flour': {
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori / Sack (50 KG)' },
    'BAG': { factor: 20, targetUnit: 'KG', label: 'Bag (20 KG)' },
    'BAG_10KG': { factor: 10, targetUnit: 'KG', label: 'Bag (10 KG)' }
  },
  'maida': {
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori / Sack (50 KG)' },
    'BAG': { factor: 25, targetUnit: 'KG', label: 'Bag (25 KG)' }
  },
  'basmati rice': {
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori (50 KG)' },
    'BAG': { factor: 25, targetUnit: 'KG', label: 'Bag (25 KG)' }
  },
  'sella rice': {
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori (50 KG)' },
    'BAG': { factor: 25, targetUnit: 'KG', label: 'Bag (25 KG)' }
  },
  'sugar': {
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori (50 KG)' },
    'BAG': { factor: 10, targetUnit: 'KG', label: 'Bag (10 KG)' }
  },

  // Bakery Buns & Patties
  'burger buns': {
    'PACK': { factor: 4, targetUnit: 'PCS', label: 'Pack of 4 Buns' },
    'PACK_6': { factor: 6, targetUnit: 'PCS', label: 'Pack of 6 Buns' },
    'CRATE': { factor: 48, targetUnit: 'PCS', label: 'Crate (48 Buns)' }
  },
  'sesame burger buns': {
    'PACK': { factor: 4, targetUnit: 'PCS', label: 'Pack of 4 Buns' },
    'PACK_6': { factor: 6, targetUnit: 'PCS', label: 'Pack of 6 Buns' },
    'CRATE': { factor: 48, targetUnit: 'PCS', label: 'Crate (48 Buns)' }
  },
  'pita bread': {
    'PACK': { factor: 10, targetUnit: 'PCS', label: 'Pack of 10 Pita' },
    'BAG': { factor: 50, targetUnit: 'PCS', label: 'Bulk Bag (50 Pita)' }
  },
  'beef burger patties': {
    'PACK': { factor: 10, targetUnit: 'PCS', label: 'Pack of 10 Patties' },
    'BOX': { factor: 24, targetUnit: 'PCS', label: 'Box of 24 Patties' }
  },
  'chicken patties': {
    'PACK': { factor: 10, targetUnit: 'PCS', label: 'Pack of 10 Patties' },
    'BOX': { factor: 24, targetUnit: 'PCS', label: 'Box of 24 Patties' }
  },

  // Sauces & Condiments
  'ketchup': {
    'GALLON': { factor: 4.5, targetUnit: 'KG', label: 'Gallon (4.5 KG)' },
    'POUCH': { factor: 1, targetUnit: 'KG', label: 'Pouch (1 KG)' },
    'BOTTLE': { factor: 1, targetUnit: 'KG', label: 'Bottle (1 KG)' },
    'PACK': { factor: 1, targetUnit: 'KG', label: 'Pack (1 KG)' }
  },
  'tomato ketchup': {
    'GALLON': { factor: 4.5, targetUnit: 'KG', label: 'Gallon (4.5 KG)' },
    'POUCH': { factor: 1, targetUnit: 'KG', label: 'Pouch (1 KG)' },
    'BOX': { factor: 500, targetUnit: 'PCS', label: 'Sachet Box (500 Sachets)' }
  },
  'mayonnaise': {
    'GALLON': { factor: 4, targetUnit: 'KG', label: 'Gallon (4 KG)' },
    'POUCH': { factor: 1, targetUnit: 'KG', label: 'Pouch (1 KG)' }
  },
  'chilli garlic sauce': {
    'GALLON': { factor: 4.5, targetUnit: 'KG', label: 'Gallon (4.5 KG)' },
    'POUCH': { factor: 1, targetUnit: 'KG', label: 'Pouch (1 KG)' }
  },

  // Beverages
  'cold drinks 250ml': {
    'PACK': { factor: 6, targetUnit: 'PCS', label: '6-Pack' },
    'CARTON': { factor: 24, targetUnit: 'PCS', label: 'Carton (24 Cans)' }
  },
  'cold drinks 1.5l': {
    'PACK': { factor: 6, targetUnit: 'BOTTLE', label: 'Pack of 6 Bottles' }
  },
  'water bottles 500ml': {
    'CARTON': { factor: 24, targetUnit: 'PCS', label: 'Carton (24 Bottles)' }
  },
  'tea leaves': {
    'PACK': { factor: 0.9, targetUnit: 'KG', label: 'Family Pack (900g)' },
    'PACK_450G': { factor: 0.45, targetUnit: 'KG', label: 'Pack (450g)' },
    'BORI': { factor: 50, targetUnit: 'KG', label: 'Bori (50 KG)' }
  },

  // Packaging & Disposables
  'paper tea cups 8oz': {
    'PACK': { factor: 50, targetUnit: 'PCS', label: 'Pack of 50 Cups' },
    'CARTON': { factor: 1000, targetUnit: 'PCS', label: 'Carton of 1000 Cups' }
  },
  'beverage cups 16oz': {
    'PACK': { factor: 50, targetUnit: 'PCS', label: 'Pack of 50 Cups' },
    'CARTON': { factor: 1000, targetUnit: 'PCS', label: 'Carton of 1000 Cups' }
  },
  'burger boxes': {
    'PACK': { factor: 100, targetUnit: 'PCS', label: 'Pack of 100 Boxes' },
    'CARTON': { factor: 500, targetUnit: 'PCS', label: 'Carton of 500 Boxes' }
  },
  'pizza boxes 12 inch': {
    'PACK': { factor: 50, targetUnit: 'PCS', label: 'Bundle of 50 Boxes' }
  },
  'straws': {
    'PACK': { factor: 100, targetUnit: 'PCS', label: 'Pack of 100 Straws' }
  },
  'tissue napkins': {
    'PACK': { factor: 100, targetUnit: 'PCS', label: 'Pack of 100 Napkins' },
    'CARTON': { factor: 24, targetUnit: 'PACK', label: 'Carton of 24 Packs' }
  }
};

/**
 * Normalizes any unit string to its canonical representation
 */
export const canonicalUnit = (unit = '') => {
  const value = String(unit).trim().toUpperCase();
  if (['KILOGRAM', 'KILOGRAMS'].includes(value)) return 'KG';
  if (['G', 'GM', 'GRAM', 'GRAMS'].includes(value)) return 'G';
  if (['MILLIGRAM', 'MILLIGRAMS'].includes(value)) return 'MG';
  if (['LTR', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(value)) return 'L';
  if (['ML', 'MILLILITER', 'MILLILITERS', 'MILLILITRE', 'MILLILITRES'].includes(value)) return 'ML';
  if (['CL', 'CENTILITER', 'CENTILITERS'].includes(value)) return 'CL';
  if (['PC', 'PIECE', 'PIECES', 'UNIT', 'UNITS', 'NO', 'NOS'].includes(value)) return 'PCS';
  if (['DOZEN', 'DOZENS', 'DZ'].includes(value)) return 'DOZEN';
  if (['POUND', 'POUNDS', 'LB', 'LBS'].includes(value)) return 'LB';
  if (['OUNCE', 'OUNCES', 'OZ'].includes(value)) return 'OZ';
  if (['BOX', 'BOXES', 'BX'].includes(value)) return 'BOX';
  if (['PACK', 'PACKS', 'PACKET', 'PACKETS', 'PKT', 'PKTS'].includes(value)) return 'PACK';
  if (['BOTTLE', 'BOTTLES', 'BTL'].includes(value)) return 'BOTTLE';
  if (['BAG', 'BAGS', 'SACK', 'SACKS'].includes(value)) return 'BAG';
  if (['BORI', 'BORIS'].includes(value)) return 'BORI';
  if (['CARTON', 'CARTONS', 'CTN'].includes(value)) return 'CARTON';
  if (['TIN', 'TINS', 'CAN', 'CANS'].includes(value)) return 'TIN';
  if (['CRATE', 'CRATES', 'TRAY', 'TRAYS'].includes(value)) return 'CRATE';
  return value;
};

/**
 * Looks up default packaging conversions for a given item name
 */
export const getPresetPackagingForName = (name = '') => {
  const cleanName = String(name).trim().toLowerCase();
  for (const [key, config] of Object.entries(PRESET_PACKAGING_DEFAULTS)) {
    if (cleanName === key || cleanName.includes(key)) {
      return config;
    }
  }
  return null;
};

/**
 * Calculates converted quantity from any unit (standard or packaging) to item's base unit.
 */
export const convertQuantityWithPackaging = (amount, fromUnit, targetItem) => {
  const qty = Number(amount);
  if (!Number.isFinite(qty)) return null;

  const toUnit = targetItem?.unit || 'KG';
  const source = canonicalUnit(fromUnit);
  const target = canonicalUnit(toUnit);

  if (source === target) return qty;

  // 1. Standard Physical Conversions
  const weightToGrams = { KG: 1000, G: 1, MG: 0.001, LB: 453.59237, OZ: 28.34952 };
  const volumeToMl = { L: 1000, ML: 1, CL: 10 };

  if (weightToGrams[source] && weightToGrams[target]) {
    return (qty * weightToGrams[source]) / weightToGrams[target];
  }
  if (volumeToMl[source] && volumeToMl[target]) {
    return (qty * volumeToMl[source]) / volumeToMl[target];
  }
  if (source === 'DOZEN' && target === 'PCS') return qty * 12;
  if (source === 'PCS' && target === 'DOZEN') return qty / 12;

  // Kitchen Liquid Density Bridge (Milk, Water, Cream, Oil, etc. 1 KG ~= 1 L)
  const isLiquid = /milk|water|cream|oil|vinegar|syrup|juice|sauce|ketchup|mayo|paste|puree/i.test(targetItem?.name || '');
  if (isLiquid) {
    if ((source === 'KG' && target === 'L') || (source === 'L' && target === 'KG')) return qty;
    if ((source === 'G' && target === 'ML') || (source === 'ML' && target === 'G')) return qty;
    if (source === 'KG' && target === 'ML') return qty * 1000;
    if (source === 'ML' && target === 'KG') return qty / 1000;
    if (source === 'G' && target === 'L') return qty / 1000;
    if (source === 'L' && target === 'G') return qty * 1000;
  }

  // 2. Item Specific Packaging Conversions (from DB packageConversions or Preset)
  const packageConversions = targetItem?.packageConversions || getPresetPackagingForName(targetItem?.name);

  if (packageConversions && typeof packageConversions === 'object') {
    for (const [pkgKey, pkgVal] of Object.entries(packageConversions)) {
      const normPkg = canonicalUnit(pkgKey);
      if (source === normPkg) {
        if (typeof pkgVal === 'number' && pkgVal > 0) {
          return qty * pkgVal;
        }
        if (pkgVal && typeof pkgVal === 'object') {
          const factor = Number(pkgVal.factor);
          const pkgTarget = canonicalUnit(pkgVal.targetUnit || toUnit);
          if (factor > 0) {
            if (target === pkgTarget) return qty * factor;
            // Bridge through standard conversion
            if (weightToGrams[pkgTarget] && weightToGrams[target]) {
              return qty * factor * (weightToGrams[pkgTarget] / weightToGrams[target]);
            }
            if (volumeToMl[pkgTarget] && volumeToMl[target]) {
              return qty * factor * (volumeToMl[pkgTarget] / volumeToMl[target]);
            }
          }
        }
      }
    }
  }

  return null;
};

/**
 * Returns available unit choices for a specific inventory item,
 * combining standard units and its packaging sub-units.
 */
export const getAvailableUnitsForItem = (item) => {
  const baseUnit = canonicalUnit(item?.unit || 'KG');
  const available = [{ value: baseUnit, label: `${baseUnit} (Base Unit)`, isBase: true }];

  // Standard compatible measurement units
  if (['KG', 'G', 'MG', 'LB', 'OZ'].includes(baseUnit)) {
    if (baseUnit !== 'KG') available.push({ value: 'KG', label: 'KG (Kilogram)' });
    if (baseUnit !== 'G') available.push({ value: 'G', label: 'G (Gram)' });
  } else if (['L', 'ML', 'CL'].includes(baseUnit)) {
    if (baseUnit !== 'L') available.push({ value: 'L', label: 'L (Liter)' });
    if (baseUnit !== 'ML') available.push({ value: 'ML', label: 'ML (Milliliter)' });
  } else if (['PCS', 'DOZEN'].includes(baseUnit)) {
    if (baseUnit !== 'PCS') available.push({ value: 'PCS', label: 'PCS (Pieces)' });
    if (baseUnit !== 'DOZEN') available.push({ value: 'DOZEN', label: 'DOZEN (12 Pcs)' });
  }

  // Packaging conversions
  const packageConversions = item?.packageConversions || getPresetPackagingForName(item?.name);
  if (packageConversions && typeof packageConversions === 'object') {
    for (const [pkgKey, pkgVal] of Object.entries(packageConversions)) {
      const u = canonicalUnit(pkgKey);
      if (!available.some(a => a.value === u)) {
        let label = u;
        if (typeof pkgVal === 'number') {
          label = `${u} (${pkgVal} ${baseUnit})`;
        } else if (pkgVal && typeof pkgVal === 'object') {
          label = pkgVal.label || `${u} (${pkgVal.factor} ${pkgVal.targetUnit || baseUnit})`;
        }
        available.push({ value: u, label, isPackaging: true, config: pkgVal });
      }
    }
  }

  return available;
};

