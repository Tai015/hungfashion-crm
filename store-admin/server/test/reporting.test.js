import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VALID_PAID_ORDER_SQL,
  customerSpendingSegment,
  localTimestampRangeSql,
} from '../src/domain/reporting.js';

test('customer spending segments include zero-spend customers and use inclusive lower bounds', () => {
  assert.equal(customerSpendingSegment(0), 'No purchases (0)');
  assert.equal(customerSpendingSegment(null), 'No purchases (0)');
  assert.equal(customerSpendingSegment(1), 'Under 500K');
  assert.equal(customerSpendingSegment(499999), 'Under 500K');
  assert.equal(customerSpendingSegment(500000), 'Silver (500K–2M)');
  assert.equal(customerSpendingSegment(1999999), 'Silver (500K–2M)');
  assert.equal(customerSpendingSegment(2000000), 'Gold (2M–5M)');
  assert.equal(customerSpendingSegment(4999999), 'Gold (2M–5M)');
  assert.equal(customerSpendingSegment(5000000), 'VIP (≥5M)');
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
