import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ── PROMOTIONS ────────────────────────────────────────────

// GET /api/promotions
router.get('/', async (req, res) => {
  try {
    const { active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    if (active === 'true') {
      conditions.push(`p.is_active = TRUE AND CURRENT_DATE BETWEEN p.start_date AND p.end_date`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT p.*, e.full_name AS created_by_name
       FROM promotion p
       LEFT JOIN employee e ON e.employee_id = p.created_by
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/promotions/validate/:code – kiểm tra mã giảm giá
router.get('/validate/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM promotion
       WHERE code = $1 AND is_active = TRUE
         AND CURRENT_DATE BETWEEN start_date AND end_date
         AND (usage_limit IS NULL OR used_count < usage_limit)`,
      [req.params.code]
    );
    if (!rows.length) return res.status(404).json({ message: 'Mã không hợp lệ hoặc đã hết hạn' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/promotions – tạo chương trình khuyến mãi
router.post('/', async (req, res) => {
  try {
    const {
      code, name, promo_type, value, min_order = 0,
      max_discount, usage_limit, start_date, end_date, created_by,
    } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO promotion
         (code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date, created_by]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Mã khuyến mãi đã tồn tại' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/promotions/:id – cập nhật / tắt khuyến mãi
router.patch('/:id', async (req, res) => {
  try {
    const { is_active, end_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE promotion SET is_active=$1, end_date=COALESCE($2, end_date)
       WHERE promotion_id=$3 RETURNING *`,
      [is_active, end_date, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── USER PROMOTIONS ───────────────────────────────────────

// GET /api/promotions/user/:customerId – danh sách mã của khách
router.get('/user/:customerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT up.*, p.code, p.name, p.promo_type, p.value,
              p.min_order, p.end_date
       FROM user_promotion up
       JOIN promotion p ON p.promotion_id = up.promotion_id
       WHERE up.customer_id = $1
       ORDER BY up.assigned_at DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/promotions/assign – gán mã cho khách hàng
router.post('/assign', async (req, res) => {
  try {
    const { customer_ids = [], promotion_id } = req.body;
    if (!customer_ids.length) return res.status(400).json({ message: 'Cần ít nhất 1 khách hàng' });

    const values = customer_ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = customer_ids.flatMap(id => [id, promotion_id]);

    await pool.query(
      `INSERT INTO user_promotion (customer_id, promotion_id)
       VALUES ${values}
       ON CONFLICT (customer_id, promotion_id) DO NOTHING`,
      params
    );
    res.json({ message: `Đã gán mã cho ${customer_ids.length} khách hàng` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
