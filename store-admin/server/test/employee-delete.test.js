import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createEmployeeRouter } from '../src/routes/employee.js';

const servers = new Set();

async function startApp({ employee = { employee_id: 7, account_id: 17, is_active: false }, failDelete = null } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const statement = sql.trim();
      queries.push({ sql: statement, params });
      if (statement.startsWith('SELECT employee_id, account_id, is_active')) {
        return { rows: employee ? [employee] : [] };
      }
      if (statement.startsWith('DELETE FROM employee')) {
        if (failDelete) throw Object.assign(new Error('foreign key violation'), { code: failDelete });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const database = { connect: async () => client, query: client.query.bind(client) };
  const app = express();
  app.use(express.json());
  app.use('/api/employees', createEmployeeRouter(database));
  const server = app.listen(0, '127.0.0.1');
  servers.add(server);
  await new Promise(resolve => server.once('listening', resolve));
  return {
    queries,
    request: async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/employees/7`, { method: 'DELETE' });
      return { status: response.status, body: await response.json() };
    },
  };
}

afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => server.close(resolve))));
  servers.clear();
});

test('refuses to delete an active employee', async () => {
  const app = await startApp({ employee: { employee_id: 7, account_id: 17, is_active: true } });
  const result = await app.request();
  assert.equal(result.status, 409);
  assert.match(result.body.message, /đang hoạt động/);
  assert.equal(app.queries.some(query => query.sql.startsWith('DELETE FROM employee')), false);
});

test('deletes an inactive employee and blocks the linked account', async () => {
  const app = await startApp();
  const result = await app.request();
  assert.equal(result.status, 200);
  assert.ok(app.queries.some(query => query.sql.includes("UPDATE account SET status = 'Blocked'")));
  assert.ok(app.queries.some(query => query.sql.startsWith('DELETE FROM employee')));
  assert.ok(app.queries.some(query => query.sql === 'COMMIT'));
});

test('returns not found when employee does not exist', async () => {
  const app = await startApp({ employee: null });
  const result = await app.request();
  assert.equal(result.status, 404);
  assert.equal(app.queries.some(query => query.sql.startsWith('DELETE FROM employee')), false);
});

test('returns a safe conflict when historical references prevent deletion', async () => {
  const app = await startApp({ failDelete: '23503' });
  const result = await app.request();
  assert.equal(result.status, 409);
  assert.match(result.body.message, /dữ liệu lịch sử/);
});
