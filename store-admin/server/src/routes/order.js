import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import {
  applySale,
  calcOrderTotals,
  calcPointsEarned,
  calcPointsRedemptionDiscount,
  canTransitionOrderStatus,
  isOrderStatus,
} from '../domain/index.js';
import { pool } from '../db.js';

const router = Router();
const CUSTOMER_PAYMENT_METHODS = new Set(['Cash', 'BankTransfer']);
const BANK_TRANSFER_TTL_MINUTES = 10;
const DEMO_PAYMENT_TTL_MINUTES = 15;
const paymentTtlMinutes = () => process.env.DEMO_PAYMENT === 'true'
  ? DEMO_PAYMENT_TTL_MINUTES : BANK_TRANSFER_TTL_MINUTES;

async function addLoyaltyTransaction(client, { customerId, orderId, type, delta, note }) {
  const { rows: existing } = await client.query(
    `SELECT loyalty_transaction_id FROM loyalty_point_transaction
     WHERE order_id = $1 AND transaction_type = $2`,
    [orderId, type],
  );
  if (existing.length) return null;

  const { rows: customerRows } = await client.query(
    'UPDATE customer SET loyalty_point = loyalty_point + $1 WHERE customer_id = $2 RETURNING loyalty_point',
    [delta, customerId],
  );
  if (!customerRows.length) throw new Error('Không tìm thấy hồ sơ khách hàng để cập nhật điểm.');
  const balance = customerRows[0].loyalty_point;
  await client.query(
    `INSERT INTO loyalty_point_transaction
       (customer_id, order_id, transaction_type, points_delta, balance_after, note)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [customerId, orderId, type, delta, balance, note || null],
  );
  return balance;
}

async function reverseOrderLoyalty(client, customerId, orderId) {
  if (!customerId) return;
  const { rows: entries } = await client.query(
    `SELECT transaction_type, points_delta FROM loyalty_point_transaction
     WHERE order_id = $1 AND transaction_type IN ('Earned', 'Redeemed')`,
    [orderId],
  );
  for (const entry of entries) {
    if (entry.transaction_type === 'Earned' && entry.points_delta > 0) {
      await addLoyaltyTransaction(client, {
        customerId, orderId, type: 'EarnReversed', delta: -entry.points_delta,
        note: 'Thu hồi điểm tích lũy do đơn hàng bị hủy/hoàn tiền',
      });
    }
    if (entry.transaction_type === 'Redeemed' && entry.points_delta < 0) {
      await addLoyaltyTransaction(client, {
        customerId, orderId, type: 'RedeemedReturned', delta: -entry.points_delta,
        note: 'Hoàn lại điểm đã dùng cho đơn hàng bị hủy/hoàn tiền',
      });
    }
  }
}

async function expirePendingBankTransfers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: expiredOrders } = await client.query(
      `SELECT o.order_id, o.customer_id
       FROM "order" o
       JOIN payment p ON p.order_id = o.order_id
       WHERE o.order_status = 'Pending'
         AND p.method = 'BankTransfer' AND p.status IN ('Pending', 'Failed')
         AND o.ordered_at <= NOW() - ($1 * INTERVAL '1 minute')
       ORDER BY o.ordered_at
       LIMIT 100
       FOR UPDATE OF o, p SKIP LOCKED`,
      [paymentTtlMinutes()],
    );

    for (const order of expiredOrders) {
      const { rows: details } = await client.query(
        `SELECT variant_id, quantity FROM order_detail WHERE order_id = $1`,
        [order.order_id],
      );
      for (const detail of details) {
        await client.query(
          `UPDATE product_variant SET quantity = quantity + $1 WHERE variant_id = $2`,
          [detail.quantity, detail.variant_id],
        );
      }
      await client.query(`UPDATE payment SET status='Failed' WHERE order_id=$1 AND status='Pending'`, [order.order_id]);
      await client.query(`UPDATE "order" SET order_status='Cancelled', updated_at=NOW() WHERE order_id=$1`, [order.order_id]);
      await reverseOrderLoyalty(client, order.customer_id, order.order_id);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const bankTransferExpiryTimer = setInterval(() => {
  expirePendingBankTransfers().catch((error) => {
    console.error('Không thể xử lý đơn chuyển khoản hết hạn:', error.message);
  });
}, 30_000);
bankTransferExpiryTimer.unref?.();

// GET /api/orders/mine – khách hàng xem đơn của mình
router.get('/mine', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { page = 1, limit = 10, status, payment_status: paymentStatus } = req.query;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const { from, to } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1
      || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const orderStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
    const paymentStatuses = ['Pending', 'Paid', 'Failed', 'Refunded'];
    if ((status && !orderStatuses.includes(status))
      || (paymentStatus && !paymentStatuses.includes(paymentStatus))) {
      return res.status(400).json({ message: 'Bộ lọc trạng thái đơn hàng không hợp lệ.' });
    }
    if (search.length > 100) {
      return res.status(400).json({ message: 'Từ khóa tìm kiếm tối đa 100 ký tự.' });
    }
    const isValidDate = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || (from && to && from > to)) {
      return res.status(400).json({ message: 'Khoảng ngày lọc đơn hàng không hợp lệ.' });
    }
    const offset = (pageNumber - 1) * pageSize;
    const conditions = ['o.customer_id = $1'];
    const params = [req.user.customer_id];
    if (status) {
      params.push(status);
      conditions.push(`o.order_status = $${params.length}`);
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      conditions.push(`pay.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      conditions.push(`(o.order_id::text ILIKE ${searchParam}
        OR EXISTS (
          SELECT 1 FROM order_detail od
          JOIN product_variant pv ON pv.variant_id = od.variant_id
          JOIN product pr ON pr.product_id = pv.product_id
          WHERE od.order_id = o.order_id
            AND (pr.product_name ILIKE ${searchParam} OR pv.sku ILIKE ${searchParam})
        ))`);
    }
    if (from) {
      params.push(from);
      conditions.push(`o.ordered_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Bangkok')`);
    }
    if (to) {
      params.push(to);
      conditions.push(`o.ordered_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok')`);
    }
    const where = conditions.join(' AND ');
    params.push(pageSize, offset);

    const { rows } = await pool.query(
      `SELECT o.order_id, o.order_status, o.order_channel,
              o.subtotal, o.discount_amt, o.total_amount,
              o.loyalty_points_redeemed, o.loyalty_discount,
              o.ordered_at, o.note,
              p.code AS promo_code,
              pay.method AS payment_method, pay.status AS payment_status,
              pay.amount AS payment_amount
       FROM "order" o
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       LEFT JOIN payment pay ON pay.order_id = o.order_id
       WHERE ${where}
       ORDER BY o.ordered_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM "order" o LEFT JOIN payment pay ON pay.order_id = o.order_id
       WHERE ${where}`,
      params.slice(0, -2)
    );
    res.json({ data: rows, total: countRows[0].total, page: pageNumber, limit: pageSize });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/orders/mine/:id/demo-payment-token – cấp lại QR cho đơn còn chờ demo
router.post('/mine/:id/demo-payment-token', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  if (process.env.DEMO_PAYMENT !== 'true') return res.sendStatus(404);
  const orderId = Number(req.params.id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({ message: 'Mã đơn hàng không hợp lệ.' });
  }
  let baseUrl;
  try {
    const parsed = new URL(process.env.PUBLIC_BASE_URL?.trim());
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/') throw new Error();
    baseUrl = parsed.origin;
  } catch {
    return res.status(503).json({ message: 'PUBLIC_BASE_URL chưa được cấu hình đúng cho thanh toán demo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query(
      `SELECT o.order_id, o.ordered_at, o.order_status, p.payment_id,
              p.method, p.status AS payment_status
       FROM "order" o JOIN payment p ON p.order_id=o.order_id
       WHERE o.order_id=$1 AND o.customer_id=$2
       FOR UPDATE OF o, p`,
      [orderId, req.user.customer_id],
    );
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }
    if (order.method !== 'BankTransfer' || order.payment_status !== 'Pending'
      || order.order_status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Đơn hàng không còn chờ thanh toán QR.' });
    }

    const paymentExpiresAt = new Date(new Date(order.ordered_at).getTime() + DEMO_PAYMENT_TTL_MINUTES * 60_000);
    if (paymentExpiresAt.getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ message: 'Thời hạn thanh toán của đơn hàng đã hết.' });
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { rows: [tokenRow] } = await client.query(
      `INSERT INTO demo_payment_tokens (order_id, token_hash, expires_at)
       VALUES ($1, $2, LEAST(NOW() + ($3 * INTERVAL '1 minute'), $4::timestamptz))
       ON CONFLICT (order_id) DO UPDATE
         SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at, used_at=NULL
       RETURNING expires_at`,
      [orderId, tokenHash, DEMO_PAYMENT_TTL_MINUTES, paymentExpiresAt.toISOString()],
    );
    await client.query('COMMIT');
    return res.json({
      payment_instructions: { demo_url: `${baseUrl}/pay/demo/${token}` },
      payment_expires_at: tokenRow.expires_at,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Could not issue a demo payment token:', error.message);
    return res.status(500).json({ message: 'Không thể tạo lại mã QR demo.' });
  } finally {
    client.release();
  }
});

// GET /api/orders/mine/:id – chi tiết đơn hàng của khách
router.get('/mine/:id', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chỉ khách hàng mới sử dụng được chức năng này.' });
  }
  try {
    const { rows: orderRows } = await pool.query(
      `SELECT o.*, c.full_name AS customer_name, c.phone AS customer_phone,
              c.email AS customer_email, p.code AS promo_code,
              o.ordered_at + ($2 * INTERVAL '1 minute') AS payment_expires_at
       FROM "order" o
       LEFT JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN promotion p ON p.promotion_id = o.promotion_id
       WHERE o.order_id = $1 AND o.customer_id = $3`,
      [req.params.id, paymentTtlMinutes(), req.user.customer_id]
    );
    if (!orderRows.length) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });

    const { rows: details } = await pool.query(
      `SELECT od.detail_id, od.quantity, od.unit_price, od.subtotal, p.product_id,
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
    res.json({
      ...orderRows[0],
      details,
      payment: paymentDetails,
      demo_payment_enabled: process.env.DEMO_PAYMENT === 'true',
    });
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
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (search.length > 100) {
      return res.status(400).json({ message: 'Từ khóa tìm kiếm tối đa 100 ký tự.' });
    }

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
    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      conditions.push(`(o.order_id::text ILIKE ${searchParam}
        OR c.full_name ILIKE ${searchParam}
        OR c.phone ILIKE ${searchParam}
        OR EXISTS (
          SELECT 1 FROM order_detail od
          JOIN product_variant pv ON pv.variant_id = od.variant_id
          JOIN product pr ON pr.product_id = pv.product_id
          WHERE od.order_id = o.order_id
            AND (pr.product_name ILIKE ${searchParam} OR pv.sku ILIKE ${searchParam})
        ))`);
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
      `SELECT COUNT(*)::int AS total
       FROM "order" o LEFT JOIN customer c ON c.customer_id = o.customer_id
       ${where}`,
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
  const demoPayment = process.env.DEMO_PAYMENT === 'true';
  let demoBaseUrl = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      promotion_id,
      order_channel = 'Website',
      note,
      shipping_address,
      loyalty_points_to_redeem = 0,
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
      || !Number.isInteger(Number(loyalty_points_to_redeem)) || Number(loyalty_points_to_redeem) < 0
      || (Number(loyalty_points_to_redeem) > 0 && Number(loyalty_points_to_redeem) % 10 !== 0)
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
      if (isCustomer) {
        const { rows: assignedPromo } = await client.query(
          `SELECT status FROM user_promotion
           WHERE customer_id=$1 AND promotion_id=$2 FOR UPDATE`,
          [customer_id, promotion_id]
        );
        if (!assignedPromo.length || assignedPromo[0].status !== 'Available') {
          await client.query('ROLLBACK');
          return res.status(403).json({ message: 'Mã này chưa được cấp cho bạn hoặc đã được sử dụng.' });
        }
      }
      const p = promo[0];
      promotions = [{
        promoType: p.promo_type,
        value: Number(p.value),
        minOrder: Number(p.min_order),
        maxDiscount: p.max_discount === null ? null : Number(p.max_discount),
      }];
    }

    const { subtotal, discountAmt: promotion_discount, totalAmount: before_points_total } =
      calcOrderTotals(pricedItems, promotions);
    const pointsToRedeem = Number(loyalty_points_to_redeem);
    const loyalty_discount = calcPointsRedemptionDiscount(pointsToRedeem);
    if (pointsToRedeem > 0 && !isCustomer) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Chỉ khách hàng mới có thể tự sử dụng điểm thưởng của mình.' });
    }
    if (pointsToRedeem > 0 && !customer_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Chỉ đơn hàng gắn với khách hàng mới sử dụng được điểm thưởng.' });
    }
    if (loyalty_discount > before_points_total) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Điểm đổi vượt quá số tiền còn lại sau khuyến mãi.' });
    }

    if (pointsToRedeem > 0) {
      const { rows: customerRows } = await client.query(
        'SELECT loyalty_point FROM customer WHERE customer_id = $1 FOR UPDATE', [customer_id],
      );
      if (!customerRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Không tìm thấy hồ sơ khách hàng để đổi điểm.' });
      }
      if (customerRows[0].loyalty_point < pointsToRedeem) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Số dư điểm thưởng không đủ.' });
      }
    }

    const discount_amt = promotion_discount + loyalty_discount;
    const total_amount = Math.max(0, before_points_total - loyalty_discount);
    const paymentRequired = total_amount > 0;
    if (payment_method === 'BankTransfer' && paymentRequired && !demoPayment) {
      await client.query('ROLLBACK');
      return res.status(503).json({ message: 'Thanh toán QR demo hiện đang tắt. Vui lòng chọn tiền mặt hoặc liên hệ cửa hàng.' });
    }
    if (payment_method === 'BankTransfer' && paymentRequired && demoPayment) {
      try {
        const parsedBaseUrl = new URL(process.env.PUBLIC_BASE_URL?.trim());
        if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) || parsedBaseUrl.pathname !== '/') {
          throw new Error('Invalid public base URL.');
        }
        demoBaseUrl = parsedBaseUrl.origin;
      } catch {
        await client.query('ROLLBACK');
        return res.status(503).json({ message: 'PUBLIC_BASE_URL phải là URL gốc HTTP hoặc HTTPS cho thanh toán demo.' });
      }
    }
    if (payment_method === 'BankTransfer' && !Number.isInteger(total_amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Tổng tiền chuyển khoản QR phải là số nguyên đồng.' });
    }

    if (promotion_id && promotion_discount > 0) {
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
                            subtotal, discount_amt, total_amount, note, shipping_address,
                            loyalty_points_redeemed, loyalty_discount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
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
        pointsToRedeem,
        loyalty_discount,
      ]
    );
    const order = rows[0];

    if (pointsToRedeem > 0) {
      await addLoyaltyTransaction(client, {
        customerId: customer_id, orderId: order.order_id, type: 'Redeemed',
        delta: -pointsToRedeem, note: `Đổi điểm cho đơn hàng #${order.order_id}`,
      });
    }

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

    const paymentStatus = paymentRequired ? 'Pending' : 'Paid';
    await client.query(
      `INSERT INTO payment (order_id, method, amount, status, paid_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3::numeric = 0 THEN NOW() ELSE NULL END)`,
      [order.order_id, payment_method, total_amount, paymentStatus]
    );

    let demoPaymentUrl = null;
    if (payment_method === 'BankTransfer' && paymentRequired && demoPayment) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      demoPaymentUrl = `${demoBaseUrl}/pay/demo/${token}`;
      await client.query(
        `INSERT INTO demo_payment_tokens (order_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
        [order.order_id, tokenHash, DEMO_PAYMENT_TTL_MINUTES],
      );
    }

    await client.query('COMMIT');
    const instructions = demoPaymentUrl ? { demo_url: demoPaymentUrl } : null;
    res.status(201).json({
      ...order,
      payment_expires_at: payment_method === 'BankTransfer' && paymentRequired
        ? new Date(new Date(order.ordered_at).getTime() + paymentTtlMinutes() * 60_000).toISOString()
        : null,
      payment_method,
      payment: { method: payment_method, status: paymentStatus, amount: order.total_amount },
      payment_instructions: instructions,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.code === '22P02' || err.code === '23514' || err.code === '22007') {
      return res.status(400).json({ message: 'Thông tin đơn hàng không hợp lệ.' });
    }
    console.error('[orders] create failed:', {
      code: err.code,
      message: err.message,
      constraint: err.constraint,
    });
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

    if (status === 'Cancelled' || status === 'Refunded') {
      await reverseOrderLoyalty(client, orderRows[0].customer_id, Number(req.params.id));
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { status, transaction_ref } = req.body;
    if (!['Pending', 'Paid', 'Failed', 'Refunded'].includes(status)
      || (transaction_ref != null
        && (typeof transaction_ref !== 'string' || transaction_ref.trim().length > 200))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Trạng thái hoặc mã giao dịch thanh toán không hợp lệ.' });
    }

    const { rows: orderRows } = await client.query(
      `SELECT o.customer_id, o.order_status, o.total_amount, o.ordered_at,
              p.payment_id, p.amount, p.transaction_ref, p.paid_at,
              p.method AS payment_method, p.status AS payment_status
       FROM "order" o JOIN payment p ON p.order_id=o.order_id
       WHERE o.order_id = $1 FOR UPDATE OF o, p`,
      [req.params.id],
    );
    if (!orderRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    }
    const order = orderRows[0];
    const ttlMinutes = paymentTtlMinutes();
    const expiresAt = new Date(order.ordered_at).getTime() + ttlMinutes * 60_000;
    if (order.payment_method === 'BankTransfer' && order.payment_status === 'Pending'
      && Date.now() >= expiresAt) {
      await client.query(`UPDATE payment SET status='Failed' WHERE order_id=$1 AND status='Pending'`, [req.params.id]);
      if (order.order_status === 'Pending') {
        const { rows: details } = await client.query(
          `SELECT variant_id, quantity FROM order_detail WHERE order_id=$1`, [req.params.id],
        );
        for (const detail of details) {
          await client.query(
            `UPDATE product_variant SET quantity=quantity+$1 WHERE variant_id=$2`,
            [detail.quantity, detail.variant_id],
          );
        }
        await client.query(`UPDATE "order" SET order_status='Cancelled', updated_at=NOW() WHERE order_id=$1`, [req.params.id]);
        await reverseOrderLoyalty(client, order.customer_id, Number(req.params.id));
      }
      await client.query('COMMIT');
      return res.status(409).json({ message: `Đã hết thời hạn thanh toán ${ttlMinutes} phút. Thanh toán đã hết hạn và không thể xác nhận.` });
    }

    // The expiry worker and this route lock the same order/payment rows. Recheck the
    // locked state so a request that waited behind expiry cannot mark a cancelled
    // order as paid. Repeated confirmation of an already-paid order is idempotent.
    if (status === 'Paid') {
      if (order.payment_status === 'Paid') {
        await client.query('COMMIT');
        return res.json({
          payment_id: order.payment_id,
          order_id: Number(req.params.id),
          status: order.payment_status,
          amount: order.amount,
          transaction_ref: order.transaction_ref,
          paid_at: order.paid_at,
        });
      }
      if (order.payment_status !== 'Pending'
        || ['Cancelled', 'Refunded'].includes(order.order_status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Không thể xác nhận thanh toán: đơn hàng đã hủy/hoàn hoặc thanh toán không còn ở trạng thái chờ.',
        });
      }
    }

    const paid_at = status === 'Paid' ? 'NOW()' : 'NULL';
    const { rows } = await client.query(
      `UPDATE payment
       SET status=$1, transaction_ref=$2, paid_at=${paid_at}
       WHERE order_id=$3 RETURNING *`,
      [status, transaction_ref?.trim() || null, req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Không tìm thấy thanh toán' });
    }

    if (status === 'Paid' && orderRows[0].customer_id
      && !['Cancelled', 'Refunded'].includes(orderRows[0].order_status)) {
      const points = calcPointsEarned(Number(rows[0].amount));
      if (points > 0) {
        await addLoyaltyTransaction(client, {
          customerId: orderRows[0].customer_id, orderId: Number(req.params.id),
          type: 'Earned', delta: points, note: `Tích điểm từ đơn hàng #${req.params.id}`,
        });
      }
    }
    if (status === 'Refunded') {
      await reverseOrderLoyalty(client, orderRows[0].customer_id, Number(req.params.id));
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ message: 'Không thể cập nhật trạng thái thanh toán.' });
  } finally {
    client.release();
  }
});

export default router;
