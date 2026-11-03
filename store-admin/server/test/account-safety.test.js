import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createAccountRouter } from '../src/routes/account.js';

const servers = new Set();

async function startTestApp({ activeAdmins = [{ account_id: 1 }], target, role = { role_id: 2, role_name: 'QL_KHO' }, hasRelatedData = false } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: sql.trim(), params });
      if (sql.includes('WHERE a.account_id = $1 FOR UPDATE OF a')) return { rows: target ? [target] : [] };
      if (sql.includes("role_name = 'ADMIN' AND a.status = 'Active'")) return { rows: activeAdmins };
      if (sql.includes('SELECT role_id, role_name FROM role')) return { rows: role ? [role] : [] };
      if (sql.includes('AS has_related_data')) return { rows: [{ has_related_data: hasRelatedData }] };
      if (sql.includes('UPDATE account SET status')) return { rows: [{ account_id: target?.account_id, username: target?.username, status: params[0] }] };
      if (sql.includes('UPDATE account SET role_id')) return { rows: [{ account_id: target?.account_id, username: target?.username, role_id: params[0] }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const database = { connect: async () => client, query: client.query };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { account_id: 99 }; next(); });
  app.use('/api/accounts', createAccountRouter(database));
  const server = app.listen(0, '127.0.0.1');
  servers.add(server);
  await new Promise(resolve => server.once('listening', resolve));
  return {
    queries,
    request: async (path, method, body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
  };
}

afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => server.close(resolve))));
  servers.clear();
});

test('rejects locking the currently authenticated account', async () => {
  const app = await startTestApp({ target: { account_id: 99, username: 'self', status: 'Active', role_id: 1, role_name: 'ADMIN' } });
  const result = await app.request('/api/accounts/99/status', 'PATCH', { status: 'Blocked' });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /chính tài khoản đang đăng nhập/);
  assert.equal(app.queries.some(query => query.sql.includes('UPDATE account SET status')), false);
});

test('locks active administrator rows before refusing to demote the last one', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 7 }],
    target: { account_id: 7, username: 'admin', status: 'Active', role_id: 1, role_name: 'ADMIN' },
  });
  const result = await app.request('/api/accounts/7/role', 'PATCH', { role_id: 2 });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /ít nhất một quản trị viên đang hoạt động/);
  assert.ok(app.queries.some(query => query.sql.includes("role_name = 'ADMIN' AND a.status = 'Active'") && query.sql.includes('FOR UPDATE OF a')));
  assert.equal(app.queries.some(query => query.sql.includes('UPDATE account SET role_id')), false);
});

test('refuses locking the only active administrator', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 7 }],
    target: { account_id: 7, username: 'admin', status: 'Active', role_id: 1, role_name: 'ADMIN' },
  });
  const result = await app.request('/api/accounts/7/status', 'PATCH', { status: 'Blocked' });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /ít nhất một quản trị viên đang hoạt động/);
  assert.equal(app.queries.some(query => query.sql.includes('UPDATE account SET status')), false);
});

test('rejects changing the current account role', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 99 }],
    target: { account_id: 99, username: 'self', status: 'Active', role_id: 1, role_name: 'ADMIN' },
  });
  const result = await app.request('/api/accounts/99/role', 'PATCH', { role_id: 2 });
  assert.equal(result.status, 409);
  assert.match(result.body.message, /chính tài khoản đang đăng nhập/);
  assert.equal(app.queries.some(query => query.sql.includes('UPDATE account SET role_id')), false);
});

test('rejects deleting the currently authenticated account', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 99 }],
    target: { account_id: 99, username: 'self', status: 'Active', role_id: 1, role_name: 'ADMIN' },
  });
  const result = await app.request('/api/accounts/99', 'DELETE');
  assert.equal(result.status, 409);
  assert.match(result.body.message, /Không thể xóa tài khoản đang đăng nhập/);
  assert.equal(app.queries.some(query => query.sql.startsWith('DELETE FROM account')), false);
});

test('rejects a role id that does not exist', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 1 }],
    target: { account_id: 4, username: 'staff', status: 'Active', role_id: 2, role_name: 'QL_KHO' },
    role: null,
  });
  const result = await app.request('/api/accounts/4/role', 'PATCH', { role_id: 999 });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /không tồn tại/);
});

test('refuses deletion when the account has a linked customer or employee/chat record', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 1 }],
    target: { account_id: 4, username: 'customer', status: 'Active', role_id: 6, role_name: 'KHACH_HANG' },
    hasRelatedData: true,
  });
  const result = await app.request('/api/accounts/4', 'DELETE');
  assert.equal(result.status, 409);
  assert.match(result.body.message, /hãy khóa thay vì xóa/);
  assert.equal(app.queries.some(query => query.sql.startsWith('DELETE FROM account')), false);
});

test('allows deletion only after the related-data check passes in the transaction', async () => {
  const app = await startTestApp({
    activeAdmins: [{ account_id: 1 }],
    target: { account_id: 4, username: 'unused', status: 'Active', role_id: 2, role_name: 'QL_KHO' },
  });
  const result = await app.request('/api/accounts/4', 'DELETE');
  assert.equal(result.status, 200);
  const checkIndex = app.queries.findIndex(query => query.sql.includes('AS has_related_data'));
  const deleteIndex = app.queries.findIndex(query => query.sql.startsWith('DELETE FROM account'));
  assert.ok(checkIndex > app.queries.findIndex(query => query.sql === 'BEGIN'));
  assert.ok(deleteIndex > checkIndex);
  assert.ok(app.queries.findIndex(query => query.sql === 'COMMIT') > deleteIndex);
});
