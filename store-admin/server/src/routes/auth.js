import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { createAccessToken, requireAuth, validateJwtSecret } from '../auth.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENDERS = new Set(['Male', 'Female', 'Other']);

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

router.post('/register', async (req, res) => {
  try {
    validateJwtSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
  const { username, email, password, full_name, gender = null, date_of_birth = null } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,100}$/.test(username.trim())) {
    return res.status(400).json({ message: 'Tên đăng nhập cần từ 3–100 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
  }
  if (typeof email !== 'string' || email.length > 150 || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Mật khẩu cần từ 8–128 ký tự.' });
  }
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (gender !== null && !GENDERS.has(gender)) {
    return res.status(400).json({ message: 'Giới tính không hợp lệ.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows: [account] } = await client.query(
      `INSERT INTO account (role_id, username, password_hash, email)
       SELECT role_id, $1, $2, $3 FROM role WHERE role_name = 'KHACH_HANG'
       RETURNING account_id`,
      [username.trim(), passwordHash, email.trim().toLowerCase()],
    );
    if (!account) throw new Error('Vai trò khách hàng chưa được khởi tạo.');
    await client.query(
      `INSERT INTO customer (account_id, full_name, gender, date_of_birth, email)
       VALUES ($1, $2, $3::gender_type, $4, $5)`,
      [account.account_id, full_name.trim(), gender, date_of_birth, email.trim().toLowerCase()],
    );
    await client.query('COMMIT');
    const user = await loadUser(account.account_id);
    return res.status(201).json({ token: createAccessToken(account.account_id), user: publicUser(user) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng.' });
    if (error.code === '22007' || error.code === '22P02') {
      return res.status(400).json({ message: 'Ngày sinh hoặc giới tính không hợp lệ.' });
    }
    if (error.message.includes('JWT_SECRET')) return res.status(503).json({ message: error.message });
    return res.status(500).json({ message: 'Không thể tạo tài khoản khách hàng.' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    validateJwtSecret();
  } catch (error) {
    return res.status(503).json({ message: error.message });
  }
  const { identifier, password } = req.body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập/email và mật khẩu.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT account_id, password_hash, status
       FROM account
       WHERE username = $1 OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [identifier.trim()],
    );
    const account = rows[0];
    if (!account || account.status !== 'Active' || !(await bcrypt.compare(password, account.password_hash))) {
      return res.status(401).json({ message: 'Thông tin đăng nhập không chính xác hoặc tài khoản đã bị khóa.' });
    }
    await pool.query('UPDATE account SET last_login = NOW(), updated_at = NOW() WHERE account_id = $1', [account.account_id]);
    const user = await loadUser(account.account_id);
    return res.json({ token: createAccessToken(account.account_id), user: publicUser(user) });
  } catch (error) {
    if (error.message.includes('JWT_SECRET')) return res.status(503).json({ message: error.message });
    return res.status(500).json({ message: 'Không thể đăng nhập lúc này.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await loadUser(req.user.account_id);
    return res.json(publicUser(user));
  } catch {
    return res.status(500).json({ message: 'Không thể tải hồ sơ tài khoản.' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chức năng hồ sơ này chỉ dành cho khách hàng.' });
  }
  const { full_name, gender = null, date_of_birth = null, phone = null, address = null, interests = [] } = req.body || {};
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150) {
    return res.status(400).json({ message: 'Họ tên là bắt buộc và tối đa 150 ký tự.' });
  }
  if (gender !== null && !GENDERS.has(gender)) return res.status(400).json({ message: 'Giới tính không hợp lệ.' });
  if (date_of_birth !== null && (typeof date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth))) {
    return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
  }
  if (!Array.isArray(interests) || interests.length > 20 || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Danh sách sở thích không hợp lệ.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE customer SET full_name=$1, gender=$2::gender_type, date_of_birth=$3,
         phone=$4, address=$5, updated_at=NOW() WHERE customer_id=$6`,
      [full_name.trim(), gender, date_of_birth, phone, address, req.user.customer_id],
    );
    await client.query('DELETE FROM customer_interest WHERE customer_id = $1', [req.user.customer_id]);
    for (const name of [...new Set(interests.map((item) => item.trim()).filter(Boolean))]) {
      await client.query(
        `INSERT INTO customer_interest (customer_id, interest_id)
         SELECT $1, interest_id FROM interest WHERE interest_name = $2
         ON CONFLICT DO NOTHING`,
        [req.user.customer_id, name],
      );
    }
    await client.query('COMMIT');
    const user = await loadUser(req.user.account_id);
    return res.json(publicUser(user));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '22007' || error.code === '22P02') return res.status(400).json({ message: 'Ngày sinh hoặc giới tính không hợp lệ.' });
    return res.status(500).json({ message: 'Không thể cập nhật hồ sơ khách hàng.' });
  } finally {
    client.release();
  }
});

export default router;
