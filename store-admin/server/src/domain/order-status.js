import { ORDER_STATUSES } from './types.js';

export const ORDER_STATUS_TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: ['Refunded'],
  Cancelled: [],
  Refunded: [],
};

const TERMINAL_STATUSES = new Set(['Cancelled', 'Refunded']);

export function isOrderStatus(value) {
  return ORDER_STATUSES.includes(value);
}

export function canTransitionOrderStatus(from, to) {
  if (from === to || !ORDER_STATUS_TRANSITIONS[from]) return false;
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalOrderStatus(status) {
  return TERMINAL_STATUSES.has(status) || ORDER_STATUS_TRANSITIONS[status]?.length === 0;
}

export function isOrderCountedForRevenue(status) {
  return status !== 'Cancelled' && status !== 'Refunded';
}

export function isReachableFromPending(status) {
  if (status === 'Pending') return true;
  if (!ORDER_STATUS_TRANSITIONS[status]) return false;

  const visited = new Set(['Pending']);
  const queue = ['Pending'];

  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of ORDER_STATUS_TRANSITIONS[current]) {
      if (next === status) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}
