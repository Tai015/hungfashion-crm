import { test, expect } from '@playwright/test';
import pg from 'pg';

const { Pool } = pg;
const customerIdentifier = process.env.E2E_CUSTOMER_IDENTIFIER;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;
const staffIdentifier = process.env.E2E_STAFF_IDENTIFIER;
const staffPassword = process.env.E2E_STAFF_PASSWORD;
const db = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true',
});

test.afterAll(async () => {
  await db.end();
});

test('khách hàng đăng nhập thành công qua API cục bộ', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toEqual(expect.any(String));
  expect(body.user.role).toBe('KHACH_HANG');
});

test('nhân viên đăng nhập thành công qua API cục bộ', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: staffIdentifier, password: staffPassword, audience: 'staff' },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toEqual(expect.any(String));
  expect(body.user.role).not.toBe('KHACH_HANG');
});

test('không cho tài khoản khách đăng nhập ở cổng nhân viên', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'staff' },
  });

  expect(response.status()).toBe(401);
});

test('từ chối mật khẩu sai', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: {
      identifier: customerIdentifier,
      password: customerPassword === 'wrong-password-for-e2e'
        ? 'different-wrong-password'
        : 'wrong-password-for-e2e',
      audience: 'customer',
    },
  });

  expect(response.status()).toBe(401);
});

test('ghi nhận login user event qua outbox, Kafka và consumer vào PostgreSQL', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });
  expect(login.status()).toBe(200);
  const { token, user } = await login.json();

  let kafkaReady = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await request.get('/api/events/status');
    if (status.ok() && (await status.json()).kafkaReady === true) {
      kafkaReady = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  expect(kafkaReady, 'Kafka consumer phải sẵn sàng trong CI').toBe(true);

  const eventId = `e2e-login-${Date.now()}-${user.account_id}`;
  const queued = await request.post('/api/events/user', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      eventId,
      eventType: 'login',
      page: 'login',
      section: 'authentication',
      event: 'login_success',
      occurredAt: new Date().toISOString(),
      sourceCheck: 'playwright-e2e',
    },
  });
  expect(queued.status()).toBe(202);

  let persisted = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await db.query(
      'SELECT event_id, user_id, event_type, action FROM user_events WHERE event_id = $1',
      [eventId],
    );
    persisted = result.rows[0] || null;
    if (persisted) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  expect(persisted, 'Login event phải được consumer ghi vào user_events').toBeTruthy();
  expect(persisted.user_id).toBe(String(user.account_id));
  expect(persisted.event_type).toBe('login');
  expect(persisted.action).toBe('login_success');
});
