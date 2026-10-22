const roundMoney = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round((numericValue + Number.EPSILON) * 100) / 100;
};

module.exports = { roundMoney };
