import { Router } from 'express';
import { pool } from '../db.js';
import { createCustomerInteractionsRouter } from './customer-interactions.js';

const router = Router();

function isValidOptionalDateOfBirth(value) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > new Date().getFullYear()) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date <= new Date();
}

// GET /api/customers – danh sách khách hàng (có lọc / tìm kiếm / phân trang)
router.get('/', async (req, res) => {
  try {
    const { search, tier, gender } = req.query;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
    }
    if (tier) {
      params.push(tier);
      conditions.push(`customer_tier_for_points(c.lifetime_points) = $${params.length}`);
    }
    if (gender) {
      params.push(gender);
      conditions.push(`c.gender = $${params.length}`);
    }

    conditions.unshift(
      'c.deleted_at IS NULL',
      `(c.account_id IS NULL OR EXISTS (
        SELECT 1
        FROM account customer_account
        JOIN role customer_role ON customer_role.role_id = customer_account.role_id
        WHERE customer_account.account_id = c.account_id
          AND customer_role.role_name = 'KHACH_HANG'
      ))`,
    );
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT c.*, a.status AS account_status,
              EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS age
       FROM customer c
       LEFT JOIN account a ON a.account_id = c.account_id
       ${where}
       ORDER BY c.registered_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM customer c ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/customers/stats/overview – thống kê CRM (đặt trước route động /:id)
router.get('/stats/overview', async (_req, res) => {
  try {
    const [tierStats, genderStats, ageStats] = await Promise.all([
      pool.query(
        `SELECT customer_tier_for_points(lifetime_points) AS customer_tier, COUNT(*)::int AS count
         FROM customer WHERE deleted_at IS NULL GROUP BY customer_tier_for_points(lifetime_points) ORDER BY count DESC`
      ),
      pool.query(
        `SELECT gender, COUNT(*)::int AS count
         FROM customer WHERE deleted_at IS NULL GROUP BY gender`
      ),
      pool.query(
        `WITH customer_ages AS (
           SELECT CASE
             WHEN date_of_birth IS NULL THEN 'Chưa rõ'
             WHEN age < 18 THEN 'Dưới 18'
             WHEN age <= 24 THEN '18–24'
             WHEN age <= 34 THEN '25–34'
             WHEN age <= 44 THEN '35–44'
             ELSE 'Từ 45'
           END AS age_group
           FROM (
             SELECT date_of_birth, EXTRACT(YEAR FROM AGE(date_of_birth))::int AS age
             FROM customer WHERE deleted_at IS NULL
           ) all_customers
         ), total AS (
           SELECT COUNT(*)::numeric AS customer_count FROM customer WHERE deleted_at IS NULL
         )
         SELECT customer_ages.age_group,
                COUNT(*)::int AS count,
                COALESCE(ROUND(COUNT(*) * 100.0 / NULLIF(total.customer_count, 0), 1), 0)::float AS percent
         FROM customer_ages CROSS JOIN total
         GROUP BY customer_ages.age_group, total.customer_count
         ORDER BY CASE customer_ages.age_group
           WHEN 'Dưới 18' THEN 1 WHEN '18–24' THEN 2 WHEN '25–34' THEN 3
           WHEN '35–44' THEN 4 WHEN 'Từ 45' THEN 5 ELSE 6 END`
      ),
    ]);
    res.json({ byTier: tierStats.rows, byGender: genderStats.rows, byAge: ageStats.rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lịch sử tương tác được tổng hợp từ VIEW, phân trang bằng cursor.
router.use('/:id/interactions', createCustomerInteractionsRouter());

// GET /api/customers/interests – danh mục sở thích có thể gán cho khách hàng
router.get('/interests', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT interest_id, interest_name FROM interest ORDER BY interest_name');
    res.json({ data: rows });
  } catch {
    res.status(500).json({ message: 'Không thể tải danh mục sở thích.' });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, a.username, a.status AS account_status,
              EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS age
       FROM customer c
       LEFT JOIN account a ON a.account_id = c.account_id
       WHERE c.customer_id = $1 AND c.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });

    // Lấy sở thích
    const { rows: interests } = await pool.query(
      `SELECT i.interest_name
       FROM customer_interest ci
       JOIN interest i ON i.interest_id = ci.interest_id
       WHERE ci.customer_id=$1
       ORDER BY i.interest_name`,
      [req.params.id]
    );
    res.json({ ...rows[0], interests: interests.map(r => r.interest_name) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/customers – thêm khách hàng mới
router.post('/', async (req, res) => {
  const { full_name, gender, date_of_birth, phone, email, address, interests = [] } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedGender = gender == null || gender === '' ? 'Other' : gender;
  const normalizedDateOfBirth = date_of_birth || null;
  if (!isValidOptionalDateOfBirth(normalizedDateOfBirth)) return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150
    || !normalizedEmail || normalizedEmail.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || !Array.isArray(interests) || interests.length > 20
    || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Họ tên, email hoặc danh sách sở thích không hợp lệ.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO customer (full_name, gender, date_of_birth, phone, email, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [full_name.trim(), normalizedGender, normalizedDateOfBirth, phone, normalizedEmail, address]
    );
    const customer = rows[0];

    if (Array.isArray(interests)) {
      for (const interestName of [...new Set(interests)]) {
        const { rows: interestRows } = await client.query(
          `INSERT INTO interest (interest_name) VALUES ($1)
           ON CONFLICT (interest_name) DO UPDATE SET interest_name = EXCLUDED.interest_name
           RETURNING interest_id`,
          [interestName.trim()],
        );
        await client.query(
          `INSERT INTO customer_interest (customer_id, interest_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [customer.customer_id, interestRows[0].interest_id],
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(customer);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'Email đã được sử dụng cho hồ sơ khách hàng khác.' });
    if (err.code === '22P02' || err.code === '22007' || err.code === '23514') {
      return res.status(400).json({ message: 'Ngày sinh, giới tính hoặc thông tin khách hàng không hợp lệ.' });
    }
    return res.status(500).json({ message: 'Không thể tạo khách hàng.' });
  } finally {
    client.release();
  }
});

// PUT /api/customers/:id – cập nhật thông tin
router.put('/:id', async (req, res) => {
  const { full_name, gender, date_of_birth, phone, email, address, interests = [] } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedGender = gender == null || gender === '' ? 'Other' : gender;
  const normalizedDateOfBirth = date_of_birth || null;
  if (!isValidOptionalDateOfBirth(normalizedDateOfBirth)) return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150
    || !normalizedEmail || normalizedEmail.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || !Array.isArray(interests) || interests.length > 20
    || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Họ tên, email hoặc danh sách sở thích không hợp lệ.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE customer
       SET full_name=$1, gender=$2, date_of_birth=$3, phone=$4,
           email=$5, address=$6, updated_at=NOW()
       WHERE customer_id=$7 AND deleted_at IS NULL RETURNING *`,
      [full_name.trim(), normalizedGender, normalizedDateOfBirth, phone, normalizedEmail, address, req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    // Cập nhật sở thích
    await client.query(`DELETE FROM customer_interest WHERE customer_id=$1`, [req.params.id]);
    if (Array.isArray(interests)) {
      for (const interestName of [...new Set(interests)]) {
        const { rows: interestRows } = await client.query(
          `INSERT INTO interest (interest_name) VALUES ($1)
           ON CONFLICT (interest_name) DO UPDATE SET interest_name = EXCLUDED.interest_name
           RETURNING interest_id`,
          [interestName.trim()],
        );
        await client.query(
          `INSERT INTO customer_interest (customer_id, interest_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, interestRows[0].interest_id],
        );
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'Email đã được sử dụng cho hồ sơ khách hàng khác.' });
    if (err.code === '22P02' || err.code === '22007' || err.code === '23514') {
      return res.status(400).json({ message: 'Ngày sinh, giới tính hoặc thông tin khách hàng không hợp lệ.' });
    }
    return res.status(500).json({ message: 'Không thể cập nhật khách hàng.' });
  } finally {
    client.release();
  }
});

// PATCH /api/customers/:id/account-status – khóa/mở khóa tài khoản khách hàng
router.patch('/:id/account-status', async (req, res) => {
  const { status } = req.body || {};
  if (!['Active', 'Blocked'].includes(status)) {
    return res.status(400).json({ message: 'Trạng thái tài khoản chỉ có thể là Active hoặc Blocked.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE account a
       SET status=$1, updated_at=NOW()
       FROM customer c
       WHERE c.customer_id=$2 AND c.account_id=a.account_id AND c.deleted_at IS NULL
       RETURNING c.customer_id, a.account_id, a.status AS account_status`,
      [status, req.params.id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      const { rowCount } = await pool.query('SELECT 1 FROM customer WHERE customer_id=$1 AND deleted_at IS NULL', [req.params.id]);
      if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
      return res.status(409).json({ message: 'Hồ sơ này chưa liên kết tài khoản đăng nhập nên không thể khóa/mở khóa.' });
    }
    // Khóa tài khoản phải thu hồi các phiên hiện tại; mở khóa không được khôi phục phiên cũ.
    if (status === 'Blocked') {
      await client.query(
        `UPDATE account_sessions
         SET revoked_at=NOW(), revocation_reason='account_blocked'
         WHERE account_id=$1 AND revoked_at IS NULL`,
        [rows[0].account_id],
      );
    }
    await client.query('COMMIT');
    return res.json({ ...rows[0], message: status === 'Blocked' ? 'Đã khóa tài khoản và đăng xuất các phiên hiện tại.' : 'Đã mở khóa tài khoản khách hàng. Khách hàng cần đăng nhập lại.' });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ message: 'Không thể cập nhật trạng thái tài khoản khách hàng.' });
  } finally {
    client.release();
  }
});

// DELETE /api/customers/:id – ẩn danh hóa hồ sơ, giữ nguyên khóa liên kết và lịch sử nghiệp vụ
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: customerRows } = await client.query(
      `SELECT customer_id, account_id, deleted_at
       FROM customer WHERE customer_id=$1 FOR UPDATE`, [req.params.id]
    );
    if (!customerRows.length || customerRows[0].deleted_at) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy khách hàng.' });
    }

    const customer = customerRows[0];
    // Xóa PII nhưng giữ customer_id để bảo toàn đơn hàng, phản hồi và báo cáo lịch sử.
    await client.query(
      `UPDATE customer
       SET full_name=$1, gender='Other', date_of_birth=NULL, phone=NULL,
           email=$2, address=NULL, deleted_at=NOW(), updated_at=NOW()
       WHERE customer_id=$3`,
      [`Khách hàng đã xóa #${customer.customer_id}`, `deleted-customer-${customer.customer_id}@privacy.invalid`, customer.customer_id]
    );
    await client.query('DELETE FROM customer_interest WHERE customer_id=$1', [customer.customer_id]);

    if (customer.account_id) {
      await client.query(
        `UPDATE account
         SET status='Blocked', username=$1, email=NULL, phone=NULL, updated_at=NOW()
         WHERE account_id=$2`,
        [`deleted_customer_${customer.customer_id}`, customer.account_id]
      );
      // Thu hồi phiên đăng nhập hiện có ngay khi xóa hồ sơ.
      await client.query(
        `UPDATE account_sessions SET revoked_at=NOW()
         WHERE account_id=$1 AND revoked_at IS NULL`,
        [customer.account_id]
      );
    }

    await client.query('COMMIT');
    return res.json({
      message: 'Đã xóa hồ sơ khách hàng bằng cách ẩn danh hóa thông tin. Lịch sử đơn hàng và giao dịch vẫn được bảo toàn.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Không thể ẩn danh hồ sơ do xung đột định danh. Vui lòng tải lại và thử lại.' });
    }
    return res.status(500).json({ message: 'Không thể xóa hồ sơ khách hàng.' });
  } finally {
    client.release();
  }
});

// GET /api/customers/:id/orders – lịch sử mua hàng
router.get('/:id/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.order_id, o.order_status, o.total_amount, o.order_channel, o.ordered_at,
              COUNT(od.detail_id)::int AS item_count
       FROM "order" o
       LEFT JOIN order_detail od ON od.order_id = o.order_id
       WHERE o.customer_id = $1
         AND EXISTS (SELECT 1 FROM customer c WHERE c.customer_id=o.customer_id AND c.deleted_at IS NULL)
       GROUP BY o.order_id
       ORDER BY o.ordered_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
