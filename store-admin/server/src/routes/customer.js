import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

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
      conditions.push(`c.customer_tier = $${params.length}`);
    }
    if (gender) {
      params.push(gender);
      conditions.push(`c.gender = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, a.username, a.status AS account_status,
              EXTRACT(YEAR FROM AGE(c.date_of_birth))::int AS age
       FROM customer c
       LEFT JOIN account a ON a.account_id = c.account_id
       WHERE c.customer_id = $1`,
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
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150
    || !Array.isArray(interests) || interests.length > 20
    || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Thông tin khách hàng hoặc danh sách sở thích không hợp lệ.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO customer (full_name, gender, date_of_birth, phone, email, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [full_name, gender, date_of_birth, phone, email, address]
    );
    const customer = rows[0];

    if (Array.isArray(interests)) {
      for (const interestName of [...new Set(interests)]) {
        await client.query(
          `INSERT INTO customer_interest (customer_id, interest_id)
           SELECT $1, interest_id FROM interest WHERE interest_name = $2
           ON CONFLICT DO NOTHING`,
          [customer.customer_id, interestName],
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(customer);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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
  if (typeof full_name !== 'string' || !full_name.trim() || full_name.trim().length > 150
    || !Array.isArray(interests) || interests.length > 20
    || interests.some((name) => typeof name !== 'string' || name.length > 100)) {
    return res.status(400).json({ message: 'Thông tin khách hàng hoặc danh sách sở thích không hợp lệ.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE customer
       SET full_name=$1, gender=$2, date_of_birth=$3, phone=$4,
           email=$5, address=$6, updated_at=NOW()
       WHERE customer_id=$7 RETURNING *`,
      [full_name, gender, date_of_birth, phone, email, address, req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    // Cập nhật sở thích
    await client.query(`DELETE FROM customer_interest WHERE customer_id=$1`, [req.params.id]);
    if (Array.isArray(interests)) {
      for (const interestName of [...new Set(interests)]) {
        await client.query(
          `INSERT INTO customer_interest (customer_id, interest_id)
           SELECT $1, interest_id FROM interest WHERE interest_name = $2
           ON CONFLICT DO NOTHING`,
          [req.params.id, interestName],
        );
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '22P02' || err.code === '22007' || err.code === '23514') {
      return res.status(400).json({ message: 'Ngày sinh, giới tính hoặc thông tin khách hàng không hợp lệ.' });
    }
    return res.status(500).json({ message: 'Không thể cập nhật khách hàng.' });
  } finally {
    client.release();
  }
});

// PATCH /api/customers/:id/tier – cập nhật hạng khách hàng
router.patch('/:id/tier', async (req, res) => {
  try {
    const { tier } = req.body;
    const { rows } = await pool.query(
      `UPDATE customer SET customer_tier=$1, updated_at=NOW()
       WHERE customer_id=$2 RETURNING customer_id, full_name, customer_tier`,
      [tier, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/customers/:id – soft delete qua account status
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT account_id FROM customer WHERE customer_id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });

    if (rows[0].account_id) {
      await pool.query(
        `UPDATE account SET status='Blocked', updated_at=NOW() WHERE account_id=$1`,
        [rows[0].account_id]
      );
    } else {
      await pool.query('DELETE FROM customer WHERE customer_id=$1', [req.params.id]);
    }
    res.json({ message: rows[0].account_id ? 'Đã khóa tài khoản khách hàng' : 'Đã xóa hồ sơ khách hàng' });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
       GROUP BY o.order_id
       ORDER BY o.ordered_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/customers/stats/overview – thống kê CRM
router.get('/stats/overview', async (_req, res) => {
  try {
    const [tierStats, genderStats, ageStats] = await Promise.all([
      pool.query(
        `SELECT customer_tier, COUNT(*)::int AS count
         FROM customer GROUP BY customer_tier ORDER BY count DESC`
      ),
      pool.query(
        `SELECT gender, COUNT(*)::int AS count
         FROM customer GROUP BY gender`
      ),
      pool.query(
        `SELECT
           CASE
             WHEN age < 18            THEN 'Dưới 18'
             WHEN age BETWEEN 18 AND 22 THEN '18-22'
             WHEN age BETWEEN 23 AND 30 THEN '23-30'
             WHEN age BETWEEN 31 AND 40 THEN '31-40'
             ELSE 'Trên 40'
           END AS age_group,
           COUNT(*)::int AS count
         FROM (
           SELECT EXTRACT(YEAR FROM AGE(date_of_birth))::int AS age
           FROM customer WHERE date_of_birth IS NOT NULL
         ) t
         GROUP BY age_group ORDER BY age_group`
      ),
    ]);

    res.json({
      byTier:   tierStats.rows,
      byGender: genderStats.rows,
      byAge:    ageStats.rows,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
