import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

function validatePromotion(body = {}) {
  const { code, name, promo_type, value, min_order = 0, max_discount = null, usage_limit = null, start_date, end_date } = body;
  const amount = Number(value);
  const minimum = Number(min_order);
  const cap = max_discount == null || max_discount === '' ? null : Number(max_discount);
  const limit = usage_limit == null || usage_limit === '' ? null : Number(usage_limit);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{2,50}$/.test(code.trim())
    || typeof name !== 'string' || !name.trim() || name.trim().length > 200
    || !['Percent', 'FixedAmount'].includes(promo_type)
    || !Number.isFinite(amount) || amount <= 0 || (promo_type === 'Percent' && amount > 100)
    || !Number.isFinite(minimum) || minimum < 0
    || (cap !== null && (!Number.isFinite(cap) || cap < 0))
    || (limit !== null && (!Number.isInteger(limit) || limit < 1))
    || !validDate(start_date) || !validDate(end_date) || start_date > end_date) {
    return { error: 'Thông tin khuyến mãi chưa hợp lệ. Kiểm tra mã, giá trị, điều kiện và thời hạn.' };
  }
  return { data: { code: code.trim().toUpperCase(), name: name.trim(), promo_type, value: amount,
    min_order: minimum, max_discount: cap, usage_limit: limit, start_date, end_date } };
}

// ── PROMOTIONS ────────────────────────────────────────────

// GET /api/promotions
router.get('/', async (req, res) => {
  try {
    const { active, promo_type, search, page = 1, limit = 20 } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (pageNumber - 1) * pageSize;
    const conditions = [];
    const filterParams = [];
    if (active === 'true') {
      conditions.push(`p.is_active = TRUE AND CURRENT_DATE BETWEEN p.start_date AND p.end_date`);
    } else if (active === 'false') {
      conditions.push(`(p.is_active = FALSE OR CURRENT_DATE NOT BETWEEN p.start_date AND p.end_date)`);
    }
    if (promo_type && ['Percent', 'FixedAmount'].includes(promo_type)) {
      filterParams.push(promo_type);
      conditions.push(`p.promo_type = $${filterParams.length}`);
    }
    if (typeof search === 'string' && search.trim()) {
      const escapedSearch = search.trim().replace(/[\\%_]/g, '\\$&');
      filterParams.push(`%${escapedSearch}%`);
      conditions.push(`(p.code ILIKE $${filterParams.length} OR p.name ILIKE $${filterParams.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitParam = filterParams.length + 1;
    const offsetParam = filterParams.length + 2;

    const [{ rows }, { rows: countRows }] = await Promise.all([pool.query(
      `SELECT p.*, e.full_name AS created_by_name
       FROM promotion p
       LEFT JOIN employee e ON e.employee_id = p.created_by
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...filterParams, pageSize, offset]
    ), pool.query(`SELECT COUNT(*)::int AS total FROM promotion p ${where}`, filterParams)]);
    if (req.query.paged === 'true') return res.json({ data: rows, total: countRows[0].total, page: pageNumber, limit: pageSize });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/promotions/validate/:code – kiểm tra mã giảm giá
router.get('/validate/:code', async (req, res) => {
  try {
    const isCustomer = req.user.role_name === 'KHACH_HANG';
    const { rows } = await pool.query(
      `SELECT p.* FROM promotion p
       ${isCustomer ? 'JOIN user_promotion up ON up.promotion_id = p.promotion_id AND up.customer_id = $2 AND up.status = \'Available\'' : ''}
       WHERE p.code = $1 AND p.is_active = TRUE
         AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
         AND (p.usage_limit IS NULL OR p.used_count < p.usage_limit)`,
      isCustomer ? [req.params.code.trim().toUpperCase(), req.user.customer_id] : [req.params.code.trim().toUpperCase()]
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
    const { data, error } = validatePromotion(req.body);
    if (error) return res.status(400).json({ message: error });
    const { code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date } = data;
    const { rows } = await pool.query(
      `INSERT INTO promotion
         (code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date, req.user.employee_id || null]
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
    const { data, error } = validatePromotion(req.body);
    if (error) return res.status(400).json({ message: error });
    const { code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date } = data;
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ message: 'Trạng thái khuyến mãi không hợp lệ.' });
    const { rows } = await pool.query(
      `UPDATE promotion SET code=$1, name=$2, promo_type=$3, value=$4, min_order=$5,
         max_discount=$6, usage_limit=$7, start_date=$8, end_date=$9, is_active=$10
       WHERE promotion_id=$11 RETURNING *`,
      [code, name, promo_type, value, min_order, max_discount, usage_limit, start_date, end_date, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy khuyến mãi' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Mã khuyến mãi đã tồn tại.' });
    res.status(500).json({ message: 'Không thể cập nhật khuyến mãi.' });
  }
});

// ── USER PROMOTIONS ───────────────────────────────────────

// POST /api/promotions/claim – khách hàng tự thêm mã đang có hiệu lực vào ví
router.post('/claim', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chức năng này chỉ dành cho khách hàng.' });
  }
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
    return res.status(400).json({ message: 'Mã ưu đãi không hợp lệ.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: promotions } = await client.query(
      `SELECT promotion_id, code FROM promotion
       WHERE code=$1 AND is_active=TRUE AND CURRENT_DATE BETWEEN start_date AND end_date
         AND (usage_limit IS NULL OR used_count < usage_limit)
       FOR UPDATE`,
      [code],
    );
    if (!promotions.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Mã ưu đãi không tồn tại, chưa có hiệu lực hoặc đã hết lượt sử dụng.' });
    }
    const { rows } = await client.query(
      `INSERT INTO user_promotion (customer_id, promotion_id)
       VALUES ($1,$2) ON CONFLICT (customer_id, promotion_id) DO NOTHING
       RETURNING user_promo_id`,
      [req.user.customer_id, promotions[0].promotion_id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Bạn đã thêm mã này vào ví ưu đãi rồi.' });
    }
    await client.query('COMMIT');
    return res.status(201).json({ message: `Đã thêm mã ${promotions[0].code} vào ví ưu đãi.` });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[promotions] customer claim failed:', error);
    return res.status(500).json({ message: 'Không thể thêm mã vào ví ưu đãi lúc này.' });
  } finally {
    client.release();
  }
});

router.get('/mine', async (req, res) => {
  if (req.user.role_name !== 'KHACH_HANG' || !req.user.customer_id) {
    return res.status(403).json({ message: 'Chức năng này chỉ dành cho khách hàng.' });
  }
  try {
    const paged = req.query.paged === 'true';
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (paged && (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100)) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const [vouchers, count] = await Promise.all([pool.query(
      `SELECT up.user_promo_id, up.promotion_id, up.status, up.assigned_at, up.used_at,
              p.code, p.name, p.promo_type, p.value, p.min_order, p.max_discount, p.end_date
       FROM user_promotion up JOIN promotion p ON p.promotion_id=up.promotion_id
       WHERE up.customer_id=$1 ORDER BY up.assigned_at DESC
       ${paged ? 'LIMIT $2 OFFSET $3' : ''}`,
      paged ? [req.user.customer_id, limit, offset] : [req.user.customer_id]
    ), paged ? pool.query('SELECT COUNT(*)::int AS total FROM user_promotion WHERE customer_id=$1', [req.user.customer_id]) : Promise.resolve({ rows: [{ total: 0 }] })]);
    if (paged) return res.json({ data: vouchers.rows, total: count.rows[0].total, page, limit });
    return res.json(vouchers.rows);
  } catch {
    return res.status(500).json({ message: 'Không thể tải ví ưu đãi.' });
  }
});

// GET /api/promotions/user/:customerId – danh sách mã của khách
router.get('/user/:customerId', async (req, res) => {
  if (req.user.role_name === 'KHACH_HANG' && Number(req.params.customerId) !== Number(req.user.customer_id)) {
    return res.status(403).json({ message: 'Bạn chỉ có thể xem ví ưu đãi của mình.' });
  }
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

// GET /api/promotions/assign/customers – tìm kiếm khách hàng có phân trang khi phân bổ voucher
router.get('/assign/customers', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (search.length > 100 || !Number.isInteger(page) || page < 1
      || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Từ khóa hoặc tham số phân trang khách hàng không hợp lệ.' });
    }

    const conditions = [];
    const params = [];
    if (search) {
      const escapedSearch = search.replace(/[\\%_]/g, '\\// POST /api/promotions/assign – gán mã cho khách hàng');
      params.push(`%${escapedSearch}%`);
      conditions.push(`(full_name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const [customers, count] = await Promise.all([
      pool.query(
        `SELECT customer_id, full_name, phone, email
         FROM customer
         ${where}
         ORDER BY full_name, customer_id
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        [...params, limit, (page - 1) * limit],
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM customer ${where}`, params),
    ]);
    return res.json({ data: customers.rows, total: count.rows[0].total, page, limit });
  } catch (error) {
    console.error('[promotions] customer assignment search failed:', error.message);
    return res.status(500).json({ message: 'Không thể tải danh sách khách hàng để phân bổ.' });
  }
});

// POST /api/promotions/assign – gán mã cho khách hàng
router.post('/assign', async (req, res) => {
  try {
    const { customer_ids = [], promotion_id } = req.body || {};
    if (!Array.isArray(customer_ids)) return res.status(400).json({ message: 'Danh sách khách hàng không hợp lệ.' });
    const ids = [...new Set(customer_ids.map(Number))];
    const promoId = Number(promotion_id);
    if (!ids.length || ids.length > 500
      || ids.some(id => !Number.isInteger(id) || id < 1)
      || !Number.isInteger(promoId) || promoId < 1) {
      return res.status(400).json({ message: 'Khách hàng và chương trình khuyến mãi chưa hợp lệ.' });
    }
    const [promotion, customers] = await Promise.all([
      pool.query(`SELECT promotion_id FROM promotion WHERE promotion_id=$1 AND is_active=TRUE AND CURRENT_DATE BETWEEN start_date AND end_date`, [promoId]),
      pool.query(`SELECT customer_id FROM customer WHERE customer_id=ANY($1::int[])`, [ids]),
    ]);
    if (!promotion.rows.length) return res.status(404).json({ message: 'Khuyến mãi không tồn tại hoặc đã hết hạn.' });
    if (customers.rows.length !== ids.length) return res.status(400).json({ message: 'Danh sách có khách hàng không tồn tại.' });

    const values = ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
    const params = ids.flatMap(id => [id, promoId]);

    await pool.query(
      `INSERT INTO user_promotion (customer_id, promotion_id)
       VALUES ${values}
       ON CONFLICT (customer_id, promotion_id) DO NOTHING`,
      params
    );
    res.json({ message: `Đã gán mã cho ${ids.length} khách hàng` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
