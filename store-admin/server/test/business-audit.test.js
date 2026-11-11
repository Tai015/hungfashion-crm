import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBusinessAuditMiddleware } from '../src/business-audit.js';

function harness({ statusCode = 200, responseBody = { customer_id: 42 } } = {}) {
  const calls = [];
  const database = {
    query: async (sql, values) => { calls.push({ sql, values }); return { rowCount: 1 }; },
  };
  const req = {
    method: 'PATCH',
    path: '/42/account-status',
    originalUrl: '/api/customers/42/account-status',
    baseUrl: '/api/customers',
    params: { id: '42' },
    body: { status: 'Blocked', password: 'never-store-this', access_token: 'secret-token' },
    user: { account_id: 7, username: 'manager', role_name: 'ADMIN' },
    requestId: 'd942f1bd-34f2-4e17-a2a7-fecb38f934a1',
  };
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.json = body => { res.body = body; res.emit('finish'); return res; };
  res.send = body => { res.body = body; res.emit('finish'); return res; };
  const next = () => {};
  createBusinessAuditMiddleware({ database, auditLogger: { error() {} } })(req, res, next);
  res.json(responseBody);
  return { calls, req, res };
}

test('records actor, entity, outcome, request id and redacts credentials', async () => {
  const { calls } = harness();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  const [sql, values] = [calls[0].sql, calls[0].values];
  assert.match(sql, /INSERT INTO business_audit_logs/);
  assert.equal(values[0], 7);
  assert.equal(values[1], 'manager');
  assert.equal(values[2], 'ADMIN');
  assert.equal(values[3], 'customer.update');
  assert.equal(values[4], 'customer');
  assert.equal(values[5], '42');
  assert.equal(values[8], 'd942f1bd-34f2-4e17-a2a7-fecb38f934a1');
  assert.equal(values[9], 200);
  assert.equal(values[10], 'success');
  const changes = JSON.parse(values[11]);
  assert.equal(changes.submitted.status, 'Blocked');
  assert.equal(changes.submitted.password, '[redacted]');
  assert.equal(changes.submitted.access_token, '[redacted]');
});

test('records rejected mutations as failures with HTTP status', async () => {
  const { calls } = harness({ statusCode: 409, responseBody: { message: 'Conflict' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values[9], 409);
  assert.equal(calls[0].values[10], 'failure');
  assert.equal(calls[0].values[12], 'Conflict');
});

test('does not audit read-only requests', () => {
  const calls = [];
  const req = { method: 'GET', path: '/customers', body: {} };
  const res = new EventEmitter();
  createBusinessAuditMiddleware({ database: { query: async (...args) => calls.push(args) } })(req, res, () => {});
  res.emit('finish');
  assert.equal(calls.length, 0);
});
