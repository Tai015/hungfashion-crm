import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createLogger } from '../src/logger.js';
import { createRequestLoggingMiddleware } from '../src/request-logging.js';

function captureLogger() {
  const records = [];
  const destination = { write(line) { records.push(JSON.parse(line)); } };
  return { records, logger: createLogger({ service: 'test-service', level: 'debug', destination }) };
}

test('writes JSON logs and redacts sensitive fields and bearer tokens', () => {
  const { records, logger } = captureLogger();
  logger.error({
    requestId: 'req-1',
    password: 'do-not-log',
    authorization: 'Bearer abc.def.ghi',
    err: new Error('request failed'),
  }, 'request failed');

  assert.equal(records.length, 1);
  assert.equal(records[0].service, 'test-service');
  assert.equal(records[0].level, 'error');
  assert.equal(records[0].password, '[REDACTED]');
  assert.equal(records[0].authorization, '[REDACTED]');
  assert.equal(records[0].err.message, 'request failed');
  assert.doesNotMatch(JSON.stringify(records[0]), /do-not-log|abc\.def\.ghi/);
});

test('adds request id header and logs a route template without query parameters', async () => {
  const { records, logger } = captureLogger();
  const app = express();
  app.use(createRequestLoggingMiddleware({ logger, requestIdFactory: () => 'req-test-123' }));
  app.get('/api/orders/:orderId', (_req, res) => res.status(200).json({ ok: true }));

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders/123?token=private`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'req-test-123');
    await response.text();
    assert.equal(records.length, 1);
    assert.equal(records[0].requestId, 'req-test-123');
    assert.equal(records[0].route, '/api/orders/:orderId');
    assert.equal(records[0].statusCode, 200);
    assert.equal(records[0].level, 'info');
    assert.doesNotMatch(JSON.stringify(records[0]), /123|private/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('logs 4xx as warning and 5xx as error', async () => {
  const { records, logger } = captureLogger();
  const app = express();
  app.use(createRequestLoggingMiddleware({ logger, requestIdFactory: () => 'req-test' }));
  app.get('/client-error', (_req, res) => res.sendStatus(404));
  app.get('/server-error', (_req, res) => res.sendStatus(503));

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await fetch(`http://127.0.0.1:${server.address().port}/client-error`);
    await fetch(`http://127.0.0.1:${server.address().port}/server-error`);
    assert.deepEqual(records.map(record => record.level), ['warn', 'error']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
