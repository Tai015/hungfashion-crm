import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCustomerTier } from '../src/domain/loyalty.js';

test('membership tier thresholds are inclusive at each boundary', () => {
  const cases = [
    [0, 'New'], [999, 'New'], [1000, 'Regular'], [4999, 'Regular'],
    [5000, 'Silver'], [19999, 'Silver'], [20000, 'Gold'],
    [99999, 'Gold'], [100000, 'VIP'], [250000, 'VIP'],
  ];
  for (const [points, expected] of cases) {
    assert.equal(getCustomerTier(points), expected, 'points=' + points);
  }
});

test('negative and non-numeric lifetime points safely resolve to New', () => {
  assert.equal(getCustomerTier(-100), 'New');
  assert.equal(getCustomerTier(Number.NaN), 'New');
});
