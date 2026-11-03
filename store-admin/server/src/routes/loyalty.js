import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/me', async (req, res) => {
  const customerId = req.user.customer_id;
  if (!customerId) return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });

  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
  }

  try {
    const { rows: [customer] } = await pool.query(
      'SELECT loyalty_point, customer_tier FROM customer WHERE customer_id = $1',
      [customerId],
    );
    if (!customer) return res.status(404).json({ message: 'Không tìm thấy hồ sơ khách hàng.' });

    const offset = (page - 1) * limit;
    const [{ rows: history }, { rows: [count] }] = await Promise.all([
      pool.query(
        `SELECT loyalty_transaction_id, transaction_type, points_delta, balance_after, note, created_at
         FROM loyalty_point_transaction
         WHERE customer_id = $1
         ORDER BY created_at DESC, loyalty_transaction_id DESC
         LIMIT $2 OFFSET $3`,
        [customerId, limit, offset],
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM loyalty_point_transaction WHERE customer_id = $1', [customerId]),
    ]);

    res.json({
      balance: customer.loyalty_point,
      tier: customer.customer_tier,
      history,
      total: count.total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ message: 'Không thể tải thông tin điểm thưởng.' });
  }
});

export default router;
