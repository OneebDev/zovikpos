const labels = {
  COD: 'COD',
  EASYPAISA: 'Easypaisa',
  JAZZCASH: 'JazzCash',
  CASH: 'Cash',
  CARD: 'Card',
};

export const paymentMethodKey = (value) => {
  const key = String(value || 'COD').trim().toUpperCase();
  return key === 'NAYAPAY' ? 'EASYPAISA' : key;
};

export const paymentMethodLabel = (value) => {
  const key = paymentMethodKey(value);
  return labels[key] || String(value || 'COD').trim();
};
