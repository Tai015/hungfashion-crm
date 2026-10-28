import { Router } from 'express';
import {
  applySale,
  calcOrderTotals,
  canTransitionOrderStatus,
  isOrderStatus,
} from '../domain/index.js';
import { pool } from '../db.js';

const router = Router();
const CUSTOMER_PAYMENT_METHODS = new Set(['Cash', 'BankTransfer']);

function getVietQrConfig() {
  const bankId = process.env.VIETQR_BANK_ID?.trim();
  const accountNumber = process.env.VIETQR_ACCOUNT_NUMBER?.trim();
  const accountName = process.env.VIETQR_ACCOUNT_NAME?.trim();
  if (!/^\d{6}$/.test(bankId || '')
    || !/^\d{6,20}$/.test(accountNumber || '')
    || !accountName || accountName.length > 100) {
    return null;
  }
  return { bankId, accountNumber, accountName };
}

function paymentInstructions(orderId, amount) {
  const config = getVietQrConfig();
  if (!config) return null;
  const transferContent = `HF${orderId}`;
  const qrUrl = new URL(
    `https://img.vietqr.io/image/${config.bankId}-${config.accountNumber}-compact2.png`,
  );
  qrUrl.searchParams.set('amount', String(Math.round(Number(amount))));
  qrUrl.searchParams.set('addInfo', transferContent);
  qrUrl.searchParams.set('accountName', config.accountName);
  return {
    bank_id: config.bankId,
    account_number: config.accountNumber,
    account_name: config.accountName,
    transfer_content: transferContent,
    amount: Number(amount),
    qr_url: qrUrl.toString(),
  };
}

// GET /api/orders/mine – khách hàng xem đơn của mình
router.get('/mine', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1
      || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (pageNumber - 1) * pageSize;

    const { rows } = await pool.query(
      `SELECT o.order_id, o.order_status, o.order_channel,
              o.subtotal, o.discount_amt, o.total_amount,
              o.ordered_at, o.note,
              p.code AS promo_code
       FROM "order" o
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       WHERE o.customer_id = $1
       ORDER BY o.ordered_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.customer_id, pageSize, offset]
    );
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "order" WHERE customer_id = $1`,
      [req.user.customer_id]
    );
    res.json({ data: rows, total: countRows[0].total, page: pageNumber, limit: pageSize });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/mine/:id – chi tiết đơn hàng của khách
router.get('/mine/:id', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { rows: orderRows } = await pool.query(
      `SELECT o.*, p.code AS promo_code
       FROM "order" o
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       WHERE o.order_id = $1 AND o.customer_id = $2`,
      [req.params.id, req.user.customer_id]
    );
    if (!orderRows.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });

    const { rows: details } = await pool.query(
      `SELECT od.detail_id, od.quantity, od.unit_price, od.subtotal,
              pv.sku, p.product_name, p.image_url,
              s.size_name, co.color_name
       FROM order_detail od
       JOIN product_variant pv ON pv.variant_id = od.variant_id
       JOIN product p  ON p.product_id = pv.product_id
       JOIN size s     ON s.size_id    = pv.size_id
       JOIN color co   ON co.color_id  = pv.color_id
       WHERE od.order_id = $1`,
      [req.params.id]
    );
    const { rows: payment } = await pool.query(
      `SELECT * FROM payment WHERE order_id = $1`, [req.params.id]
    );
    const paymentDetails = payment[0] || null;
    if (paymentDetails?.method === 'BankTransfer' && paymentDetails.status === 'Pending') {
      paymentDetails.payment_instructions = paymentInstructions(
        orderRows[0].order_id,
        paymentDetails.amount,
      );
    }
    res.json({ ...orderRows[0], details, payment: paymentDetails });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders – danh sách đơn hàng (nhân viên / admin)
// GET /api/orders/customers – tra cứu khách để tạo đơn tại quầy
router.get('/customers', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search.length > 100) {
      return res.status(400).json({ message: 'Từ khóa tìm khách hàng tối đa 100 ký tự.' });
    }
    const term = `%${search}%`;
    const { rows } = await pool.query(
      `SELECT customer_id, full_name, phone, email
       FROM customer
       WHERE $1 = '%%' OR full_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
       ORDER BY full_name
       LIMIT 20`,
      [term]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Không thể tìm khách hàng.' });
  }
});

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
              p.code AS promo_code,
              pay.method AS payment_method, pay.status AS payment_status
       FROM "order" o
       LEFT JOIN customer c  ON c.customer_id = o.customer_id
       LEFT JOIN employee e  ON e.employee_id = o.employee_id
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       LEFT JOIN payment pay ON pay.order_id = o.order_id
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

// GET /api/orders/:id – chi tiết đơn hàng (nhân viên / admin)
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
  const body = req.body || {};
  const isCustomer = req.user.role_name === 'KHACH_HANG';
  const payment_method = body.payment_method || 'Cash';
  if (isCustomer && !req.user.customer_id) {
    return res.status(403).json({ message: 'Tài khoản chưa liên kết hồ sơ khách hàng.' });
  }
  if (isCustomer && !CUSTOMER_PAYMENT_METHODS.has(payment_method)) {
    return res.status(400).json({ message: 'Khách hàng chỉ có thể chọn tiền mặt hoặc chuyển khoản QR.' });
  }
  if (payment_method === 'BankTransfer' && !getVietQrConfig()) {
    return res.status(503).json({ message: 'Chưa cấu hình tài khoản nhận chuyển khoản QR trên máy chủ.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      promotion_id,
      order_channel = 'Website',
      note,
      shipping_address,
      items = [],
    } = body;

    // Với KHACH_HANG: customer_id bắt buộc lấy từ session (chống giả mạo)
    const customer_id = isCustomer
      ? req.user.customer_id
      : (body.customer_id || null);

    const paymentMethods = new Set(['Cash', 'BankTransfer', 'Momo', 'VNPay', 'ZaloPay']);
    if (!Array.isArray(items) || items.length < 1 || items.length > 100
      || items.some((item) => !Number.isInteger(Number(item.variant_id))
        || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)
      || new Set(items.map((item) => Number(item.variant_id))).size !== items.length
      || !['InStore', 'Website', 'Online'].includes(order_channel)
      || !paymentMethods.has(payment_method)
      || (isCustomer && (order_channel !== 'Website'
        || typeof shipping_address !== 'string'
        || !shipping_address.trim()
        || shipping_address.trim().length > 500))) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: isCustomer
          ? 'Địa chỉ giao hàng, kênh bán, phương thức thanh toán hoặc danh sách sản phẩm không hợp lệ.'
          : 'Kênh bán, phương thức thanh toán hoặc danh sách sản phẩm không hợp lệ.',
      });
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
         AND (usage_limit IS NULL OR used_count < usage_limit)
         FOR UPDATE`,
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
    if (payment_method === 'BankTransfer' && !Number.isInteger(total_amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Tổng tiền chuyển khoản QR phải là số nguyên đồng.' });
    }

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

    const { rows } = await client.query(
      `INSERT INTO "order" (customer_id, employee_id, promotion_id, order_channel,
                            subtotal, discount_amt, total_amount, note, shipping_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        customer_id,
        req.user.role_name !== 'KHACH_HANG' ? (req.user.employee_id || null) : null,
        promotion_id || null,
        order_channel,
        subtotal,
        discount_amt,
        total_amount,
        note || null,
        typeof shipping_address === 'string' ? shipping_address.trim() || null : null,
      ]
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

    await client.query(
      `INSERT INTO payment (order_id, method, amount) VALUES ($1,$2,$3)`,
      [order.order_id, payment_method, total_amount]
    );

    await client.query('COMMIT');
    const instructions = payment_method === 'BankTransfer'
      ? paymentInstructions(order.order_id, order.total_amount)
      : null;
    res.status(201).json({
      ...order,
      payment_method,
      payment: { method: payment_method, status: 'Pending', amount: order.total_amount },
      payment_instructions: instructions,
    });
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

// PATCH /api/orders/:id/status – cập nhật trạng thái đơn
router.patch('/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { status } = req.body;
    if (!isOrderStatus(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Trạng thái đơn hàng không hợp lệ' });
    }

    const { rows: orderRows } = await client.query(
      `SELECT customer_id, order_status FROM "order" WHERE order_id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!orderRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }

    const currentStatus = orderRows[0].order_status;
    if (req.user.role_name === 'KHACH_HANG') {
      if (status !== 'Cancelled') {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Khách hàng chỉ có thể hủy đơn hàng.' });
      }
      if (orderRows[0].customer_id !== req.user.customer_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Bạn không có quyền hủy đơn hàng này.' });
      }
      if (currentStatus !== 'Pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `Chỉ có thể hủy đơn khi đang ở trạng thái "Chờ xác nhận". Trạng thái hiện tại: ${currentStatus}.`,
        });
      }
    }

    if (!canTransitionOrderStatus(currentStatus, status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Không thể chuyển từ ${currentStatus} sang ${status}`,
        currentStatus,
        requestedStatus: status,
      });
    }

    if (status === 'Cancelled') {
      const { rows: details } = await client.query(
        `SELECT variant_id, quantity FROM order_detail WHERE order_id = $1`,
        [req.params.id]
      );
      for (const detail of details) {
        await client.query(
          `UPDATE product_variant SET quantity = quantity + $1 WHERE variant_id = $2`,
          [detail.quantity, detail.variant_id]
        );
      }
      await client.query(
        `UPDATE payment SET status='Failed'
         WHERE order_id=$1 AND status='Pending'`,
        [req.params.id]
      );
    }

    const { rows } = await client.query(
      `UPDATE "order" SET order_status=$1, updated_at=NOW()
       WHERE order_id=$2 RETURNING order_id, order_status`,
      [status, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ message: 'Không thể cập nhật trạng thái đơn hàng.' });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/payment – cập nhật trạng thái thanh toán
router.patch('/:id/payment', async (req, res) => {
  try {
    const { status, transaction_ref } = req.body;
    if (!['Pending', 'Paid', 'Failed', 'Refunded'].includes(status)
      || (transaction_ref != null
        && (typeof transaction_ref !== 'string' || transaction_ref.trim().length > 200))) {
      return res.status(400).json({ message: 'Trạng thái hoặc mã giao dịch thanh toán không hợp lệ.' });
    }
    const paid_at = status === 'Paid' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE payment
       SET status=$1, transaction_ref=$2, paid_at=${paid_at}
       WHERE order_id=$3 RETURNING *`,
      [status, transaction_ref?.trim() || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy thanh toán' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
