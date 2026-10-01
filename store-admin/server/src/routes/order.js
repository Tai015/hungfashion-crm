import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/orders – danh sách đơn hàng
router.get('/', async (req, res) => {
  try {
    const { status, channel, customer_id, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`o.order_status = $${params.length}`);
    }
    if (channel) {
      params.push(channel);
      conditions.push(`o.order_channel = $${params.length}`);
    }
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`o.customer_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`o.ordered_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`o.ordered_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT o.order_id, o.order_status, o.order_channel,
              o.subtotal, o.discount_amt, o.total_amount, o.ordered_at,
              c.full_name AS customer_name, c.phone AS customer_phone,
              e.full_name AS employee_name,
              p.code AS promo_code
       FROM "order" o
       LEFT JOIN customer c  ON c.customer_id = o.customer_id
       LEFT JOIN employee e  ON e.employee_id = o.employee_id
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       ${where}
       ORDER BY o.ordered_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "order" o ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/:id – chi tiết đơn hàng
router.get('/:id', async (req, res) => {
  try {
    const { rows: order } = await pool.query(
      `SELECT o.*, c.full_name AS customer_name, c.phone AS customer_phone,
              e.full_name AS employee_name, pr.code AS promo_code
       FROM "order" o
       LEFT JOIN customer c  ON c.customer_id = o.customer_id
       LEFT JOIN employee e  ON e.employee_id = o.employee_id
       LEFT JOIN promotion pr ON pr.promotion_id = o.promotion_id
       WHERE o.order_id = $1`,
      [req.params.id]
    );
    if (!order.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const { rows: details } = await pool.query(
      `SELECT od.detail_id, od.quantity, od.unit_price, od.subtotal,
              pv.sku, p.product_name, p.image_url,
              s.size_name, co.color_name
       FROM order_detail od
       JOIN product_variant pv ON pv.variant_id = od.variant_id
       JOIN product p  ON p.product_id = pv.product_id
       JOIN size s     ON s.size_id = pv.size_id
       JOIN color co   ON co.color_id = pv.color_id
       WHERE od.order_id = $1`,
      [req.params.id]
    );

    const { rows: payment } = await pool.query(
      `SELECT * FROM payment WHERE order_id = $1`, [req.params.id]
    );

    res.json({ ...order[0], details, payment: payment[0] || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/orders – tạo đơn hàng mới
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      customer_id, employee_id, promotion_id,
      order_channel = 'InStore', note,
      items = [],         // [{ variant_id, quantity, unit_price }]
      payment_method = 'Cash',
    } = req.body;

    // Tính tiền
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    let discount_amt = 0;

    if (promotion_id) {
      const { rows: promo } = await client.query(
        `SELECT * FROM promotion WHERE promotion_id=$1 AND is_active=TRUE
         AND CURRENT_DATE BETWEEN start_date AND end_date`,
        [promotion_id]
      );
      if (promo.length) {
        const p = promo[0];
        if (subtotal >= p.min_order) {
          discount_amt = p.promo_type === 'Percent'
            ? subtotal * p.value / 100
            : p.value;
          if (p.max_discount) discount_amt = Math.min(discount_amt, p.max_discount);
          // Cập nhật lượt dùng
          await client.query(
            `UPDATE promotion SET used_count = used_count + 1 WHERE promotion_id = $1`,
            [promotion_id]
          );
          // Đánh dấu user_promotion đã dùng
          if (customer_id) {
            await client.query(
              `UPDATE user_promotion SET status='Used', used_at=NOW()
               WHERE customer_id=$1 AND promotion_id=$2`,
              [customer_id, promotion_id]
            );
          }
        }
      }
    }

    const total_amount = Math.max(subtotal - discount_amt, 0);

    // Tạo đơn
    const { rows } = await client.query(
      `INSERT INTO "order" (customer_id, employee_id, promotion_id, order_channel,
                            subtotal, discount_amt, total_amount, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [customer_id, employee_id, promotion_id, order_channel,
       subtotal, discount_amt, total_amount, note]
    );
    const order = rows[0];

    // Thêm chi tiết + trừ kho
    for (const item of items) {
      await client.query(
        `INSERT INTO order_detail (order_id, variant_id, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [order.order_id, item.variant_id, item.quantity, item.unit_price]
      );
      await client.query(
        `UPDATE product_variant SET quantity = quantity - $1
         WHERE variant_id = $2 AND quantity >= $1`,
        [item.quantity, item.variant_id]
      );
    }

    // Tạo bản ghi thanh toán
    await client.query(
      `INSERT INTO payment (order_id, method, amount) VALUES ($1,$2,$3)`,
      [order.order_id, payment_method, total_amount]
    );

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status – cập nhật trạng thái đơn
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE "order" SET order_status=$1, updated_at=NOW()
       WHERE order_id=$2 RETURNING order_id, order_status`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/orders/:id/payment – cập nhật trạng thái thanh toán
router.patch('/:id/payment', async (req, res) => {
  try {
    const { status, transaction_ref } = req.body;
    const paid_at = status === 'Paid' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE payment
       SET status=$1, transaction_ref=$2, paid_at=${paid_at}
       WHERE order_id=$3 RETURNING *`,
      [status, transaction_ref, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy thanh toán' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
