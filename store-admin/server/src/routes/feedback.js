import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/feedbacks – danh sách phản hồi
router.get('/', async (req, res) => {
  try {
    const { status, type, product_id, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`f.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`f.feedback_type = $${params.length}`);
    }
    if (product_id) {
      params.push(product_id);
      conditions.push(`f.product_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.full_name ILIKE $${params.length} OR f.content ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT f.feedback_id, f.feedback_type, f.rating, f.content,
              f.reply, f.status, f.created_at, f.replied_at,
              c.full_name AS customer_name, c.phone AS customer_phone,
              p.product_name,
              e.full_name AS replied_by
       FROM feedback f
       LEFT JOIN customer c  ON c.customer_id = f.customer_id
       LEFT JOIN product p   ON p.product_id = f.product_id
       LEFT JOIN employee e  ON e.employee_id = f.employee_id
       ${where}
       ORDER BY f.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM feedback f
       LEFT JOIN customer c ON c.customer_id = f.customer_id
       ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/feedbacks/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, c.full_name AS customer_name, p.product_name,
              o.order_id, e.full_name AS replied_by
       FROM feedback f
       LEFT JOIN customer c ON c.customer_id = f.customer_id
       LEFT JOIN product p  ON p.product_id = f.product_id
       LEFT JOIN "order" o  ON o.order_id = f.order_id
       LEFT JOIN employee e ON e.employee_id = f.employee_id
       WHERE f.feedback_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/feedbacks – khách hàng gửi phản hồi
router.post('/', async (req, res) => {
  try {
    const { customer_id, product_id, order_id, feedback_type = 'Product', rating, content } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO feedback (customer_id, product_id, order_id, feedback_type, rating, content)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [customer_id, product_id, order_id, feedback_type, rating, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/feedbacks/:id/reply – nhân viên phản hồi
router.patch('/:id/reply', async (req, res) => {
  try {
    const { reply, employee_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE feedback
       SET reply=$1, employee_id=$2, status='Resolved', replied_at=NOW()
       WHERE feedback_id=$3 RETURNING *`,
      [reply, employee_id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/feedbacks/:id/status – cập nhật trạng thái
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE feedback SET status=$1 WHERE feedback_id=$2 RETURNING feedback_id, status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy phản hồi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/feedbacks/stats/rating – thống kê đánh giá
router.get('/stats/rating', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rating, COUNT(*)::int AS count
       FROM feedback WHERE rating IS NOT NULL
       GROUP BY rating ORDER BY rating DESC`
    );
    const avg = rows.reduce((s, r) => s + r.rating * r.count, 0)
                / (rows.reduce((s, r) => s + r.count, 0) || 1);

    res.json({ distribution: rows, average: Number(avg.toFixed(2)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
