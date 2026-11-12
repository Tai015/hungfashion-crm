import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createAccountRouter } from '../src/routes/account.js';

const servers = new Set();

async function startTestApp({
  activeAdmins = [{ account_id: 1 }],
  target,
  role = { role_id: 2, role_name: 'QL_KHO' },
  hasRelatedData = false,
  adminGuardLocked = false,
  queryError,
  connectionError,
  customerProfile = null,
  createdAccount = { account_id: 12, role_id: role?.role_id, username: 'new-user', email: 'new@example.com', phone: null, status: 'Active' },
} = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql: sql.trim(), params });
      if (queryError?.(sql)) throw queryError(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ acquired: !adminGuardLocked }] };
      if (sql.includes('WHERE a.account_id = $1 FOR UPDATE OF a')) return { rows: target ? [target] : [] };
      if (sql.includes("role_name = 'ADMIN' AND a.status = 'Active'")) return { rows: activeAdmins };
      if (sql.includes('SELECT role_id, role_name FROM role')) return { rows: role ? [role] : [] };
      if (sql.includes('AS has_related_data')) return { rows: [{ has_related_data: hasRelatedData }] };
      if (sql.includes('AS is_online')) return { rows: [{ is_online: false }] };
      if (sql.includes('FROM customer') && sql.includes('LOWER(BTRIM(email)) = $1')) {
        return { rows: customerProfile ? [customerProfile] : [] };
      }
      if (sql.includes('UPDATE account SET status')) return { rows: [{ account_id: target?.account_id, username: target?.username, status: params[0] }] };
      if (sql.includes('UPDATE account SET role_id')) return { rows: [{ account_id: target?.account_id, username: target?.username, role_id: params[0] }] };
      if (sql.includes('INSERT INTO account (role_id, username')) return { rows: [createdAccount] };
      if (sql.includes('UPDATE customer SET account_id = $1')) return { rows: [{ customer_id: params[1] }] };
      if (sql.includes('INSERT INTO customer (account_id, full_name, email, phone)')) return { rows: [{ customer_id: 31 }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const database = {
    connect: async () => {
      if (connectionError) throw connectionError;
      return client;
    },
    query: client.query,
  };
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

test('returns promptly when another account operation holds the admin guard lock', async () => {
  const app = await startTestApp({ adminGuardLocked: true });
  const result = await app.request('/api/accounts/4/role', 'PATCH', { role_id: 3 });

  assert.equal(result.status, 409);
  assert.match(result.body.message, /Đang có thao tác quản trị tài khoản khác/);
  assert.equal(app.queries.some(query => query.sql.includes('FOR UPDATE OF a')), false);
  assert.equal(app.queries.at(-1).sql, 'ROLLBACK');
});

test('bounds role-change queries and reports a database statement timeout', async () => {
  const timeoutError = Object.assign(new Error('statement timeout'), { code: '57014' });
  const app = await startTestApp({
    target: { account_id: 4, username: 'staff', status: 'Active', role_id: 2, role_name: 'QL_KHO' },
    role: { role_id: 3, role_name: 'QL_NHAN_SU' },
    queryError: sql => sql.includes('AS is_online') ? timeoutError : null,
  });
  const result = await app.request('/api/accounts/4/role', 'PATCH', { role_id: 3 });

  assert.equal(result.status, 503);
  assert.match(result.body.message, /Cơ sở dữ liệu đang xử lý quá lâu/);
  assert.ok(app.queries.some(query => query.sql.includes("SET LOCAL statement_timeout = '10s'")));
});

test('returns an error when a role change cannot acquire a database connection', async () => {
  const app = await startTestApp({
    connectionError: new Error('connection acquisition timed out'),
  });
  const result = await app.request('/api/accounts/4/role', 'PATCH', { role_id: 3 });

  assert.equal(result.status, 500);
  assert.match(result.body.message, /Không thể cập nhật vai trò/);
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

test('creates a nameless customer profile when no profile matches the account email', async () => {
  const app = await startTestApp({ role: { role_id: 6, role_name: 'KHACH_HANG' } });
  const result = await app.request('/api/accounts', 'POST', {
    role_id: 6,
    username: 'new-user',
    password: 'secure-password',
    email: ' NEW@example.com ',
  });

  assert.equal(result.status, 201);
  const customerLookup = app.queries.find(query => query.sql.includes('FROM customer') && query.sql.includes('LOWER(BTRIM(email)) = $1'));
  const customerInsert = app.queries.find(query => query.sql.includes('INSERT INTO customer (account_id, full_name, email, phone)'));
  assert.deepEqual(customerLookup.params, ['new@example.com']);
  assert.match(customerInsert.sql, /VALUES \(\$1,NULL,\$2,\$3\)/);
  assert.deepEqual(customerInsert.params, [12, 'new@example.com', null]);
  assert.ok(app.queries.findIndex(query => query.sql.includes('INSERT INTO customer')) < app.queries.findIndex(query => query.sql === 'COMMIT'));
});

test('links an existing unlinked customer profile by normalized email', async () => {
  const app = await startTestApp({
    role: { role_id: 6, role_name: 'KHACH_HANG' },
    customerProfile: { customer_id: 31, account_id: null },
  });
  const result = await app.request('/api/accounts', 'POST', {
    role_id: 6,
    username: 'new-user',
    password: 'secure-password',
    email: ' Customer@Example.com ',
  });

  assert.equal(result.status, 201);
  const profileLink = app.queries.find(query => query.sql.includes('UPDATE customer SET account_id = $1'));
  assert.deepEqual(profileLink.params, [12, 31]);
  assert.equal(app.queries.some(query => query.sql.includes('INSERT INTO customer')), false);
});

test('does not replace another account linked to the matching customer profile', async () => {
  const app = await startTestApp({
    role: { role_id: 6, role_name: 'KHACH_HANG' },
    customerProfile: { customer_id: 31, account_id: 88 },
  });
  const result = await app.request('/api/accounts', 'POST', {
    role_id: 6,
    username: 'new-user',
    password: 'secure-password',
    email: 'customer@example.com',
  });

  assert.equal(result.status, 409);
  assert.match(result.body.message, /đã liên kết với một tài khoản khách hàng khác/);
  assert.equal(app.queries.some(query => query.sql.includes('INSERT INTO account (role_id, username')), false);
  assert.equal(app.queries.at(-1).sql, 'ROLLBACK');
});

test('looks up customer profiles by normalized email and reports existing account links', async () => {
  const app = await startTestApp({
    customerProfile: { customer_id: 31, account_id: 88 },
  });
  const result = await app.request(
    `/api/accounts/customer-profile?email=${encodeURIComponent(' Customer@Example.com ')}`,
    'GET',
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { exists: true, linked: true });
  const lookup = app.queries.find(query => query.sql.includes('FROM customer') && query.sql.includes('LOWER(BTRIM(email)) = $1'));
  assert.deepEqual(lookup.params, ['customer@example.com']);
});

test('rejects invalid customer profile lookup emails', async () => {
  const app = await startTestApp();
  const result = await app.request('/api/accounts/customer-profile?email=invalid', 'GET');

  assert.equal(result.status, 400);
  assert.equal(app.queries.length, 0);
});

test('requires a valid email for an admin-created customer account', async () => {
  const app = await startTestApp({ role: { role_id: 6, role_name: 'KHACH_HANG' } });
  const result = await app.request('/api/accounts', 'POST', {
    role_id: 6,
    username: 'new-user',
    password: 'secure-password',
  });

  assert.equal(result.status, 400);
  assert.equal(app.queries.some(query => query.sql.includes('INSERT INTO account (role_id, username')), false);
  assert.equal(app.queries.at(-1).sql, 'ROLLBACK');
});

test('migration permits customer profiles without full names', async () => {
  const migration = await readFile(
    new URL('../sql/migrations/035_customer_full_name_nullable.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ALTER TABLE customer\s+ALTER COLUMN full_name DROP NOT NULL/);
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
