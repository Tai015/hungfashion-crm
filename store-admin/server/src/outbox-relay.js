import { createKafkaClient } from './kafka.js';
import { pool } from './db.js';
import { kafkaMetrics } from './kafka-metrics.js';

const kafka = createKafkaClient('store-admin-outbox-relay');
const producer = kafka.producer({ idempotent: true });
const batchSize = 50; // Tăng batch size để xử lý nhanh hơn
const emptyPollDelayMs = 500;
const retentionCleanupIntervalMs = 60 * 60 * 1000;
const retryCeilingMs = 30_000;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function publishBatch() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lấy batch events và khóa record để tránh worker khác xử lý trùng
    const { rows } = await client.query(
      `SELECT event_id, topic, partition_key, payload
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at, event_id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    // Gom nhóm messages theo topic để gửi lên Kafka trong 1 round-trip/topic
    const messagesByTopic = rows.reduce((acc, event) => {
      if (!acc[event.topic]) acc[event.topic] = [];
      acc[event.topic].push({
        key: event.partition_key,
        value: JSON.stringify(event.payload),
      });
      return acc;
    }, {});

    // Bước này thực hiện ngoài DB transaction để không block DB connection quá lâu
    // Tuy nhiên trong code hiện tại, ta vẫn để trong BEGIN/COMMIT để đảm bảo tính nguyên tử
    // nếu broker lỗi thì ROLLBACK toàn bộ batch.
    for (const [topic, messages] of Object.entries(messagesByTopic)) {
      await producer.send({ topic, messages });
    }

    // Cập nhật trạng thái hàng loạt
    const eventIds = rows.map(r => r.event_id);
    await client.query(
      'UPDATE outbox_events SET published_at = NOW() WHERE event_id = ANY($1)',
      [eventIds]
    );

    kafkaMetrics.producer.total += rows.length;
    kafkaMetrics.producer.windowMessages += rows.length;

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
      retryDelayMs = 1000; // Reset delay khi thành công
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
