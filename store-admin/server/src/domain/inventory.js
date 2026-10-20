import { LOW_STOCK_THRESHOLD } from './types.js';

export { LOW_STOCK_THRESHOLD };

export function isLowStock(quantity) {
  return quantity <= LOW_STOCK_THRESHOLD;
}

export function canDecrementStock(currentQty, requestedQty) {
  const current = Math.max(0, Math.floor(currentQty));
  const requested = Math.max(0, Math.floor(requestedQty));
  return requested > 0 && current >= requested;
}

export function applyStockDelta(currentQty, delta) {
  const current = Math.max(0, Math.floor(currentQty));
  const next = current + Math.trunc(delta);

  if (next < 0) return { newQty: current, applied: false };
  return { newQty: next, applied: true };
}

export function applySale(currentQty, saleQty) {
  if (!canDecrementStock(currentQty, saleQty)) {
    return { newQty: Math.max(0, Math.floor(currentQty)), applied: false };
  }
  return applyStockDelta(currentQty, -Math.floor(saleQty));
}

export function calcReceiptStockDelta(receiptType, quantity) {
  const qty = Math.max(0, Math.floor(quantity));
  return receiptType === 'Export' ? -qty : qty;
}

export function applyReceipt(currentQty, receiptType, quantity) {
  return applyStockDelta(currentQty, calcReceiptStockDelta(receiptType, quantity));
}

export function applyBatchStockDeltas(initialQuantities, deltas) {
  const quantities = { ...initialQuantities };
  const results = [];

  for (const { variantId, delta } of deltas) {
    const current = quantities[variantId] ?? 0;
    const { newQty, applied } = applyStockDelta(current, delta);
    quantities[variantId] = newQty;
    results.push({ variantId, requestedDelta: delta, applied, newQuantity: newQty });
  }

  return { quantities, results };
}

export function allQuantitiesNonNegative(quantities) {
  return Object.values(quantities).every(quantity => quantity >= 0);
}
