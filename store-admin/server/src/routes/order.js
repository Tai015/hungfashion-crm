import { Router } from 'express';
import {
  applySale,
  calcOrderTotals,
  canTransitionOrderStatus,
  isOrderStatus,
} from '../domain/index.js';
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
      customer_id, promotion_id,
      order_channel = 'InStore', note,
      items = [],
      payment_method = 'Cash',
    } = req.body || {};
    const paymentMethods = new Set(['Cash', 'BankTransfer', 'Momo', 'VNPay', 'ZaloPay']);
    if (!Array.isArray(items) || items.length < 1 || items.length > 100
      || items.some((item) => !Number.isInteger(Number(item.variant_id))
        || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)
      || new Set(items.map((item) => Number(item.variant_id))).size !== items.length
      || !['InStore', 'Website', 'Online'].includes(order_channel)
      || !paymentMethods.has(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Kênh bán, phương thức thanh toán hoặc danh sách sản phẩm không hợp lệ.' });
    }

    const pricedItems = [];
    for (const item of items) {
      const { rows } = await client.query(
        `SELECT pv.variant_id, pv.quantity, p.selling_price
         FROM product_variant pv
         JOIN product p ON p.product_id = pv.product_id
         WHERE pv.variant_id = $1 AND p.is_active = TRUE
         FOR UPDATE OF pv`,
        [item.variant_id],
      );
      if (!rows.length) {
        const error = new Error(`Không tìm thấy biến thể sản phẩm #${item.variant_id}.`);
        error.statusCode = 404;
        throw error;
      }
      const pricedItem = {
        variantId: Number(item.variant_id),
        quantity: Number(item.quantity),
        unitPrice: Number(rows[0].selling_price),
        stock: Number(rows[0].quantity),
      };
      const sale = applySale(pricedItem.stock, pricedItem.quantity);
      if (!sale.applied) {
        const error = new Error(`Không đủ tồn kho cho biến thể #${item.variant_id}.`);
        error.statusCode = 409;
        throw error;
      }
      pricedItems.push({ ...pricedItem, newStock: sale.newQty });
    }

    let promotions = [];
    if (promotion_id) {
      const { rows: promo } = await client.query(
        `SELECT * FROM promotion WHERE promotion_id=$1 AND is_active=TRUE
         AND CURRENT_DATE BETWEEN start_date AND end_date
         AND (usage_limit IS NULL OR used_count < usage_limit)`,
        [promotion_id]
      );
      if (!promo.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Mã khuyến mãi không tồn tại, đã hết hạn hoặc đã hết lượt sử dụng.' });
      }
      const p = promo[0];
      promotions = [{
        promoType: p.promo_type,
        value: Number(p.value),
        minOrder: Number(p.min_order),
        maxDiscount: p.max_discount === null ? null : Number(p.max_discount),
      }];
    }

    const { subtotal, discountAmt: discount_amt, totalAmount: total_amount } =
      calcOrderTotals(pricedItems, promotions);

    if (promotion_id && discount_amt > 0) {
      await client.query(
        `UPDATE promotion SET used_count = used_count + 1 WHERE promotion_id = $1`,
        [promotion_id]
      );
      if (customer_id) {
        await client.query(
          `UPDATE user_promotion SET status='Used', used_at=NOW()
           WHERE customer_id=$1 AND promotion_id=$2`,
          [customer_id, promotion_id]
        );
      }
    }

    // Tạo đơn
    const { rows } = await client.query(
      `INSERT INTO "order" (customer_id, employee_id, promotion_id, order_channel,
                            subtotal, discount_amt, total_amount, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [customer_id, req.user.employee_id || null, promotion_id, order_channel,
       subtotal, discount_amt, total_amount, note]
    );
    const order = rows[0];

    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_detail (order_id, variant_id, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [order.order_id, item.variantId, item.quantity, item.unitPrice]
      );
      await client.query(
        `UPDATE product_variant SET quantity = $1 WHERE variant_id = $2`,
        [item.newStock, item.variantId]
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
    await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.code === '22P02' || err.code === '23514' || err.code === '22007') {
      return res.status(400).json({ message: 'Thông tin đơn hàng không hợp lệ.' });
    }
    return res.status(500).json({ message: 'Không thể tạo đơn hàng.' });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status – cập nhật trạng thái đơn (có kiểm tra state machine)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!isOrderStatus(status)) {
      return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ' });
    }

    const { rows: currentRows } = await pool.query(
      `SELECT order_status FROM "order" WHERE order_id = $1`,
      [req.params.id]
    );
    if (!currentRows.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const currentStatus = currentRows[0].order_status;
    if (!canTransitionOrderStatus(currentStatus, status)) {
      return res.status(409).json({
        message: `Không thể chuyển từ ${currentStatus} sang ${status}`,
        currentStatus,
        requestedStatus: status,
      });
    }

    const { rows } = await pool.query(
      `UPDATE "order" SET order_status=$1, updated_at=NOW()
       WHERE order_id=$2 RETURNING order_id, order_status`,
      [status, req.params.id]
    );
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
