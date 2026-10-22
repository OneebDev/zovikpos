/** Display-only currency formatting. Does not alter the numeric value used by checkout logic. */
export const formatPrice = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const hasPaise = Math.abs(safeAmount % 1) > 0.000001;
  return `Rs. ${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safeAmount)}`;
};

