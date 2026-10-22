const COUNTER_TABLE_LABEL = 'Counter';

const normalizePhysicalTableLabel = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const clean = String(value).trim();
  if (!clean || /^(dining table|takeaway|takeout|counter|takeaway \/ counter)$/i.test(clean)) return '';
  if (/^table\b/i.test(clean)) return clean.replace(/^table\s*/i, 'Table ');
  return `Table ${clean}`;
};

export const parseTableDisplay = (tokenOrName) => {
  if (!tokenOrName) return '';
  try {
    let clean = String(tokenOrName).trim();
    if (clean.includes('%')) clean = decodeURIComponent(clean);
    if (/^(takeaway|takeout|counter|takeaway \/ counter)$/i.test(clean)) return COUNTER_TABLE_LABEL;

    const parts = clean.split(':');
    if (parts.length >= 2 && parts[0] === 'tbl') {
      const tableNumber = parts[1];
      if (tableNumber) return tableNumber.toLowerCase().startsWith('table') ? tableNumber : `Table ${tableNumber}`;
    }

    if (clean.toLowerCase().startsWith('table')) {
      const suffix = clean.slice(5).trim();
      const digitsOnly = suffix.replace(/[^0-9]/g, '');
      if (digitsOnly && digitsOnly.length > 4) return '';
      return clean;
    }

    const number = clean.replace(/[^0-9]/g, '');
    if (number && number.length <= 4) return `Table ${number}`;
    return '';
  } catch {
    return '';
  }
};

const isRealTableLabel = (label) => label && label !== COUNTER_TABLE_LABEL;

const parseQrTableDisplay = (token) => {
  if (!token) return '';
  try {
    let clean = String(token).trim();
    if (clean.includes('%')) clean = decodeURIComponent(clean);
    if (clean.toLowerCase().startsWith('table/')) clean = clean.slice('table/'.length);
    return parseTableDisplay(clean);
  } catch {
    return '';
  }
};

/** Shared display resolver: server snapshots first, then relations, then known QR/session text. */
export const resolveTableLabel = ({
  tableLabel,
  tableNumber,
  table,
  sessionLabel,
  routeToken,
  qrToken,
  lastValidLabel,
  forCustomer = false,
} = {}) => {
  const display = (label) => label;
  const snapshot = String(tableLabel || '').trim();
  const snapshotTable = normalizePhysicalTableLabel(snapshot);
  if (snapshotTable) return snapshotTable;

  const relationTable = normalizePhysicalTableLabel(table?.tableNumber);
  if (relationTable) return relationTable;
  const orderTable = normalizePhysicalTableLabel(tableNumber);
  if (orderTable) return orderTable;

  const sessionTable = parseTableDisplay(sessionLabel);
  const routeTable = parseQrTableDisplay(routeToken);
  const qrTable = parseQrTableDisplay(qrToken);

  // A scanned route represents the table the customer is entering now. Prefer
  // matching server/session data, otherwise use the route token immediately.
  if (isRealTableLabel(routeTable)) {
    return sessionTable === routeTable ? sessionTable : routeTable;
  }

  // Stored session table data is considered real only when its QR token agrees.
  if (isRealTableLabel(sessionTable) && isRealTableLabel(qrTable) && sessionTable === qrTable) {
    return sessionTable;
  }

  if (isRealTableLabel(lastValidLabel)) return lastValidLabel;
  const snapshotIsCounter = /^(takeaway|takeout|counter|takeaway \/ counter|dining table)$/i.test(snapshot);
  if (snapshotIsCounter && !table?.tableNumber) return display(COUNTER_TABLE_LABEL);
  if (sessionTable === COUNTER_TABLE_LABEL) return display(COUNTER_TABLE_LABEL);
  return forCustomer ? '' : COUNTER_TABLE_LABEL;
};

export { COUNTER_TABLE_LABEL };
