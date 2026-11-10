import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { pool } from '../db.js';
import { createAccessToken, requireAuth, validateJwtSecret } from '../auth.js';
import { writeOutboxEvent } from '../outbox-writer.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['Male', 'Female', 'Other']);
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{7,19}$/;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('auth-timing-padding', 12);
const authRateLimitWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
const loginRateLimitMax = Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX || 10);
const registerRateLimitMax = Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX || 10);
if (![authRateLimitWindowMs, loginRateLimitMax, registerRateLimitMax].every(Number.isInteger)
  || authRateLimitWindowMs <= 0 || loginRateLimitMax <= 0 || registerRateLimitMax <= 0) {
  throw new Error('Auth rate limit settings must be positive integers.');
}
function authRateLimitHandler(req, res, _next, options) {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime instanceof Date
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(authRateLimitWindowMs / 1000);
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(options.statusCode).json({
    code: 'AUTH_RATE_LIMITED',
    message: 'Bạn thao tác quá nhiều lần.',
    retryAfterSeconds,
  });
}
const loginIpLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  limit: loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: authRateLimitHandler,
});
const loginIdentifierLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  limit: loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => typeof req.body?.identifier === 'string'
    ? `${ipKeyGenerator(req.ip)}:${req.body.identifier.trim().toLocaleLowerCase('vi-VN').slice(0, 150) || '_empty'}`
    : `${ipKeyGenerator(req.ip)}:_invalid`,
  handler: authRateLimitHandler,
});
const registerIpLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  limit: registerRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: authRateLimitHandler,
});

function isValidDateOfBirth(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > new Date().getUTCFullYear()) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value && date <= new Date();
}

function publicUser(row) {
  return {
    account_id: row.account_id,
    username: row.username,
    email: row.email,
    role: row.role_name,
    customer_id: row.customer_id,
    employee_id: row.employee_id,
    full_name: row.full_name,
    gender: row.gender,
    date_of_birth: row.date_of_birth,
    phone: row.phone,
    address: row.address,
    interests: row.interests || [],
  };
}

async function loadUser(accountId) {
  const { rows } = await pool.query(
    `SELECT a.account_id, a.username, a.email, a.status, r.role_name,
            c.customer_id, c.full_name, c.gender, c.date_of_birth, c.phone, c.address
     FROM account a
     JOIN role r ON r.role_id = a.role_id
     LEFT JOIN customer c ON c.account_id = a.account_id
     WHERE a.account_id = $1`,
    [accountId],
  );
  const user = rows[0];
  if (!user) return null;
  if (user.customer_id) {
    const { rows: interestRows } = await pool.query(
      `SELECT i.interest_name
       FROM customer_interest ci
       JOIN interest i ON i.interest_id = ci.interest_id
       WHERE ci.customer_id = $1
       ORDER BY i.interest_name`,
      [user.customer_id],
    );
    user.interests = interestRows.map((row) => row.interest_name);
  }
  return user;
}

async function enqueueAuthEvent(client, { accountId, sessionId, eventType, action }) {
  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();
  await writeOutboxEvent(client, {
    eventId,
    topic: 'user-events',
    partitionKey: String(accountId),
    payload: {
      eventId,
      userId: String(accountId),
      sessionId: String(sessionId),
      eventType,
      page: 'authentication',
      section: 'authentication',
      event: action,
      sourceCheck: 'auth-api',
      occurredAt,
    },
  });
}

async function enqueueAuthEventBestEffort(client, event) {
  await client.query('SAVEPOINT auth_event');
  try {
    await enqueueAuthEvent(client, event);
    await client.query('RELEASE SAVEPOINT auth_event');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT auth_event');
    await client.query('RELEASE SAVEPOINT auth_event');
    console.error('[auth] Could not enqueue authentication event; auth flow will continue.', {
      eventType: event.eventType,
      errorCode: error.code || 'UNKNOWN',
      errorMessage: error.message,
    });
  }
}

router.post('/register', registerIpLimiter, async (req, res) => {
  try {
    validateJwtSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
  const { username, email, password, full_name, date_of_birth = null, interests = [] } = req.body || {};
  const gender = req.body?.gender ?? 'Other';
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,100}$/.test(username.trim())) {
    return res.status(400).json({ message: 'Tên đăng nhập cần từ 3–100 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
  }
  if (typeof email !== 'string' || email.length > 150 || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Mật khẩu cần từ 8–128 ký tự.' });
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Mật khẩu tối đa 72 byte khi mã hóa.' });
  }
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (gender !== null && !GENDERS.has(gender)) {
    return res.status(400).json({ message: 'Giới tính không hợp lệ.' });
  }
  if (!isValidDateOfBirth(date_of_birth)) {
    return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
  }
  if (!Array.isArray(interests) || interests.length > 20 || interests.some((name) => typeof name !== 'string' || name.trim().length > 100)) {
    return res.status(400).json({ message: 'Danh sách sở thích không hợp lệ.' });
  }

  let client;
  try {
    // Băm trước khi mượn kết nối DB để không giữ connection trong thời gian bcrypt chạy.
    const passwordHash = await bcrypt.hash(password, 12);
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: [account] } = await client.query(
      `INSERT INTO account (role_id, username, password_hash, email)
       SELECT role_id, $1, $2, $3 FROM role WHERE role_name = 'KHACH_HANG'
       RETURNING account_id`,
      [username.trim(), passwordHash, email.trim().toLowerCase()],
    );
    if (!account) throw new Error('Vai trò khách hàng chưa được khởi tạo.');
    const { rows: [customer] } = await client.query(
      `INSERT INTO customer (account_id, full_name, gender, date_of_birth, email)
       VALUES ($1, $2, $3::gender_type, $4, $5)
       RETURNING customer_id`,
      [account.account_id, full_name.trim(), gender, date_of_birth, email.trim().toLowerCase()],
    );
    const normalizedInterests = [...new Set(interests.map((name) => name.trim()).filter(Boolean))];
    for (const name of normalizedInterests) {
      await client.query(
        `INSERT INTO interest (interest_name) VALUES ($1) ON CONFLICT (interest_name) DO NOTHING`,
        [name],
      );
      await client.query(
        `INSERT INTO customer_interest (customer_id, interest_id)
         SELECT $1, interest_id FROM interest WHERE LOWER(TRIM(interest_name)) = LOWER($2)
         ON CONFLICT DO NOTHING`,
        [customer.customer_id, name],
      );
    }
    const sessionId = randomUUID();
    await client.query(
      `INSERT INTO account_sessions (session_id, account_id, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '8 hours', $3::inet)`,
      [sessionId, account.account_id, req.ip || req.socket.remoteAddress],
    );
    const token = createAccessToken(account.account_id, sessionId);
    await client.query('COMMIT');
    return res.status(201).json({
      token,
      user: publicUser({
        account_id: account.account_id,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        role_name: 'KHACH_HANG',
        customer_id: customer.customer_id,
        employee_id: null,
        full_name: full_name.trim(),
        gender,
        date_of_birth,
        phone: null,
        address: null,
        interests: normalizedInterests,
      }),
    });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' });
    if (error.code === '22007' || error.code === '22008' || error.code === '22P02') {
      return res.status(400).json({ message: 'Ngày sinh hoặc giới tính không hợp lệ.' });
    }
    if (error.message.includes('JWT_SECRET')) return res.status(503).json({ message: error.message });
    return res.status(500).json({ message: 'Không thể tạo tài khoản khách hàng.' });
  } finally {
    client?.release();
  }
});

router.post('/login', loginIpLimiter, loginIdentifierLimiter, async (req, res) => {
  try {
    validateJwtSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
  const { identifier, password, audience } = req.body || {};
  if (!['customer', 'staff'].includes(audience)) {
    return res.status(400).json({ message: 'Vui lòng chọn đúng trang đăng nhập khách hàng hoặc nội bộ.' });
  }
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.trim().length > 150
    || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập/email và mật khẩu.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT a.account_id, a.password_hash, a.status, r.role_name
       FROM account a
       JOIN role r ON r.role_id = a.role_id
       WHERE (LOWER(a.username) = LOWER($1) OR LOWER(a.email) = LOWER($1))
         AND (
           ($2 = 'customer' AND r.role_name = 'KHACH_HANG')
           OR
           ($2 = 'staff' AND r.role_name <> 'KHACH_HANG')
         )
       LIMIT 1`,
      [identifier.trim(), audience],
    );
    const account = rows[0];
    const passwordHash = account?.password_hash || DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, passwordHash);
    if (!account || account.status !== 'Active' || !passwordMatches) {
      return res.status(401).json({ message: audience === 'customer'
        ? 'Tài khoản không tồn tại hoặc thông tin đăng nhập không chính xác.'
        : 'Thông tin đăng nhập không chính xác hoặc tài khoản đã bị khóa.' });
    }
    const client = await pool.connect();
    const sessionId = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query('SELECT account_id FROM account WHERE account_id = $1 FOR UPDATE', [account.account_id]);
      const clientIp = req.ip || req.socket.remoteAddress;
      const { rows: [otherIpSession] } = await client.query(
        `SELECT session_id FROM account_sessions
         WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
           AND ip_address IS DISTINCT FROM $2::inet
         LIMIT 1`,
        [account.account_id, clientIp],
      );
      if (otherIpSession) {
        await client.query(
          `UPDATE account_sessions
           SET revoked_at = NOW(), revocation_reason = 'different_ip'
           WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
          [account.account_id],
        );
        await client.query('COMMIT');
        return res.status(409).json({
          code: 'SESSION_IP_CONFLICT',
          message: 'Phát hiện đăng nhập tài khoản này từ IP khác. Tất cả phiên hiện có đã bị đăng xuất và lần đăng nhập mới bị từ chối. Nếu không phải bạn, hãy đổi mật khẩu.',
        });
      }
      await client.query('UPDATE account SET last_login = NOW(), updated_at = NOW() WHERE account_id = $1', [account.account_id]);
      await client.query(
        `INSERT INTO account_sessions (session_id, account_id, expires_at, ip_address)
         VALUES ($1, $2, NOW() + INTERVAL '8 hours', $3::inet)`,
        [sessionId, account.account_id, clientIp],
      );
      await enqueueAuthEventBestEffort(client, {
        accountId: account.account_id,
        sessionId,
        eventType: 'login',
        action: 'login_success',
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    const user = await loadUser(account.account_id);
    if (!user) return res.status(401).json({ message: 'Tài khoản không còn tồn tại.' });
    return res.json({ token: createAccessToken(account.account_id, sessionId), user: publicUser(user) });
  } catch (error) {
    if (error.message.includes('JWT_SECRET')) return res.status(503).json({ message: error.message });
    return res.status(500).json({ message: 'Không thể đăng nhập lúc này.' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'UPDATE account_sessions SET revoked_at = NOW() WHERE session_id = $1 AND account_id = $2 AND revoked_at IS NULL',
      [req.sessionId, req.user.account_id],
    );
    if (rowCount > 0) {
      await enqueueAuthEventBestEffort(client, {
        accountId: req.user.account_id,
        sessionId: req.sessionId,
        eventType: 'logout',
        action: 'logout_success',
      });
    }
    await client.query('COMMIT');
    return res.json({ message: 'Đã đăng xuất.' });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: 'Không thể kết thúc phiên đăng nhập lúc này.' });
  } finally {
    client.release();
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (typeof current_password !== 'string' || !current_password || current_password.length > 128
    || Buffer.byteLength(current_password, 'utf8') > 72
    || typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 128
    || Buffer.byteLength(new_password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Mật khẩu hiện tại và mật khẩu mới hợp lệ là bắt buộc; mật khẩu mới cần từ 8–128 ký tự và tối đa 72 byte.' });
  }
  if (current_password === new_password) {
    return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: [account] } = await client.query(
      `SELECT password_hash FROM account WHERE account_id = $1 AND status = 'Active' FOR UPDATE`,
      [req.user.account_id],
    );
    if (!account || !await bcrypt.compare(current_password, account.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Mật khẩu hiện tại không chính xác.' });
    }
    const passwordHash = await bcrypt.hash(new_password, 12);
    await client.query(
      'UPDATE account SET password_hash = $1, updated_at = NOW() WHERE account_id = $2',
      [passwordHash, req.user.account_id],
    );
    await client.query(
      `UPDATE account_sessions SET revoked_at = NOW()
       WHERE account_id = $1 AND session_id <> $2 AND revoked_at IS NULL`,
      [req.user.account_id, req.sessionId],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Đã đổi mật khẩu. Các phiên đăng nhập khác đã được kết thúc.' });
  } catch {
    await client?.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: 'Không thể đổi mật khẩu lúc này.' });
  } finally {
    client?.release();
  }
});

router.post('/heartbeat', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [account] } = await client.query(
      `SELECT a.status, r.role_name
       FROM account a JOIN role r ON r.role_id = a.role_id
       WHERE a.account_id = $1 FOR UPDATE OF a`,
      [req.user.account_id],
    );
    if (!account || account.status !== 'Active') {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị khóa.' });
    }
    const { rows: [session] } = await client.query(
      `UPDATE account_sessions SET last_seen_at = clock_timestamp()
       WHERE session_id = $1 AND account_id = $2
         AND revoked_at IS NULL AND expires_at > clock_timestamp()
       RETURNING session_id`,
      [req.sessionId, req.user.account_id],
    );
    if (!session) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Phiên đăng nhập đã kết thúc.' });
    }
    await client.query('COMMIT');
    return res.json({ role: account.role_name });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: 'Không thể cập nhật trạng thái phiên đăng nhập.' });
  } finally {
    client.release();
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await loadUser(req.user.account_id);
    if (!user) return res.status(401).json({ message: 'Tài khoản không còn tồn tại.' });
    return res.json(publicUser(user));
  } catch {
    return res.status(500).json({ message: 'Không thể tải hồ sơ tài khoản.' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chức năng hồ sơ này chỉ dành cho khách hàng.' });
  }
  const { full_name, date_of_birth = null, phone = null, address = null, interests = [] } = req.body || {};
  const gender = req.body?.gender ?? 'Other';
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (gender !== null && !GENDERS.has(gender)) return res.status(400).json({ message: 'Giới tính không hợp lệ.' });
  if (!isValidDateOfBirth(date_of_birth)) {
    return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
  }
  if (phone !== null && (typeof phone !== 'string' || phone.trim().length > 20 || !PHONE_PATTERN.test(phone.trim()))) {
    return res.status(400).json({ message: 'Số điện thoại không hợp lệ.' });
  }
  if (address !== null && (typeof address !== 'string' || address.trim().length > 500)) {
    return res.status(400).json({ message: 'Địa chỉ tối đa 500 ký tự.' });
  }
  if (!Array.isArray(interests) || interests.length > 20 || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Danh sách sở thích không hợp lệ.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `UPDATE customer SET full_name=$1, gender=$2::gender_type, date_of_birth=$3,
         phone=$4, address=$5, updated_at=NOW() WHERE customer_id=$6`,
      [full_name.trim(), gender, date_of_birth, phone, address, req.user.customer_id],
    );
    await client.query('DELETE FROM customer_interest WHERE customer_id = $1', [req.user.customer_id]);
    const normalizedInterests = [...new Set(interests.map((item) => item.trim().toLocaleLowerCase('vi-VN')).filter(Boolean))];
    for (const name of normalizedInterests) {
      const { rows: [interest] } = await client.query(
        `SELECT interest_id FROM interest WHERE LOWER(TRIM(interest_name)) = LOWER($1) LIMIT 1`,
        [name],
      );
      if (!interest) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Sở thích “${name}” không có trong danh mục.` });
      }
      await client.query(
        `INSERT INTO customer_interest (customer_id, interest_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.user.customer_id, interest.interest_id],
      );
    }
    await client.query('COMMIT');
    const user = await loadUser(req.user.account_id);
    return res.json(publicUser(user));
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    if (error.code === '22007' || error.code === '22008' || error.code === '22P02') return res.status(400).json({ message: 'Ngày sinh hoặc giới tính không hợp lệ.' });
    return res.status(500).json({ message: 'Không thể cập nhật hồ sơ khách hàng.' });
  } finally {
    client?.release();
  }
});

export default router;
