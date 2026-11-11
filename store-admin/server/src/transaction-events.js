import { createHash, randomUUID } from 'node:crypto';
import { writeOutboxEvent } from './outbox-writer.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableUuid(value) {
  const hex = createHash('sha256').update(String(value)).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function nullableText(value) {
  return value == null || value === '' ? null : String(value);
}

export async function enqueueTransactionEvent(client, {
  eventType, orderId = null, amount, status, source, userId = null, customerId = null,
  paymentId = null, paymentMethod = null, transactionId = null, transactionRef = null, itemCount = null,
  previousStatus = null, reason = null,
}) {
  const eventId = randomUUID();
  const payload = {
    eventId,
    eventType,
    amount: Number(amount ?? 0),
    currency: 'VND',
    status,
    source,
    userId: nullableText(userId),
    customerId: nullableText(customerId),
    paymentId: nullableText(paymentId),
    paymentMethod: nullableText(paymentMethod),
    occurredAt: new Date().toISOString(),
  };

  if (orderId != null) payload.orderId = String(orderId);
  if (transactionId != null && String(transactionId).trim()) {
    payload.transactionId = String(transactionId).trim();
  }
  if (Number.isInteger(itemCount)) payload.itemCount = itemCount;
  if (previousStatus) payload.previousStatus = previousStatus;
  if (reason) payload.reason = reason;

  const partitionKey = orderId ?? transactionRef ?? null;
  await writeOutboxEvent(client, {
    eventId,
    topic: 'transaction-events',
    partitionKey: partitionKey == null ? null : String(partitionKey),
    payload,
  });
  return payload;
}

export async function persistTransactionEvent(client, event, source, fallbackEventId) {
  const payload = event && typeof event === 'object' && !Array.isArray(event) ? event : {};
  const candidateId = nullableText(payload.eventId);
  const eventId = candidateId && UUID_PATTERN.test(candidateId)
    ? candidateId
    : stableUuid(fallbackEventId ?? JSON.stringify(payload));

  const parsedAmount = payload.amount == null || payload.amount === '' ? NaN : Number(payload.amount);
  const parsedItemCount = payload.itemCount == null || payload.itemCount === ''
    ? NaN
    : Number(payload.itemCount);
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : null;
  const validOccurredAt = occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null;

  await client.query(
    `INSERT INTO transactions
       (event_id, order_id, payment_id, customer_id, user_id, session_id, event_type,
        transaction_id, benchmark_run_id, amount, currency, status, previous_status, item_count,
        page, action, producer_source, source, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,COALESCE($19,NOW()))
     ON CONFLICT (event_id) DO NOTHING`,
    [
      eventId,
      payload.orderId == null ? null : String(payload.orderId),
      payload.paymentId == null ? null : String(payload.paymentId),
      payload.customerId == null ? null : String(payload.customerId),
      nullableText(payload.userId),
      nullableText(payload.sessionId),
      nullableText(payload.eventType) || 'unknown',
      nullableText(payload.transactionId),
      nullableText(payload.benchmarkRunId),
      Number.isFinite(parsedAmount) ? parsedAmount : null,
      nullableText(payload.currency),
      nullableText(payload.status),
      nullableText(payload.previousStatus),
      Number.isInteger(parsedItemCount) ? parsedItemCount : null,
      nullableText(payload.page),
      nullableText(payload.event),
      nullableText(payload.source),
      source,
      validOccurredAt,
    ],
  );
  return eventId;
}
