import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/feedbacks – danh sách phản hồi
router.get('/', async (req, res) => {
  try {
    const { status, type, product_id, search } = req.query;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
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
    const { product_id, order_id = null, feedback_type = 'Product', rating, content } = req.body || {};
    if (!req.user.customer_id) return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
    if (feedback_type !== 'Product' && feedback_type !== 'Service' && feedback_type !== 'Suggestion') {
      return res.status(400).json({ message: 'Loại phản hồi không hợp lệ.' });
    }
    if (feedback_type === 'Product' && (!Number.isInteger(Number(product_id)) || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
      return res.status(400).json({ message: 'Phản hồi sản phẩm cần chọn sản phẩm và số sao từ 1 đến 5.' });
    }
    if (product_id != null && (!Number.isInteger(Number(product_id)) || Number(product_id) < 1)
      || order_id != null && (!Number.isInteger(Number(order_id)) || Number(order_id) < 1)) {
      return res.status(400).json({ message: 'Sản phẩm hoặc đơn hàng không hợp lệ.' });
    }
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
      return res.status(400).json({ message: 'Nội dung phản hồi là bắt buộc và tối đa 5000 ký tự.' });
    }
    if (order_id != null) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM "order" WHERE order_id=$1 AND customer_id=$2`,
        [order_id, req.user.customer_id],
      );
      if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn hàng của tài khoản.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO feedback (customer_id, product_id, order_id, feedback_type, rating, content)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.customer_id, product_id || null, order_id, feedback_type, rating || null, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/feedbacks/:id/reply – nhân viên phản hồi
router.patch('/:id/reply', async (req, res) => {
  try {
    const { reply } = req.body || {};
    if (typeof reply !== 'string' || !reply.trim() || reply.trim().length > 5000) {
      return res.status(400).json({ message: 'Nội dung trả lời là bắt buộc và tối đa 5000 ký tự.' });
    }
    const { rows } = await pool.query(
      `UPDATE feedback
       SET reply=$1, employee_id=$2, status='Resolved', replied_at=NOW()
       WHERE feedback_id=$3 RETURNING *`,
      [reply.trim(), req.user.employee_id || null, req.params.id]
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
    if (!['New', 'Processing', 'Resolved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái phản hồi không hợp lệ.' });
    }
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
