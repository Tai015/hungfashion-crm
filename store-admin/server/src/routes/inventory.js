import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

function validateSupplierFields({ supplier_name, contact_name, phone, email, address }) {
  if (typeof supplier_name !== 'string' || !supplier_name.trim() || supplier_name.trim().length > 200) return 'Tên nhà cung cấp là bắt buộc và tối đa 200 ký tự.';
  if (contact_name != null && (typeof contact_name !== 'string' || contact_name.length > 150)) return 'Tên người liên hệ tối đa 150 ký tự.';
  if (phone != null && (typeof phone !== 'string' || phone.length > 20)) return 'Điện thoại tối đa 20 ký tự.';
  if (email != null && (typeof email !== 'string' || email.length > 150 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) return 'Email nhà cung cấp không hợp lệ.';
  if (address != null && (typeof address !== 'string' || address.length > 500)) return 'Địa chỉ tối đa 500 ký tự.';
  return null;
}

// GET /api/inventory – tồn kho theo biến thể
router.get('/', async (req, res) => {
  try {
    const { search, category_id, low_stock } = req.query;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    const conditions = ['p.is_active = TRUE'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.product_name ILIKE $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }
    if (low_stock === 'true') {
      conditions.push(`pv.quantity <= 5`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([pool.query(
      `SELECT pv.variant_id, pv.sku, pv.quantity,
              p.product_id, p.product_name, p.selling_price,
              c.category_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE s.size_name END AS size_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE co.color_name END AS color_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE CONCAT_WS(' / ', s.size_name, co.color_name) END AS variant_label,
              co.hex_code
       FROM product_variant pv
       JOIN product p ON p.product_id = pv.product_id
       JOIN category c ON c.category_id = p.category_id
       LEFT JOIN size s ON s.size_id = pv.size_id
       LEFT JOIN color co ON co.color_id = pv.color_id
       ${where}
       ORDER BY pv.quantity ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ), pool.query(
      `SELECT COUNT(*)::int AS total
       FROM product_variant pv JOIN product p ON p.product_id=pv.product_id ${where}`,
      params,
    )]);
    if (req.query.paged === 'true') return res.json({ data: rows, total: countRows[0].total, page, limit });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/suppliers – nhà cung cấp
router.get('/suppliers', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search.length > 100) return res.status(400).json({ message: 'Từ khóa tìm nhà cung cấp tối đa 100 ký tự.' });
    const sortColumns = { name: 'supplier_name', contact: 'contact_name', created: 'created_at' };
    const sort = String(req.query.sort || 'name');
    const order = String(req.query.order || 'asc').toLowerCase();
    const contactFilter = String(req.query.contact_filter || 'all');
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (page - 1) * limit;
    if (!sortColumns[sort] || !['asc', 'desc'].includes(order)) {
      return res.status(400).json({ message: 'Cách sắp xếp nhà cung cấp không hợp lệ.' });
    }
    if (!['all', 'has_email', 'no_email', 'has_phone', 'no_phone'].includes(contactFilter)) {
      return res.status(400).json({ message: 'Bộ lọc nhà cung cấp không hợp lệ.' });
    }
    const filterSql = {
      all: '',
      has_email: 'AND NULLIF(BTRIM(email), \'\') IS NOT NULL',
      no_email: 'AND NULLIF(BTRIM(email), \'\') IS NULL',
      has_phone: 'AND NULLIF(BTRIM(phone), \'\') IS NOT NULL',
      no_phone: 'AND NULLIF(BTRIM(phone), \'\') IS NULL',
    }[contactFilter];
    const [{ rows }, { rows: countRows }] = await Promise.all([pool.query(
      `SELECT * FROM supplier WHERE is_active = TRUE
       AND ($1 = '' OR supplier_name ILIKE $2 OR contact_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ${filterSql}
       ORDER BY ${sortColumns[sort]} ${order.toUpperCase()} NULLS LAST, supplier_id ASC
       LIMIT $3 OFFSET $4`,
      [search, `%${search}%`, limit, offset],
    ), pool.query(
      `SELECT COUNT(*)::int AS total FROM supplier WHERE is_active=TRUE
       AND ($1 = '' OR supplier_name ILIKE $2 OR contact_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ${filterSql}`,
      [search, `%${search}%`],
    )]);
    if (req.query.paged === 'true') return res.json({ data: rows, total: countRows[0].total, page, limit });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/suppliers
router.post('/suppliers', async (req, res) => {
  try {
    const { supplier_name, contact_name = null, phone = null, email = null, address = null } = req.body || {};
    const validationError = validateSupplierFields({ supplier_name, contact_name, phone, email, address });
    if (validationError) return res.status(400).json({ message: validationError });
    const { rows } = await pool.query(
      `INSERT INTO supplier (supplier_name, contact_name, phone, email, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [supplier_name.trim(), contact_name, phone, email, address]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/suppliers/:id/status', async (req, res) => {
  try {
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') return res.status(400).json({ message: 'Trạng thái nhà cung cấp không hợp lệ.' });
    const { rows } = await pool.query(
      'UPDATE supplier SET is_active=$1 WHERE supplier_id=$2 RETURNING *',
      [is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp.' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Không thể cập nhật trạng thái nhà cung cấp.' });
  }
});

router.patch('/suppliers/:id', async (req, res) => {
  try {
    const { supplier_name, contact_name = null, phone = null, email = null, address = null } = req.body || {};
    const validationError = validateSupplierFields({ supplier_name, contact_name, phone, email, address });
    if (validationError) return res.status(400).json({ message: validationError });
    const { rows } = await pool.query(
      `UPDATE supplier SET supplier_name=$1, contact_name=$2, phone=$3, email=$4, address=$5
       WHERE supplier_id=$6 AND is_active=TRUE RETURNING *`,
      [supplier_name.trim(), contact_name, phone, email, address, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy nhà cung cấp.' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Không thể cập nhật nhà cung cấp.' });
  }
});

// GET /api/inventory/receipts – phiếu nhập/xuất
router.get('/receipts', async (req, res) => {
  try {
    const { type, from, to, page = 1, limit = 20 } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ message: 'Tham số phân trang không hợp lệ.' });
    }
    const offset = (pageNumber - 1) * pageSize;
    const conditions = [];
    const params = [];

    if (type) {
      params.push(type);
      conditions.push(`ir.receipt_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`ir.receipt_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ir.receipt_date <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(pageSize, offset);

    const [{ rows }, { rows: countRows }] = await Promise.all([pool.query(
      `SELECT ir.*, s.supplier_name,
              e.full_name AS employee_name
       FROM import_receipt ir
       LEFT JOIN supplier s  ON s.supplier_id = ir.supplier_id
       LEFT JOIN employee e  ON e.employee_id = ir.employee_id
       ${where}
       ORDER BY ir.receipt_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ), pool.query(`SELECT COUNT(*)::int AS total FROM import_receipt ir ${where}`, countParams)]);
    if (req.query.paged === 'true') return res.json({ data: rows, total: countRows[0].total, page: pageNumber, limit: pageSize });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/receipts/:id – chi tiết phiếu
router.get('/receipts/:id', async (req, res) => {
  try {
    const { rows: receipt } = await pool.query(
      `SELECT ir.*, s.supplier_name FROM import_receipt ir
       LEFT JOIN supplier s ON s.supplier_id = ir.supplier_id
       WHERE ir.receipt_id = $1`,
      [req.params.id]
    );
    if (!receipt.length) return res.status(404).json({ message: 'Không tìm thấy phiếu' });

    const { rows: details } = await pool.query(
      `SELECT id.*, pv.sku, p.product_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE s.size_name END AS size_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE co.color_name END AS color_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE CONCAT_WS(' / ', s.size_name, co.color_name) END AS variant_label
       FROM import_detail id
       JOIN product_variant pv ON pv.variant_id = id.variant_id
       JOIN product p ON p.product_id = pv.product_id
       LEFT JOIN size s ON s.size_id = pv.size_id
       LEFT JOIN color co ON co.color_id = pv.color_id
       WHERE id.receipt_id = $1`,
      [req.params.id]
    );

    res.json({ ...receipt[0], details });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/receipts – tạo phiếu nhập và cập nhật tồn kho
router.post('/receipts', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { supplier_id, receipt_type = 'Import', note, details = [] } = req.body || {};
    if (!Array.isArray(details) || details.length < 1 || details.length > 500
      || details.some((detail) => !Number.isInteger(Number(detail.variant_id))
        || !Number.isInteger(Number(detail.quantity)) || Number(detail.quantity) < 1
        || !Number.isFinite(Number(detail.unit_price)) || Number(detail.unit_price) < 0)
      || !['Import', 'Export', 'Adjustment'].includes(receipt_type)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Loại phiếu hoặc danh sách chi tiết không hợp lệ.' });
    }
    if (supplier_id != null && (!Number.isInteger(Number(supplier_id)) || Number(supplier_id) < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Nhà cung cấp không hợp lệ.' });
    }
    if (receipt_type === 'Import' && supplier_id == null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Phiếu nhập cần chọn nhà cung cấp.' });
    }
    if (receipt_type === 'Import') {
      const { rowCount } = await client.query(
        'SELECT supplier_id FROM supplier WHERE supplier_id=$1 AND is_active=TRUE',
        [Number(supplier_id)]
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Nhà cung cấp không tồn tại hoặc đã ngừng hợp tác.' });
      }
    }

    // Validate all variants before creating a receipt/detail. This keeps invalid
    // variant IDs as a predictable 409 instead of leaking a foreign-key 500.
    const variantIds = [...new Set(details.map((detail) => Number(detail.variant_id)))];
    const { rows: existingVariants } = await client.query(
      'SELECT variant_id FROM product_variant WHERE variant_id = ANY($1::int[])',
      [variantIds]
    );
    const existingVariantIds = new Set(existingVariants.map((variant) => Number(variant.variant_id)));
    const missingVariantId = variantIds.find((variantId) => !existingVariantIds.has(variantId));
    if (missingVariantId != null) {
      const error = new Error(`Không tìm thấy biến thể #${missingVariantId}.`);
      error.statusCode = 409;
      throw error;
    }

    // Tính tổng tiền
    const total_amount = details.reduce((sum, d) => sum + Number(d.quantity) * Number(d.unit_price), 0);

    const { rows } = await client.query(
      `INSERT INTO import_receipt (supplier_id, employee_id, receipt_type, note, total_amount)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [supplier_id, req.user.employee_id || null, receipt_type, note, total_amount]
    );
    const receipt = rows[0];

    for (const d of details) {
      await client.query(
        `INSERT INTO import_detail (receipt_id, variant_id, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [receipt.receipt_id, d.variant_id, d.quantity, d.unit_price]
      );

      // Cập nhật tồn kho: Import thì +, Export thì -
      const delta = receipt_type === 'Export' ? -d.quantity : d.quantity;
      const { rowCount } = await client.query(
        `UPDATE product_variant SET quantity = quantity + $1
         WHERE variant_id = $2 AND quantity + $1 >= 0`,
        [delta, d.variant_id]
      );
      if (!rowCount) {
        const error = new Error(`Không tìm thấy biến thể hoặc tồn kho không đủ cho biến thể #${d.variant_id}.`);
        error.statusCode = 409;
        throw error;
      }
    }

    // A committed import is an effective supply event. Record each supplier/product
    // relationship in the same transaction as the receipt, details and stock changes.
    // The composite primary key makes concurrent imports idempotent.
    if (receipt_type === 'Import' && supplier_id != null) {
      const variantIds = [...new Set(details.map((detail) => Number(detail.variant_id)))];
      await client.query(
        `INSERT INTO product_supplier (product_id, supplier_id)
         SELECT DISTINCT pv.product_id, $2::int
         FROM product_variant pv
         WHERE pv.variant_id = ANY($1::int[])
         ON CONFLICT (product_id, supplier_id) DO NOTHING`,
        [variantIds, Number(supplier_id)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(receipt);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[inventory] Failed to create receipt', {
      code: err.code || null,
      constraint: err.constraint || null,
      table: err.table || null,
      column: err.column || null,
      message: err.message,
    });
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    if (err.code === '22P02' || err.code === '23514' || err.code === '22007') {
      return res.status(400).json({ message: 'Thông tin phiếu kho không hợp lệ.' });
    }
    return res.status(500).json({ message: 'Không thể tạo phiếu kho.' });
  } finally {
    client.release();
  }
});

export default router;
