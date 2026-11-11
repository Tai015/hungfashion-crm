import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createCustomerInteractionsRouter } from '../src/routes/customer-interactions.js';

const servers = new Set();

async function startApp({ rows = [] } = {}) {
  const queries = [];
  const database = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };
  const app = express();
  app.use('/api/customers/:id/interactions', createCustomerInteractionsRouter(database));
  const server = app.listen(0, '127.0.0.1');
  servers.add(server);
  await new Promise(resolve => server.once('listening', resolve));
  return {
    queries,
    request: async path => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      return { status: response.status, body: await response.json() };
    },
  };
}

afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => server.close(resolve))));
  servers.clear();
});

test('rejects invalid customer ids and page sizes without querying the database', async () => {
  const app = await startApp();
  assert.equal((await app.request('/api/customers/nope/interactions')).status, 400);
  assert.equal((await app.request('/api/customers/4/interactions?limit=1000')).status, 400);
  assert.equal(app.queries.length, 0);
});

test('returns a bounded first page and a cursor for older records', async () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    interaction_id: `feedback:${index + 1}`,
    customer_id: 12,
    interaction_type: 'feedback',
    title: 'Gửi phản hồi',
    summary: 'Loại: Service',
    occurred_at: new Date(Date.UTC(2026, 10, 10, 10 - index)).toISOString(),
  }));
  const app = await startApp({ rows });
  const result = await app.request('/api/customers/12/interactions?limit=2');

  assert.equal(result.status, 200);
  assert.equal(result.body.data.length, 2);
  assert.equal(result.body.hasMore, true);
  assert.equal(result.body.range, 'last-12-months');
  assert.equal(typeof result.body.nextCursor, 'string');
  assert.equal(typeof result.body.olderCursor, 'string');
  assert.match(app.queries[0].sql, /customer_interaction_timeline/);
  assert.match(app.queries[0].sql, /c\.deleted_at IS NULL/);
  assert.match(app.queries[0].sql, /occurred_at DESC, interaction_id DESC/);
  assert.match(app.queries[0].sql, /INTERVAL '12 months'/);
  assert.deepEqual(app.queries[0].params, [12, 3]);
});

test('uses tuple cursor pagination and can continue into older history', async () => {
  const app = await startApp();
  const cursor = Buffer.from(JSON.stringify({
    occurredAt: '2026-11-10T10:00:00.000Z',
    interactionId: 'feedback:42',
    includeOlder: false,
    purpose: 'older',
  })).toString('base64url');

  const result = await app.request(`/api/customers/12/interactions?all=1&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.range, 'all');
  assert.match(app.queries[0].sql, /\(occurred_at, interaction_id\) < \(\$2::timestamptz, \$3::text\)/);
  assert.doesNotMatch(app.queries[0].sql, /12 months/);
  assert.deepEqual(app.queries[0].params, [12, '2026-11-10T10:00:00.000Z', 'feedback:42', 21]);
});

test('rejects a next-page cursor reused with a different history range', async () => {
  const app = await startApp();
  const cursor = Buffer.from(JSON.stringify({
    occurredAt: '2026-11-10T10:00:00.000Z',
    interactionId: 'feedback:42',
    includeOlder: false,
    purpose: 'next',
  })).toString('base64url');

  const result = await app.request(`/api/customers/12/interactions?all=1&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(result.status, 400);
  assert.equal(app.queries.length, 0);
});

test('accepts the explicit older-history cursor only in all-history mode', async () => {
  const app = await startApp();
  const cursor = Buffer.from(JSON.stringify({
    occurredAt: '2026-11-10T10:00:00.000Z',
    interactionId: 'feedback:42',
    includeOlder: false,
    purpose: 'older',
  })).toString('base64url');

  const result = await app.request(`/api/customers/12/interactions?all=1&cursor=${encodeURIComponent(cursor)}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.range, 'all');
  assert.equal(app.queries.length, 1);
});

test('rejects an older-history cursor when all-history mode is not enabled', async () => {
  const app = await startApp();
  const cursor = Buffer.from(JSON.stringify({
    occurredAt: '2026-11-10T10:00:00.000Z',
    interactionId: 'feedback:42',
    includeOlder: false,
    purpose: 'older',
  })).toString('base64url');

  const result = await app.request(`/api/customers/12/interactions?cursor=${encodeURIComponent(cursor)}`);
  assert.equal(result.status, 400);
  assert.equal(app.queries.length, 0);
});


test('rejects malformed or tampered cursors', async () => {
  const app = await startApp();
  const result = await app.request('/api/customers/12/interactions?cursor=not-a-cursor');
  assert.equal(result.status, 400);
  assert.equal(app.queries.length, 0);
});

test('does not expose a message body field in the timeline response', async () => {
  const app = await startApp({ rows: [{
    interaction_id: 'conversation:1',
    customer_id: 12,
    interaction_type: 'support_chat',
    title: 'Hoạt động hỗ trợ khách hàng',
    summary: 'Trạng thái: Open · 2 tin nhắn (không hiển thị nội dung)',
    occurred_at: '2026-11-10T10:00:00.000Z',
  }] });
  const result = await app.request('/api/customers/12/interactions');
  assert.equal(result.status, 200);
  assert.equal(Object.hasOwn(result.body.data[0], 'content'), false);
});
