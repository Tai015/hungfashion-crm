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

test('tự ghi nhận đăng nhập và đăng xuất qua outbox vào lịch sử khách hàng', async ({ request }) => {
  test.setTimeout(45_000);

  const login = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });
  expect(login.status()).toBe(200);
  const { token, user } = await login.json();
  const tokenParts = token.split('.');
  expect(tokenParts).toHaveLength(3);
  const sessionId = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8')).jti;
  expect(sessionId, 'JWT phải chứa jti của phiên vừa đăng nhập').toEqual(expect.any(String));
  const authorization = { Authorization: `Bearer ${token}` };

  let loginEvent = null;
  await expect.poll(async () => {
    const result = await db.query(
      `SELECT event_id, user_id, session_id, event_type, action
       FROM user_events
       WHERE user_id = $1 AND session_id = $2 AND action = 'login_success'
       ORDER BY occurred_at DESC LIMIT 1`,
      [String(user.account_id), sessionId],
    );
    loginEvent = result.rows[0] || null;
    return Boolean(loginEvent);
  }, {
    message: 'Đăng nhập phải phát sinh login_success cho đúng phiên vừa tạo',
    timeout: 15_000,
    intervals: [250, 500, 1_000],
  }).toBe(true);

  expect(loginEvent.user_id).toBe(String(user.account_id));
  expect(loginEvent.event_type).toBe('login');
  expect(loginEvent.session_id).toBe(sessionId);
  expect(loginEvent.session_id).not.toBeNull();

  const logout = await request.post('/api/auth/logout', { headers: authorization });
  expect(logout.status()).toBe(200);

  let logoutEvent = null;
  await expect.poll(async () => {
    const result = await db.query(
      `SELECT event_id, user_id, session_id, event_type, action
       FROM user_events
       WHERE user_id = $1 AND session_id = $2 AND action = 'logout_success'
       ORDER BY occurred_at DESC LIMIT 1`,
      [String(user.account_id), sessionId],
    );
    logoutEvent = result.rows[0] || null;
    return Boolean(logoutEvent);
  }, {
    message: 'Đăng xuất phải phát sinh logout_success cho đúng phiên vừa đăng xuất',
    timeout: 15_000,
    intervals: [250, 500, 1_000],
  }).toBe(true);

  expect(logoutEvent.user_id).toBe(String(user.account_id));
  expect(logoutEvent.event_type).toBe('logout');
  expect(logoutEvent.session_id).toBe(sessionId);
  expect(logoutEvent.session_id).toBe(loginEvent.session_id);
  expect(logoutEvent.session_id).not.toBeNull();

  const timeline = await db.query(
    `SELECT interaction_type, title
     FROM customer_interaction_timeline
     WHERE customer_id = (
       SELECT customer_id FROM customer WHERE account_id = $1
     )
       AND interaction_id IN ($2, $3)
     ORDER BY occurred_at ASC`,
    [user.account_id, `user-event:${loginEvent.event_id ? loginEvent.event_id : ''}`, `user-event:${logoutEvent.event_id ? logoutEvent.event_id : ''}`],
  );
  expect(timeline.rows).toHaveLength(2);
  expect(timeline.rows.map(row => row.interaction_type)).toEqual(['account_access', 'account_access']);
  expect(timeline.rows.map(row => row.title)).toEqual(['Khách hàng đăng nhập', 'Khách hàng đăng xuất']);
});


test('đăng nhập và đăng xuất vẫn thành công khi ghi auth outbox bị lỗi', async ({ request }) => {
  test.setTimeout(60_000);
  try {
    await db.query('DROP TRIGGER IF EXISTS e2e_reject_auth_outbox_trigger ON outbox_events');
    await db.query('DROP FUNCTION IF EXISTS e2e_reject_auth_outbox()');
    await db.query('DROP SEQUENCE IF EXISTS e2e_auth_outbox_failures');
    await db.query('CREATE SEQUENCE e2e_auth_outbox_failures START 1');
    await db.query(`
      CREATE OR REPLACE FUNCTION e2e_reject_auth_outbox() RETURNS trigger AS $function$
    BEGIN
      IF NEW.topic = 'user-events' AND NEW.payload->>'section' = 'authentication' THEN
        PERFORM nextval('e2e_auth_outbox_failures');
        RAISE EXCEPTION 'forced auth outbox failure for E2E';
      END IF;
      RETURN NEW;
    END;
    $function$ LANGUAGE plpgsql
  `);
    await db.query(`
      CREATE TRIGGER e2e_reject_auth_outbox_trigger
    BEFORE INSERT ON outbox_events
    FOR EACH ROW EXECUTE FUNCTION e2e_reject_auth_outbox()
  `);

    const login = await request.post('/api/auth/login', {
      data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
    });
    expect(login.status()).toBe(200);
    const { token, user } = await login.json();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(claims.jti).toEqual(expect.any(String));

    const activeSession = await db.query(
      `SELECT session_id FROM account_sessions
       WHERE session_id = $1 AND account_id = $2
         AND revoked_at IS NULL AND expires_at > NOW()`,
      [claims.jti, user.account_id],
    );
    expect(activeSession.rowCount).toBe(1);

    const logout = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logout.status()).toBe(200);

    const revokedSession = await db.query(
      `SELECT session_id FROM account_sessions
       WHERE session_id = $1 AND account_id = $2 AND revoked_at IS NOT NULL`,
      [claims.jti, user.account_id],
    );
    expect(revokedSession.rowCount).toBe(1);

    const authEvents = await db.query(
      `SELECT event_id FROM outbox_events
       WHERE topic = 'user-events' AND payload->>'section' = 'authentication'
         AND payload->>'sessionId' = $1`,
      [claims.jti],
    );
    expect(authEvents.rowCount).toBe(0);
    const failureAttempts = await db.query("SELECT last_value, is_called FROM e2e_auth_outbox_failures");
    expect(Number(failureAttempts.rows[0].last_value)).toBe(2);
    expect(failureAttempts.rows[0].is_called).toBe(true);
  } finally {
    await db.query('DROP TRIGGER IF EXISTS e2e_reject_auth_outbox_trigger ON outbox_events');
    await db.query('DROP FUNCTION IF EXISTS e2e_reject_auth_outbox()');
    await db.query('DROP SEQUENCE IF EXISTS e2e_auth_outbox_failures');
  }
});

test('token cũ bị từ chối sau logout và logout lần hai không gây HTTP 500', async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const authorization = { Authorization: `Bearer ${token}` };

  const beforeLogout = await request.get('/api/orders/mine', { headers: authorization });
  expect(beforeLogout.status()).toBe(200);

  const logout = await request.post('/api/auth/logout', { headers: authorization });
  expect(logout.status()).toBe(200);

  const afterLogout = await request.get('/api/orders/mine', { headers: authorization });
  expect(afterLogout.status()).toBe(401);

  const secondLogout = await request.post('/api/auth/logout', { headers: authorization });
  expect(secondLogout.status()).toBe(401);
  expect(secondLogout.status()).not.toBe(500);
});

test('logout một phiên không thu hồi phiên khác của cùng tài khoản', async ({ request }) => {
  const firstLogin = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });
  expect(firstLogin.status()).toBe(200);
  const firstToken = (await firstLogin.json()).token;

  const secondLogin = await request.post('/api/auth/login', {
    data: { identifier: customerIdentifier, password: customerPassword, audience: 'customer' },
  });
  expect(secondLogin.status()).toBe(200);
  const secondToken = (await secondLogin.json()).token;
  expect(secondToken).not.toBe(firstToken);

  const firstSessionRequest = await request.get('/api/orders/mine', {
    headers: { Authorization: `Bearer ${firstToken}` },
  });
  const secondSessionRequest = await request.get('/api/orders/mine', {
    headers: { Authorization: `Bearer ${secondToken}` },
  });
  expect(firstSessionRequest.status()).toBe(200);
  expect(secondSessionRequest.status()).toBe(200);

  const logoutFirstSession = await request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${firstToken}` },
  });
  expect(logoutFirstSession.status()).toBe(200);

  const revokedSessionRequest = await request.get('/api/orders/mine', {
    headers: { Authorization: `Bearer ${firstToken}` },
  });
  expect(revokedSessionRequest.status()).toBe(401);

  const stillActiveSessionRequest = await request.get('/api/orders/mine', {
    headers: { Authorization: `Bearer ${secondToken}` },
  });
  expect(stillActiveSessionRequest.status()).toBe(200);
});

test('token hết hạn bị từ chối ở API bảo vệ và logout', async ({ request }) => {
  const { createHmac, randomUUID } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: '1',
    jti: randomUUID(),
    iat: now - 7200,
    exp: now - 3600,
  })).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', process.env.JWT_SECRET)
    .update(unsignedToken)
    .digest('base64url');
  const expiredToken = `${unsignedToken}.${signature}`;
  const authorization = { Authorization: `Bearer ${expiredToken}` };

  const protectedRequest = await request.get('/api/orders/mine', { headers: authorization });
  expect(protectedRequest.status()).toBe(401);

  const logout = await request.post('/api/auth/logout', { headers: authorization });
  expect(logout.status()).toBe(401);
});

