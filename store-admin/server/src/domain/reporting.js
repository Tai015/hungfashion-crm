export const VALID_PAID_ORDER_SQL = `o.order_status NOT IN ('Cancelled', 'Refunded')
  AND EXISTS (SELECT 1 FROM payment paid_payment WHERE paid_payment.order_id = o.order_id AND paid_payment.status = 'Paid')
  AND NOT EXISTS (SELECT 1 FROM payment refunded_payment WHERE refunded_payment.order_id = o.order_id AND refunded_payment.status = 'Refunded')`;

export function localTimestampRangeSql(column, fromParam, toParam) {
  return `${column} >= ($${fromParam}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND ${column} < (($${toParam}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
}

export const CUSTOMER_SPENDING_SEGMENT_CASE_SQL = `CASE
  WHEN lifetime_spent = 0 THEN 'No purchases (0)'
  WHEN lifetime_spent >= 5000000 THEN 'VIP (≥5M)'
  WHEN lifetime_spent >= 2000000 THEN 'Gold (2M–5M)'
  WHEN lifetime_spent >= 500000 THEN 'Silver (500K–2M)'
  ELSE 'Under 500K'
END`;
