import { DEFAULT_LOYALTY_RULES } from './types.js';

function clampNonNegative(value) {
  return Math.max(0, Math.floor(value));
}

export { DEFAULT_LOYALTY_RULES };

export function calcPointsEarned(totalAmount, rules = DEFAULT_LOYALTY_RULES) {
  const paid = clampNonNegative(totalAmount);
  if (rules.pointsPerTenThousandVnd <= 0) return 0;
  return Math.floor(paid / 10_000) * rules.pointsPerTenThousandVnd;
}

export function calcPointsRedemptionDiscount(pointsToRedeem, rules = DEFAULT_LOYALTY_RULES) {
  const points = clampNonNegative(pointsToRedeem);
  if (rules.pointsPerThousandVnd <= 0) return 0;
  return Math.floor(points / rules.pointsPerThousandVnd) * 1_000;
}

export function canRedeemPoints(currentBalance, points) {
  return points > 0 && currentBalance >= points;
}

export function applyLoyaltyTransaction(currentBalance, tx) {
  const balance = clampNonNegative(currentBalance);
  const points = clampNonNegative(tx.points);

  if (points === 0 && tx.type !== 'adjust') {
    return { applied: false, newBalance: balance };
  }

  switch (tx.type) {
    case 'earn':
      return { applied: true, newBalance: balance + points };
    case 'redeem':
      if (!canRedeemPoints(balance, points)) {
        return { applied: false, newBalance: balance };
      }
      return { applied: true, newBalance: balance - points };
    case 'adjust': {
      const next = balance + points;
      if (next < 0) return { applied: false, newBalance: balance };
      return { applied: true, newBalance: next };
    }
    default:
      return { applied: false, newBalance: balance };
  }
}

export function computeBalanceFromHistory(transactions) {
  return transactions.reduce((balance, tx) => {
    const result = applyLoyaltyTransaction(balance, tx);
    return result.applied ? result.newBalance : balance;
  }, 0);
}

export function isBalanceNonNegative(balance) {
  return balance >= 0;
}
