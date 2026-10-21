1	import { Kafka } from 'kafkajs';
2	import { pool } from './db.js';
3	import { kafkaMetrics } from './kafka-metrics.js';
4
5	const kafka = new Kafka({
6	  clientId: 'store-admin-outbox-relay',
7	  brokers: [process.env.KAFKA_BROKER],
8	});
9	const producer = kafka.producer({ idempotent: true });
10	const batchSize = 50; // Tăng batch size để xử lý nhanh hơn
11	const emptyPollDelayMs = 500;
12	const retentionCleanupIntervalMs = 60 * 60 * 1000;
13	const retryCeilingMs = 30_000;
14
15	const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
16
17	async function publishBatch() {
18	  const client = await pool.connect();
19	  try {
20	    await client.query('BEGIN');
21
22	    // Lấy batch events và khóa record để tránh worker khác xử lý trùng
23	    const { rows } = await client.query(
24	      `SELECT event_id, topic, partition_key, payload
25	       FROM outbox_events
26	       WHERE published_at IS NULL
27	       ORDER BY created_at, event_id
28	       LIMIT $1
29	       FOR UPDATE SKIP LOCKED`,
30	      [batchSize]
31	    );
32
33	    if (rows.length === 0) {
34	      await client.query('COMMIT');
35	      return 0;
36	    }
37
38	    // Gom nhóm messages theo topic để gửi lên Kafka trong 1 round-trip/topic
39	    const messagesByTopic = rows.reduce((acc, event) => {
40	      if (!acc[event.topic]) acc[event.topic] = [];
41	      acc[event.topic].push({
42	        key: event.partition_key,
43	        value: JSON.stringify(event.payload),
44	      });
45	      return acc;
46	    }, {});
47
48	    // Bước này thực hiện ngoài DB transaction để không block DB connection quá lâu
49	    // Tuy nhiên trong code hiện tại, ta vẫn để trong BEGIN/COMMIT để đảm bảo tính nguyên tử
50	    // nếu broker lỗi thì ROLLBACK toàn bộ batch.
51	    for (const [topic, messages] of Object.entries(messagesByTopic)) {
52	      await producer.send({ topic, messages });
53	    }
54
55	    // Cập nhật trạng thái hàng loạt
56	    const eventIds = rows.map(r => r.event_id);
57	    await client.query(
58	      'UPDATE outbox_events SET published_at = NOW() WHERE event_id = ANY($1)',
59	      [eventIds]
60	    );
61
62	    kafkaMetrics.producer.total += rows.length;
63	    kafkaMetrics.producer.windowMessages += rows.length;
64
65	    await client.query('COMMIT');
66	    return rows.length;
67	  } catch (error) {
68	    await client.query('ROLLBACK');
69	    throw error;
70	  } finally {
71	    client.release();
72	  }
73	}
74
75	async function cleanupPublishedEvents() {
76	  let deleted;
77	  do {
78	    const result = await pool.query(`
79	      WITH expired AS (
80	        SELECT event_id
81	        FROM outbox_events
82	        WHERE published_at < NOW() - INTERVAL '7 days'
83	        ORDER BY published_at
84	        LIMIT 1000
85	      )
86	      DELETE FROM outbox_events events
87	      USING expired
88	      WHERE events.event_id = expired.event_id
89	    `);
90	    deleted = result.rowCount;
91	  } while (deleted === 1000);
92	}
93
94	export async function startOutboxRelay() {
95	  let retryDelayMs = 1000;
96	  let lastCleanupAt = 0;
97	  let connected = false;
98
99	  while (true) {
100	    try {
101	      if (!connected) {
102	        await producer.connect();
103	        connected = true;
104	        console.log('✅ Kafka outbox relay connected');
105	      }
106
107	      if (Date.now() - lastCleanupAt >= retentionCleanupIntervalMs) {
108	        await cleanupPublishedEvents();
109	        lastCleanupAt = Date.now();
110	      }
111
112	      const published = await publishBatch();
113	      retryDelayMs = 1000; // Reset delay khi thành công
114	      if (published === 0) await delay(emptyPollDelayMs);
115	    } catch (error) {
116	      kafkaMetrics.producer.failed += 1;
117	      kafkaMetrics.producer.windowFailures += 1;
118	      connected = false;
119	      console.error(`⚠️  Outbox relay failed; retrying in ${retryDelayMs}ms: ${error.message}`);
120	      await delay(retryDelayMs);
121	      retryDelayMs = Math.min(retryDelayMs * 2, retryCeilingMs);
122	    }
123	  }
124	}
