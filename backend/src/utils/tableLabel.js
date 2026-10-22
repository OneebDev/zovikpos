const COUNTER_TABLE_LABEL = 'Counter';
const { verifyTableToken } = require('../services/qrSecurityService');

const isPhysicalTable = (table) => {
  if (!table || !table.id || table.isActive === false || !table.qrToken) return false;
  const verification = verifyTableToken(table.qrToken);
  if (!verification.valid) return false;
  const tokenNumber = String(verification.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
  const storedNumber = String(table.tableNumber || '').trim().replace(/^table\s*/i, '').toLowerCase();
  return tokenNumber === storedNumber && Number(table.branchId) === Number(verification.branchId);
};

const normalizePhysicalTableLabel = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text || /^(dining table|takeaway|takeout|counter|takeaway \/ counter)$/i.test(text)) return null;
  if (/^table\b/i.test(text)) return text.replace(/^table\s*/i, 'Table ');
  return `Table ${text}`;
};

/** Resolve a staff-facing label from persisted snapshots first, then legacy table relations. */
const formatTableLabel = (source) => {
  if (!source) return COUNTER_TABLE_LABEL;
  if (typeof source === 'string' || typeof source === 'number') {
    return normalizePhysicalTableLabel(source) || COUNTER_TABLE_LABEL;
  }

  const snapshotText = String(source.tableLabel || '').trim();
  const snapshotIsCounter = /^(takeaway|takeout|counter|takeaway \/ counter|dining table)$/i.test(snapshotText);
  const snapshot = normalizePhysicalTableLabel(snapshotText);
  if (snapshot) return snapshot;
  if (snapshotIsCounter && !source.tableId && !source.table) return COUNTER_TABLE_LABEL;

  const tableNumber = normalizePhysicalTableLabel(source.tableNumber);
  if (tableNumber) return tableNumber;
  const relationNumber = normalizePhysicalTableLabel(source.table?.tableNumber);
  if (relationNumber) return relationNumber;

  return COUNTER_TABLE_LABEL;
};

const withTableLabel = (order) => {
  if (!order || typeof order !== 'object') return order;
  const tableLabel = formatTableLabel(order);
  const existingTableNumber = normalizePhysicalTableLabel(order.tableNumber);
  const legacyPhysicalNumber = normalizePhysicalTableLabel(order.table?.tableNumber);
  const tableNumber = tableLabel === COUNTER_TABLE_LABEL
    ? COUNTER_TABLE_LABEL
    : existingTableNumber || legacyPhysicalNumber || tableLabel;
  return { ...order, tableNumber, tableLabel };
};

module.exports = { COUNTER_TABLE_LABEL, formatTableLabel, withTableLabel, isPhysicalTable };
