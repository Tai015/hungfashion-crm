import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Kafka } from 'kafkajs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Cấu hình môi trường ───────────────────────────────────
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverDir, '.env') });

// ── Import pool & routes ──────────────────────────────────
import { pool } from './db.js';
import { runMigrations } from './migrations.js';
import { kafkaMetrics } from './kafka-metrics.js';
import { startOutboxRelay } from './outbox-relay.js';
import accountRouter   from './routes/account.js';
import customerRouter  from './routes/customer.js';
import productRouter   from './routes/product.js';
import inventoryRouter from './routes/inventory.js';
import orderRouter     from './routes/order.js';
import promotionRouter from './routes/promotion.js';
import feedbackRouter  from './routes/feedback.js';
import surveyRouter    from './routes/survey.js';
import reportRouter    from './routes/report.js';

const app  = express();
const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const databaseBrowserEnabled = process.env.ENABLE_DATABASE_BROWSER === 'true';
const eventRateLimitWindowMs = Number(process.env.EVENT_RATE_LIMIT_WINDOW_MS || 1000);
const eventRateLimitMax = Number(process.env.EVENT_RATE_LIMIT_MAX || 1200);
const outboxMaxBacklog = Number(process.env.OUTBOX_MAX_BACKLOG || 10000);
const eventRateLimits = new Map();

app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', databaseBrowserEnabled });
});

// ── Hung Fashion API Routes ───────────────────────────────
app.use('/api/accounts',   accountRouter);
app.use('/api/customers',  customerRouter);
app.use('/api/products',   productRouter);
app.use('/api/inventory',  inventoryRouter);
app.use('/api/orders',     orderRouter);
app.use('/api/promotions', promotionRouter);
app.use('/api/feedbacks',  feedbackRouter);
app.use('/api/surveys',    surveyRouter);
app.use('/api/reports',    reportRouter);

// ── Database Browser (tuỳ chọn, bật qua .env) ────────────
function requireDatabaseBrowser(_req, res, next) {
  if (!databaseBrowserEnabled) { res.sendStatus(404); return; }
  next();
}

app.get('/api/database/tables', requireDatabaseBrowser, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tables.table_name AS name, COUNT(columns.column_name)::int AS "columnCount"
      FROM information_schema.tables AS tables
      LEFT JOIN information_schema.columns AS columns
        ON columns.table_schema = tables.table_schema
        AND columns.table_name = tables.table_name
      WHERE tables.table_schema = 'public'
        AND tables.table_type = 'BASE TABLE'
      GROUP BY tables.table_name
      ORDER BY tables.table_name
    `);
    res.json({ tables: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/database/tables/:tableName/rows', requireDatabaseBrowser, async (req, res) => {
  try {
    const { tableName } = req.params;
    const { rows: matchingTables } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1`,
      [tableName]
    );
    if (!matchingTables.length) {
      return res.status(404).json({ message: 'Không tìm thấy bảng trong schema public.' });
    }

    const parsedLimit  = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const limit  = Number.isInteger(parsedLimit)  ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const offset = Number.isInteger(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
    const quotedTableName = `"${matchingTables[0].table_name.replace(/"/g, '""')}"`;

    const [columnResult, countResult, rowResult] = await Promise.all([
      pool.query(
        `SELECT column_name AS name, data_type AS type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      ),
      pool.query(`SELECT COUNT(*)::bigint AS total FROM public.${quotedTableName}`),
      pool.query(`SELECT * FROM public.${quotedTableName} LIMIT $1 OFFSET $2`, [limit, offset]),
    ]);

    res.json({
      table: tableName,
      columns: columnResult.rows,
      rows: rowResult.rows,
      total: Number(countResult.rows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Kafka Setup ───────────────────────────────────────────
const kafka    = new Kafka({ clientId: 'store-admin-service', brokers: [process.env.KAFKA_BROKER] });
const consumer = kafka.consumer({ groupId: 'store-admin-group' });

// Flag theo dõi Kafka đã sẵn sàng chưa
let kafkaReady = false;

setInterval(() => {
  const now = Date.now();
  for (const [role, metrics] of Object.entries(kafkaMetrics)) {
    const intervalSeconds = (now - metrics.windowStartedAt) / 1000;
    console.log(JSON.stringify({
      type: 'kafka_pipeline_metrics', role,
      intervalSeconds: Number(intervalSeconds.toFixed(1)),
      messages: metrics.windowMessages, failures: metrics.windowFailures,
      totalMessages: metrics.total, totalFailures: metrics.failed,
      messagesPerSecond: Number((metrics.windowMessages / intervalSeconds).toFixed(2)),
    }));
    metrics.windowMessages = 0;
    metrics.windowFailures = 0;
    metrics.windowStartedAt = now;
  }
}, 5000).unref();

setInterval(() => {
  const cutoff = Date.now() - eventRateLimitWindowMs * 2;
  for (const [key, state] of eventRateLimits) {
    if (state.startedAt < cutoff) eventRateLimits.delete(key);
  }
}, eventRateLimitWindowMs * 2).unref();

function eventRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let state = eventRateLimits.get(key);
  if (!state || now - state.startedAt >= eventRateLimitWindowMs) {
    state = { startedAt: now, count: 0 };
    eventRateLimits.set(key, state);
  }

  if (state.count >= eventRateLimitMax) {
    const retryAfter = Math.max(1, Math.ceil((state.startedAt + eventRateLimitWindowMs - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ message: 'Event rate limit exceeded. Retry shortly.' });
  }

  state.count += 1;
  next();
}

app.use('/api/events', eventRateLimit);

async function ensureKafkaTopics() {
  const admin = kafka.admin();
  await admin.connect();
  const topics   = [{ topic: 'user-events' }, { topic: 'transaction-events' }];
  const existing = await admin.listTopics();
  for (const topic of topics) {
    if (!existing.includes(topic.topic)) {
      await admin.createTopics({ topics: [topic], waitForLeaders: true });
      console.log(`Created Kafka topic: ${topic.topic}`);
    }
  }
  await admin.disconnect();
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function eventTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function persistEvent(topic, payload, source, fallbackEventId) {
  const event = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const occurredAt = eventTime(event.occurredAt);
  const eventId = textValue(event.eventId) || fallbackEventId || null;
  const userId = textValue(event.userId);

  if (topic === 'transaction-events') {
    const parsedAmount = event.amount == null || event.amount === '' ? NaN : Number(event.amount);
    const parsedItemCount = event.itemCount == null || event.itemCount === ''
      ? NaN
      : Number(event.itemCount);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : null;
    const itemCount = Number.isInteger(parsedItemCount) ? parsedItemCount : null;
    await pool.query(
      `INSERT INTO transactions
         (event_id, user_id, session_id, event_type, transaction_id, benchmark_run_id,
          amount, currency, status, item_count, page, action, producer_source,
          source, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15,NOW()))
       ON CONFLICT (event_id) DO NOTHING`,
      [
        eventId, userId, textValue(event.sessionId),
        textValue(event.eventType) || 'unknown', textValue(event.transactionId),
        textValue(event.benchmarkRunId), amount, textValue(event.currency),
        textValue(event.status), itemCount, textValue(event.page),
        textValue(event.event), textValue(event.source), source, occurredAt,
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO user_events
       (event_id, user_id, session_id, event_type, page, section, action, source_check,
        source, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,NOW()))
     ON CONFLICT (event_id) DO NOTHING`,
    [
      eventId, userId, textValue(event.sessionId),
      textValue(event.eventType) || 'unknown', textValue(event.page),
      textValue(event.section), textValue(event.event), textValue(event.sourceCheck),
      source, occurredAt,
    ]
  );
}

async function consumeEvents() {
  await consumer.connect();
  await consumer.subscribe({ topics: ['user-events', 'transaction-events'], fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await persistEvent(topic, payload, topic, `${topic}:${partition}:${message.offset}`);
        kafkaMetrics.consumer.total += 1;
        kafkaMetrics.consumer.windowMessages += 1;
      } catch (err) {
        kafkaMetrics.consumer.failed += 1;
        kafkaMetrics.consumer.windowFailures += 1;
        throw err;
      }
    },
  });
}

function validateEvent(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Event body must be a JSON object.' });
  }
  if (!textValue(req.body.eventId)?.trim()) {
    return res.status(400).json({ message: 'eventId is required for idempotent delivery.' });
  }
  next();
}

async function enqueueEvent(topic, req, res) {
  const payload = req.body;
  const eventId = textValue(payload.eventId);
  const { rows: [existing] } = await pool.query(
    'SELECT 1 FROM outbox_events WHERE event_id = $1',
    [eventId]
  );
  if (existing) {
    return res.status(202).json({ success: true, queued: true, duplicate: true, eventId });
  }

  const { rows: [backlog] } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM outbox_events WHERE published_at IS NULL'
  );
  if (backlog.count >= outboxMaxBacklog) {
    return res.status(503).json({ message: 'Event queue is full. Retry later.' });
  }

  const partitionKey = textValue(payload.userId);
  const { rowCount } = await pool.query(
    `INSERT INTO outbox_events (event_id, topic, partition_key, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, topic, partitionKey, JSON.stringify(payload)]
  );
  return res.status(202).json({
    success: true,
    queued: true,
    duplicate: rowCount === 0,
    eventId,
  });
}

app.post('/api/events/user', validateEvent, async (req, res) => {
  try {
    await enqueueEvent('user-events', req, res);
  } catch (err) {
    res.status(500).json({ message: `Could not queue event: ${err.message}` });
  }
});

app.post('/api/events/transaction', validateEvent, async (req, res) => {
  try {
    await enqueueEvent('transaction-events', req, res);
  } catch (err) {
    res.status(500).json({ message: `Could not queue event: ${err.message}` });
  }
});

app.get('/api/events/outbox-status', async (_req, res) => {
  try {
    const { rows: [status] } = await pool.query(`
      SELECT COUNT(*)::int AS pending_count,
             EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS oldest_pending_age_seconds
      FROM outbox_events
      WHERE published_at IS NULL
    `);
    res.json({
      pendingCount: status.pending_count,
      oldestPendingAgeSeconds: status.oldest_pending_age_seconds,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/events/status — kiểm tra Kafka có sẵn sàng không
app.get('/api/events/status', (_req, res) => {
  res.json({ kafkaReady, message: kafkaReady ? 'Kafka connected' : 'Kafka connecting...' });
});

// ── Khởi động server ──────────────────────────────────────
async function waitForDatabase() {
  let lastError;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 14) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('PostgreSQL did not become ready after 15 attempts.', { cause: lastError });
}

async function connectDatabase() {
  await waitForDatabase();
  await runMigrations();
  console.log('✅ Connected to PostgreSQL');
}

async function startServer() {
  // 1. Kết nối DB trước — bắt buộc, app không chạy được nếu thiếu
  await connectDatabase();

  // 2. Khởi động Express ngay — không chờ Kafka
  app.listen(PORT, () => {
    console.log(`🚀 Hung Fashion API running at http://localhost:${PORT}`);
    console.log(`   Routes: /api/accounts | /api/customers | /api/products`);
    console.log(`           /api/inventory | /api/orders | /api/promotions`);
    console.log(`           /api/feedbacks | /api/surveys | /api/reports`);
  });

  startOutboxRelay().catch((err) => {
    console.error('Outbox relay stopped unexpectedly:', err);
  });

  // 3. Kafka kết nối nền — không block web server
  connectKafka();
}

// Kafka chạy tách biệt, tự retry nếu lỗi
async function connectKafka() {
  const MAX_RETRIES = 10;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ensureKafkaTopics();
      await consumeEvents();
      kafkaReady = true;   // ← bật flag: từ giờ dùng Kafka thay vì DB fallback
      console.log('✅ Kafka connected');
      return;
    } catch (err) {
      console.warn(`⚠️  Kafka attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 3000 * attempt)); // backoff tăng dần
      }
    }
  }
  console.error('❌ Kafka unavailable — events will be written to DB fallback; other APIs work normally');
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
