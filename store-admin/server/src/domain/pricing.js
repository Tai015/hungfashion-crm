function clampNonNegative(value) {
  return Math.max(value, 0);
}

export function calcOrderSubtotal(items) {
  return items.reduce((sum, item) => {
    const qty = Math.max(0, Math.floor(item.quantity));
    const price = Math.max(0, item.unitPrice);
    return sum + qty * price;
  }, 0);
}

function isWithinDateRange(startDate, endDate, asOfDate) {
  const day = asOfDate.toISOString().slice(0, 10);
  return day >= startDate && day <= endDate;
}

export function isPromotionValid(promo, asOfDate = new Date()) {
  if (!promo.isActive) return { valid: false, reason: 'inactive' };
  if (!isWithinDateRange(promo.startDate, promo.endDate, asOfDate)) {
    return { valid: false, reason: 'expired' };
  }
  if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
    return { valid: false, reason: 'usage_exhausted' };
  }
  if (promo.value < 0 || (promo.promoType === 'Percent' && promo.value > 100)) {
    return { valid: false, reason: 'invalid_value' };
  }
  return { valid: true };
}

export function calcPromotionDiscount(subtotal, promo) {
  const safeSubtotal = clampNonNegative(subtotal);
  if (safeSubtotal < Math.max(0, promo.minOrder)) return 0;

  let discount = promo.promoType === 'Percent'
    ? (safeSubtotal * Math.max(0, promo.value)) / 100
    : Math.max(0, promo.value);

  if (promo.maxDiscount !== null) {
    discount = Math.min(discount, Math.max(0, promo.maxDiscount));
  }

  return Math.min(discount, safeSubtotal);
}

export function calcStackedPromotionDiscount(subtotal, promotions) {
  const safeSubtotal = clampNonNegative(subtotal);
  const totalDiscount = promotions.reduce(
    (sum, promo) => sum + calcPromotionDiscount(safeSubtotal, promo),
    0,
  );
  return Math.min(totalDiscount, safeSubtotal);
}

export function calcOrderTotals(items, promotions = []) {
  const subtotal = calcOrderSubtotal(items);
  const discountAmt = promotions.length === 0
    ? 0
    : promotions.length === 1
      ? calcPromotionDiscount(subtotal, promotions[0])
      : calcStackedPromotionDiscount(subtotal, promotions);
  const totalAmount = clampNonNegative(subtotal - discountAmt);

  return { subtotal, discountAmt, totalAmount };
}

export function assertOrderTotalsInvariant(totals) {
  return totals.subtotal >= 0
    && totals.discountAmt >= 0
    && totals.totalAmount >= 0
    && totals.discountAmt <= totals.subtotal
    && totals.totalAmount === totals.subtotal - totals.discountAmt;
}
