import { Kafka } from 'kafkajs';
import { pool } from './db.js';
import { kafkaMetrics } from './kafka-metrics.js';

const kafka = new Kafka({
  clientId: 'store-admin-outbox-relay',
  brokers: [process.env.KAFKA_BROKER],
});
const producer = kafka.producer({ idempotent: true });
const batchSize = 25;
const emptyPollDelayMs = 500;
const retentionCleanupIntervalMs = 60 * 60 * 1000;
const retryCeilingMs = 30_000;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function publishBatch() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT event_id, topic, partition_key, payload
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at, event_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    for (const event of rows) {
      await producer.send({
        topic: event.topic,
        messages: [{
          key: event.partition_key,
          value: JSON.stringify(event.payload),
        }],
      });
      kafkaMetrics.producer.total += 1;
      kafkaMetrics.producer.windowMessages += 1;
      await client.query(
        'UPDATE outbox_events SET published_at = NOW() WHERE event_id = $1 AND published_at IS NULL',
        [event.event_id]
      );
    }

    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupPublishedEvents() {
  let deleted;
  do {
    const result = await pool.query(`
      WITH expired AS (
        SELECT event_id
        FROM outbox_events
        WHERE published_at < NOW() - INTERVAL '7 days'
        ORDER BY published_at
        LIMIT 1000
      )
      DELETE FROM outbox_events events
      USING expired
      WHERE events.event_id = expired.event_id
    `);
    deleted = result.rowCount;
  } while (deleted === 1000);
}

export async function startOutboxRelay() {
  let retryDelayMs = 1000;
  let lastCleanupAt = 0;
  let connected = false;

  while (true) {
    try {
      if (!connected) {
        await producer.connect();
        connected = true;
        console.log('✅ Kafka outbox relay connected');
      }

      if (Date.now() - lastCleanupAt >= retentionCleanupIntervalMs) {
        await cleanupPublishedEvents();
        lastCleanupAt = Date.now();
      }

      const published = await publishBatch();
      retryDelayMs = 1000;
      if (published === 0) await delay(emptyPollDelayMs);
    } catch (error) {
      kafkaMetrics.producer.failed += 1;
      kafkaMetrics.producer.windowFailures += 1;
      connected = false;
      console.error(`⚠️  Outbox relay failed; retrying in ${retryDelayMs}ms: ${error.message}`);
      await delay(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, retryCeilingMs);
    }
  }
}
