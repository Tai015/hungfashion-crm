import { createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from './db.js';

const TOKEN_LIFETIME_SECONDS = 60 * 60 * 8;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET phải được cấu hình trong server/.env và có ít nhất 32 ký tự.');
  }
  return secret;
}

export function validateJwtSecret() {
  jwtSecret();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function createAccessToken(accountId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: String(accountId),
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', jwtSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyAccessToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  const expected = createHmac('sha256', jwtSecret())
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(signaturePart, 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || !payload.sub || !Number.isInteger(payload.exp) || payload.exp <= Date.now() / 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });

  let token;
  try {
    token = verifyAccessToken(match[1]);
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
  if (!token) return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });

  try {
    const { rows } = await pool.query(
      `SELECT a.account_id, a.username, a.email, a.status, r.role_name,
              c.customer_id, e.employee_id
       FROM account a
       JOIN role r ON r.role_id = a.role_id
       LEFT JOIN customer c ON c.account_id = a.account_id
       LEFT JOIN employee e ON e.account_id = a.account_id
       WHERE a.account_id = $1`,
      [token.sub],
    );
    if (!rows.length || rows[0].status !== 'Active') {
      return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị khóa.' });
    }
    req.user = rows[0];
    return next();
  } catch (error) {
    return res.status(500).json({ message: 'Không thể xác thực tài khoản.' });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
    if (!roles.includes(req.user.role_name)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' });
    }
    return next();
  };
}

export function roleAccess(roles) {
  return [requireAuth, allowRoles(...roles)];
}
