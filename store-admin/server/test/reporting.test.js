import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VALID_PAID_ORDER_SQL,
  CUSTOMER_SPENDING_SEGMENT_CASE_SQL,
  localTimestampRangeSql,
} from '../src/domain/reporting.js';

test('customer spending SQL keeps zero-spend customers and uses inclusive lower bounds', () => {
  assert.match(CUSTOMER_SPENDING_SEGMENT_CASE_SQL, /lifetime_spent = 0 THEN 'No purchases \\(0\\)'/);
  assert.match(CUSTOMER_SPENDING_SEGMENT_CASE_SQL, /lifetime_spent >= 5000000 THEN 'VIP/);
  assert.match(CUSTOMER_SPENDING_SEGMENT_CASE_SQL, /lifetime_spent >= 2000000 THEN 'Gold/);
  assert.match(CUSTOMER_SPENDING_SEGMENT_CASE_SQL, /lifetime_spent >= 500000 THEN 'Silver/);
  assert.match(CUSTOMER_SPENDING_SEGMENT_CASE_SQL, /ELSE 'Under 500K'/);
});

test('shared paid-order rule excludes cancelled, refunded and refunded payment records', () => {
  assert.match(VALID_PAID_ORDER_SQL, /order_status NOT IN \('Cancelled', 'Refunded'\)/);
  assert.match(VALID_PAID_ORDER_SQL, /EXISTS \(SELECT 1 FROM payment paid_payment/);
  assert.match(VALID_PAID_ORDER_SQL, /paid_payment\.status = 'Paid'/);
  assert.match(VALID_PAID_ORDER_SQL, /NOT EXISTS \(SELECT 1 FROM payment refunded_payment/);
  assert.match(VALID_PAID_ORDER_SQL, /refunded_payment\.status = 'Refunded'/);
});

test('date filters use Vietnam local midnight and an exclusive next-day boundary', () => {
  const sql = localTimestampRangeSql('o.ordered_at', 2, 3);
  assert.match(sql, /o\.ordered_at >= \(\$2::date::timestamp AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)/);
  assert.match(sql, /o\.ordered_at < \(\(\$3::date \+ INTERVAL '1 day'\)::timestamp AT TIME ZONE 'Asia\/Ho_Chi_Minh'\)/);
});
