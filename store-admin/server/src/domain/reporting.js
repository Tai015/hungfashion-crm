export const VALID_PAID_ORDER_SQL = `o.order_status NOT IN ('Cancelled', 'Refunded')
  AND EXISTS (SELECT 1 FROM payment paid_payment WHERE paid_payment.order_id = o.order_id AND paid_payment.status = 'Paid')
  AND NOT EXISTS (SELECT 1 FROM payment refunded_payment WHERE refunded_payment.order_id = o.order_id AND refunded_payment.status = 'Refunded')`;

export function localTimestampRangeSql(column, fromParam, toParam) {
  return `${column} >= ($${fromParam}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND ${column} < (($${toParam}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
}

export function customerSpendingSegment(totalSpent) {
  const amount = Number(totalSpent) || 0;
  if (amount <= 0) return 'No purchases (0)';
  if (amount >= 5000000) return 'VIP (≥5M)';
  if (amount >= 2000000) return 'Gold (2M–5M)';
  if (amount >= 500000) return 'Silver (500K–2M)';
  return 'Under 500K';
}
