/**
 * Compact display-only amount for narrow summary bars. Full totals remain
 * available through the accessible label and detailed cart/receipt views.
 */
export const formatCompactAmount = (value, compactAt = 100000) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(safeAmount) < compactAt) {
    return new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: Math.abs(safeAmount % 1) > 0.000001 ? 2 : 0,
    }).format(safeAmount);
  }

  return new Intl.NumberFormat('en-PK', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(safeAmount);
};
