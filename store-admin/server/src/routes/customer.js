import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/customers – danh sách khách hàng (có lọc / tìm kiếm / phân trang)
router.get('/', async (req, res) => {
  try {
    const { search, tier, gender, page = 1, limit = 20 } = req.query;
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
      `SELECT interest FROM customer_interest WHERE customer_id=$1`,
      [req.params.id]
    );
    res.json({ ...rows[0], interests: interests.map(r => r.interest) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/customers – thêm khách hàng mới
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { full_name, gender, date_of_birth, phone, email, address, interests = [] } = req.body;

    const { rows } = await client.query(
      `INSERT INTO customer (full_name, gender, date_of_birth, phone, email, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [full_name, gender, date_of_birth, phone, email, address]
    );
    const customer = rows[0];

    if (interests.length) {
      const interestValues = interests.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO customer_interest (customer_id, interest) VALUES ${interestValues}`,
        [customer.customer_id, ...interests]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(customer);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/customers/:id – cập nhật thông tin
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { full_name, gender, date_of_birth, phone, email, address, interests = [] } = req.body;

    const { rows } = await client.query(
      `UPDATE customer
       SET full_name=$1, gender=$2, date_of_birth=$3, phone=$4,
           email=$5, address=$6, updated_at=NOW()
       WHERE customer_id=$7 RETURNING *`,
      [full_name, gender, date_of_birth, phone, email, address, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khách hàng' });

    // Cập nhật sở thích
    await client.query(`DELETE FROM customer_interest WHERE customer_id=$1`, [req.params.id]);
    if (interests.length) {
      const vals = interests.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO customer_interest (customer_id, interest) VALUES ${vals}`,
        [req.params.id, ...interests]
      );
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
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
    }
    res.json({ message: 'Đã khóa tài khoản khách hàng' });
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
