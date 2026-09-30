import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { Kafka } from 'kafkajs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverDir, '.env') });
dotenv.config({ path: path.join(serverDir, '.env.example') });

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT);
const databaseBrowserEnabled = process.env.ENABLE_DATABASE_BROWSER === 'true';
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

app.use(cors());
app.use(express.json());

function requireDatabaseBrowser(_req, res, next) {
  if (!databaseBrowserEnabled) {
    res.sendStatus(404);
    return;
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', databaseBrowserEnabled });
});

async function connectDatabase() {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  let lastError;

  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      await pool.query(schema);
      console.log('Connected to PostgreSQL');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
}

async function readRecentEvents(table) {
  const { rows } = await pool.query(
    `SELECT id, payload, source, created_at FROM ${table} ORDER BY created_at DESC LIMIT 10`
  );

  return rows.map(({ id, payload, source, created_at: createdAt }) => ({
    _id: id,
    ...payload,
    source,
    createdAt,
  }));
}

const kafka = new Kafka({
  clientId: 'store-admin-service',
  brokers: [process.env.KAFKA_BROKER],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'store-admin-group' });
const kafkaMetrics = {
  producer: { total: 0, failed: 0, windowMessages: 0, windowFailures: 0, windowStartedAt: Date.now() },
  consumer: { total: 0, failed: 0, windowMessages: 0, windowFailures: 0, windowStartedAt: Date.now() },
};

setInterval(() => {
  const now = Date.now();
  for (const [role, metrics] of Object.entries(kafkaMetrics)) {
    const intervalSeconds = (now - metrics.windowStartedAt) / 1000;
    console.log(JSON.stringify({
      type: 'kafka_pipeline_metrics',
      role,
      intervalSeconds: Number(intervalSeconds.toFixed(1)),
      messages: metrics.windowMessages,
      failures: metrics.windowFailures,
      totalMessages: metrics.total,
      totalFailures: metrics.failed,
      messagesPerSecond: Number((metrics.windowMessages / intervalSeconds).toFixed(2)),
    }));
    metrics.windowMessages = 0;
    metrics.windowFailures = 0;
    metrics.windowStartedAt = now;
  }
}, 5000).unref();

async function ensureKafkaTopics() {
  const admin = kafka.admin();
  await admin.connect();
  const topics = [{ topic: 'user-events' }, { topic: 'transaction-events' }];
  const existing = await admin.listTopics();

  for (const topic of topics) {
    if (!existing.includes(topic.topic)) {
      await admin.createTopics({ topics: [topic], waitForLeaders: true });
      console.log(`Created Kafka topic: ${topic.topic}`);
    }
  }
  await admin.disconnect();
}

async function sendEvent(topic, payload) {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
    kafkaMetrics.producer.total += 1;
    kafkaMetrics.producer.windowMessages += 1;
  } catch (error) {
    kafkaMetrics.producer.failed += 1;
    kafkaMetrics.producer.windowFailures += 1;
    console.error('Kafka produce failed:', error.message);
    throw error;
  }
}

async function consumeEvents() {
  await consumer.connect();
  await consumer.subscribe({ topics: ['user-events', 'transaction-events'], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const table = topic === 'transaction-events' ? 'transactions' : 'user_events';
        await pool.query(
          `INSERT INTO ${table} (payload, source) VALUES ($1::jsonb, $2)`,
          [JSON.stringify(payload), topic]
        );
        kafkaMetrics.consumer.total += 1;
        kafkaMetrics.consumer.windowMessages += 1;
      } catch (error) {
        kafkaMetrics.consumer.failed += 1;
        kafkaMetrics.consumer.windowFailures += 1;
        throw error;
      }
    },
  });
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const summary = {
      revenue: 128400000,
      orders: 1452,
      visitors: 12400,
      conversionRate: 4.8,
    };

    const revenueTrend = [
      { day: 'Mon', revenue: 1500000 },
      { day: 'Tue', revenue: 2300000 },
      { day: 'Wed', revenue: 2200000 },
      { day: 'Thu', revenue: 3100000 },
      { day: 'Fri', revenue: 4800000 },
      { day: 'Sat', revenue: 5200000 },
      { day: 'Sun', revenue: 6100000 },
    ];

    const topProducts = [
      { name: 'Áo thun', value: 280 },
      { name: 'Giày thể thao', value: 220 },
      { name: 'Túi xách', value: 160 },
      { name: 'Đồng hồ', value: 110 },
    ];

    const recentOrders = [
      { id: '#1001', customer: 'Nguyễn Văn A', total: 580000, status: 'Paid' },
      { id: '#1002', customer: 'Trần Thị B', total: 320000, status: 'Shipping' },
      { id: '#1003', customer: 'Lê Văn C', total: 710000, status: 'Refund' },
    ];

    const sampleUserActivity = [
      { name: 'View product', value: 720 },
      { name: 'Add to cart', value: 410 },
      { name: 'Checkout', value: 190 },
    ];

    const [activityResult, userEvents, transactions] = await Promise.all([
      pool.query(`
        SELECT COALESCE(payload->>'eventType', payload->>'event', 'other') AS name,
               COUNT(*)::int AS value
        FROM user_events
        GROUP BY 1
        ORDER BY value DESC
        LIMIT 10
      `),
      readRecentEvents('user_events'),
      readRecentEvents('transactions'),
    ]);
    const userActivity = activityResult.rows.length ? activityResult.rows : sampleUserActivity;

    res.json({
      summary,
      revenueTrend,
      topProducts,
      recentOrders,
      userActivity,
      userEvents,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

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
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    if (matchingTables.length === 0) {
      res.status(404).json({ message: 'Không tìm thấy bảng trong schema public.' });
      return;
    }

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/events/user', async (req, res) => {
  try {
    await sendEvent('user-events', req.body);
    res.status(202).json({ success: true, message: 'User event queued to Kafka' });
  } catch (error) {
    res.status(503).json({ message: `Kafka publish failed: ${error.message}` });
  }
});

app.post('/api/events/transaction', async (req, res) => {
  try {
    await sendEvent('transaction-events', req.body);
    res.status(202).json({ success: true, message: 'Transaction queued to Kafka' });
  } catch (error) {
    res.status(503).json({ message: `Kafka publish failed: ${error.message}` });
  }
});

async function startServer() {
  await connectDatabase();
  await ensureKafkaTopics();
  await producer.connect();
  await consumeEvents();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
