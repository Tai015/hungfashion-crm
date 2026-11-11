import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOrderConfirmationEmail,
  enqueueOrderConfirmationEmail,
  escapeHtml,
  isValidEmail,
} from '../src/order-confirmation-email.js';

test('validates recipient email without accepting malformed values', () => {
  assert.equal(isValidEmail('customer@example.com'), true);
  assert.equal(isValidEmail(' customer+orders@example.com '), true);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('customer@localhost'), false);
  assert.equal(isValidEmail(null), false);
});

test('escapes untrusted content before inserting it into HTML email', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('builds a Vietnamese order confirmation with item details and safe HTML', () => {
  const email = buildOrderConfirmationEmail({
    order: {
      order_id: 123,
      ordered_at: '2026-11-11T10:00:00.000Z',
      customer_name: '<Khách hàng>',
      subtotal: 250000,
      discount_amt: 50000,
      total_amount: 200000,
      shipping_address: '<img src=x onerror=alert(1)>',
      payment_method: 'BankTransfer',
      payment_status: 'Pending',
    },
    details: [{
      product_name: '<Áo thun>',
      sku: 'HF-001',
      quantity: 2,
      unit_price: 125000,
      subtotal: 250000,
    }],
  });

  assert.match(email.subject, /#123/);
  assert.match(email.html, /&lt;Khách hàng&gt;/);
  assert.match(email.html, /&lt;Áo thun&gt;/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(email.html, /<img src=x onerror=/);
  assert.match(email.html, /200\.000/);
  assert.match(email.text, /Đơn hàng #123/);
  assert.match(email.text, /Áo thun/);
});

test('queues one confirmation per order with a stable recipient and conflict protection', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const queued = await enqueueOrderConfirmationEmail(client, {
    orderId: 42,
    customerId: 7,
    recipientEmail: ' Customer@Example.com ',
    payload: { subject: 'Test', html: '<p>Test</p>', text: 'Test' },
  });
  assert.equal(queued, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ON CONFLICT \(order_id\) DO NOTHING/);
  assert.deepEqual(calls[0].params, [42, 7, 'customer@example.com', JSON.stringify({ subject: 'Test', html: '<p>Test</p>', text: 'Test' })]);
});

test('skips customers without a valid email and does not touch the queue', async () => {
  let queryCount = 0;
  const client = { async query() { queryCount += 1; return { rows: [] }; } };
  assert.equal(await enqueueOrderConfirmationEmail(client, {
    orderId: 43, customerId: 8, recipientEmail: null,
  }), false);
  assert.equal(await enqueueOrderConfirmationEmail(client, {
    orderId: 44, customerId: 8, recipientEmail: 'invalid',
  }), false);
  assert.equal(queryCount, 0);
});
