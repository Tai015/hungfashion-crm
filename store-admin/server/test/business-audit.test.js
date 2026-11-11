import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createAuditMiddleware } from '../src/audit-logging.js';

function runAudit({ statusCode = 200, authenticated = true } = {}) {
  const writes = [];
  const database = {
    query: async (sql, values) => { writes.push({ sql, values }); return { rowCount: 1 }; },
  };
  const req = {
    method: 'PATCH',
    path: '/42/account-status',
    originalUrl: '/api/customers/42/account-status?source=admin',
    body: {
      status: 'Blocked',
      price: 1250,
      email: 'private@example.test',
      password: 'must-not-be-stored',
      access_token: 'secret-token',
    },
    requestId: 'd942f1bd-34f2-4e17-a2a7-fecb38f934a1',
  };
  const res = new EventEmitter();
  res.statusCode = statusCode;
  createAuditMiddleware({ database, log: { error() {} } })(req, res, () => {});
  if (authenticated) req.user = { account_id: 7, username: 'manager', role_name: 'ADMIN' };
  res.emit('finish');
  return { writes };
}

test('records actor, target object, action, outcome and safe changed fields', async () => {
  const { writes } = runAudit();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  const { sql, values } = writes[0];
  assert.match(sql, /INSERT INTO audit_logs/);
  assert.equal(values[0], 7);
  assert.equal(values[1], 'manager');
  assert.equal(values[2], 'ADMIN');
  assert.equal(values[3], 'account-status');
  assert.equal(values[4], 'customer');
  assert.equal(values[5], '42');
  assert.equal(values[6], 'success');
  assert.equal(values[7], 'PATCH');
  assert.equal(values[8], 200);
  assert.equal(values[9], '/api/customers/42/account-status');
  assert.equal(values[10], 'd942f1bd-34f2-4e17-a2a7-fecb38f934a1');
  const changed = JSON.parse(values[11]);
  assert.equal(changed.status, 'Blocked');
  assert.equal(changed.price, 1250);
  assert.equal(changed.email, undefined);
  assert.equal(changed.password, undefined);
  assert.equal(changed.access_token, undefined);
});

test('records failed requests and unauthenticated actor without leaking request secrets', async () => {
  const { writes } = runAudit({ statusCode: 403, authenticated: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values[0], null);
  assert.equal(writes[0].values[1], 'unknown');
  assert.equal(writes[0].values[2], 'unknown');
  assert.equal(writes[0].values[6], 'failure');
  assert.equal(writes[0].values[8], 403);
});

test('does not write audit records for read-only requests', () => {
  const writes = [];
  const req = { method: 'GET', path: '/api/customers', originalUrl: '/api/customers' };
  const res = new EventEmitter();
  createAuditMiddleware({ database: { query: async (...args) => writes.push(args) } })(req, res, () => {});
  res.emit('finish');
  assert.equal(writes.length, 0);
});
