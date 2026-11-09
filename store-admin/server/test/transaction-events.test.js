import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import pg from 'pg';
import { enqueueTransactionEvent, persistTransactionEvent } from '../src/transaction-events.js';
import { publishOutboxMessages } from '../src/outbox-publisher.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
let client;

if (pool) {
  client = await pool.connect();
  await client.query(`
    CREATE TEMP TABLE outbox_events (
      event_id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      partition_key TEXT,
      payload JSONB NOT NULL
    );
    CREATE TEMP TABLE transactions (
      event_id UUID UNIQUE,
      order_id TEXT,
      payment_id TEXT,
      customer_id TEXT,
      user_id TEXT,
      session_id TEXT,
      event_type TEXT NOT NULL,
      transaction_id TEXT,
      benchmark_run_id TEXT,
      amount NUMERIC(15,2),
      currency TEXT,
      status TEXT,
      item_count INTEGER,
      page TEXT,
      action TEXT,
      producer_source TEXT,
      source TEXT,
      occurred_at TIMESTAMPTZ
    );
  `);
}

after(async () => {
  client?.release();
  await pool?.end();
});

test('outbox event is committed with the surrounding PostgreSQL transaction', { skip: !pool }, async () => {
  await client.query('BEGIN');
  const event = await enqueueTransactionEvent(client, {
    eventType: 'order_created', orderId: 8101, amount: 120000, status: 'Pending', source: 'test',
  });
  await client.query('COMMIT');
  const { rows } = await client.query('SELECT event_id, partition_key, payload FROM outbox_events');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, event.eventId);
  assert.equal(rows[0].partition_key, '8101');
  assert.equal(rows[0].payload.orderId, '8101');
  await client.query('TRUNCATE outbox_events');
});

test('outbox event is rolled back with the surrounding PostgreSQL transaction', { skip: !pool }, async () => {
  await client.query('BEGIN');
  await enqueueTransactionEvent(client, {
    eventType: 'order_cancelled', orderId: 8102, amount: 50000, status: 'Cancelled', source: 'test',
  });
  await client.query('ROLLBACK');
  const { rows } = await client.query('SELECT event_id FROM outbox_events');
  assert.equal(rows.length, 0);
});

test('consumer persists all business identifiers and ignores duplicate UUID events', { skip: !pool }, async () => {
  const eventId = randomUUID();
  const event = {
    eventId, eventType: 'payment_completed', orderId: '8103', paymentId: '9103',
    customerId: '7103', transactionId: 'BANK-REAL-123', amount: 99000, currency: 'VND',
    status: 'Paid', source: 'test', occurredAt: new Date().toISOString(),
  };
  await persistTransactionEvent(client, event, 'transaction-events', 'topic:0:1');
  await persistTransactionEvent(client, event, 'transaction-events', 'topic:0:2');
  const { rows } = await client.query(
    'SELECT event_id, order_id, payment_id, customer_id, transaction_id FROM transactions WHERE event_id=$1',
    [eventId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].order_id, '8103');
  assert.equal(rows[0].payment_id, '9103');
  assert.equal(rows[0].customer_id, '7103');
  assert.equal(rows[0].transaction_id, 'BANK-REAL-123');
});

test('consumer accepts legacy events missing optional identifiers and event id', { skip: !pool }, async () => {
  const eventId = await persistTransactionEvent(
    client,
    { eventType: 'legacy_payment', amount: '10', status: 'Paid' },
    'transaction-events',
    'transaction-events:0:legacy-offset',
  );
  const { rows } = await client.query(
    'SELECT event_id, order_id, payment_id, customer_id, transaction_id FROM transactions WHERE event_id=$1',
    [eventId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].order_id, null);
  assert.equal(rows[0].payment_id, null);
  assert.equal(rows[0].customer_id, null);
  assert.equal(rows[0].transaction_id, null);
});

test('partition key prefers orderId and falls back to transactionRef', async () => {
  const calls = [];
  const fakeClient = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1 }; } };
  const withOrder = await enqueueTransactionEvent(fakeClient, {
    eventType: 'payment_completed', orderId: 42, transactionRef: 'BANK-42',
    amount: 10, status: 'Paid', source: 'test',
  });
  const withoutOrder = await enqueueTransactionEvent(fakeClient, {
    eventType: 'payment_completed', transactionRef: 'BANK-43',
    amount: 10, status: 'Paid', source: 'test',
  });
  assert.equal(calls[0].params[2], '42');
  assert.equal(calls[1].params[2], 'BANK-43');
  assert.equal(withOrder.orderId, '42');
  assert.equal(withOrder.transactionId, undefined);
  assert.equal(withoutOrder.transactionId, undefined);
});

test('transactionId is not derived from orderId', async () => {
  const calls = [];
  const fakeClient = { query: async (_sql, params) => { calls.push(params); return { rowCount: 1 }; } };
  const event = await enqueueTransactionEvent(fakeClient, {
    eventType: 'order_created', orderId: 777, amount: 100, status: 'Pending', source: 'test',
  });
  const payload = JSON.parse(calls[0][3]);
  assert.equal(payload.orderId, '777');
  assert.equal(Object.hasOwn(payload, 'transactionId'), false);
  assert.equal(event.transactionId, undefined);
});

test('Kafka producer boundary can be exercised with a mock producer', async () => {
  const sent = [];
  const mockProducer = { send: async message => { sent.push(message); } };
  await publishOutboxMessages(mockProducer, {
    'transaction-events': [{ key: '42', value: '{"eventType":"order_created"}' }],
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].topic, 'transaction-events');
  assert.equal(sent[0].messages[0].key, '42');
});


test('payment method is included in transaction event payloads', async () => {
  const calls = [];
  const fakeClient = { query: async (_sql, params) => { calls.push(params); return { rowCount: 1 }; } };
  const cod = await enqueueTransactionEvent(fakeClient, {
    eventType: 'payment_completed', orderId: 8104, amount: 250000, status: 'Paid',
    source: 'orders_payment_api', paymentMethod: 'Cash',
  });
  const qr = await enqueueTransactionEvent(fakeClient, {
    eventType: 'payment_completed', orderId: 8105, amount: 350000, status: 'Paid',
    source: 'demo_qr', paymentMethod: 'BankTransfer', transactionId: 'DEMO-QR-8105',
  });
  assert.equal(cod.paymentMethod, 'Cash');
  assert.equal(qr.paymentMethod, 'BankTransfer');
  assert.equal(JSON.parse(calls[0][3]).paymentMethod, 'Cash');
  assert.equal(JSON.parse(calls[1][3]).paymentMethod, 'BankTransfer');
});
