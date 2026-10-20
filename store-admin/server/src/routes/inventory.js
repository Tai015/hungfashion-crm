import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/inventory – tồn kho theo biến thể
router.get('/', async (req, res) => {
  try {
    const { search, category_id, low_stock } = req.query;
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

    const { rows } = await pool.query(
      `SELECT pv.variant_id, pv.sku, pv.quantity,
              p.product_id, p.product_name, p.selling_price,
              c.category_name,
              s.size_name, co.color_name, co.hex_code
       FROM product_variant pv
       JOIN product p  ON p.product_id = pv.product_id
       JOIN category c ON c.category_id = p.category_id
       JOIN size s     ON s.size_id = pv.size_id
       JOIN color co   ON co.color_id = pv.color_id
       ${where}
       ORDER BY pv.quantity ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/suppliers – nhà cung cấp
router.get('/suppliers', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM supplier WHERE is_active = TRUE ORDER BY supplier_name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/inventory/suppliers
router.post('/suppliers', async (req, res) => {
  try {
    const { supplier_name, contact_name, phone, email, address } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO supplier (supplier_name, contact_name, phone, email, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [supplier_name, contact_name, phone, email, address]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/inventory/receipts – phiếu nhập/xuất
router.get('/receipts', async (req, res) => {
  try {
    const { type, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
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
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT ir.*, s.supplier_name,
              e.full_name AS employee_name
       FROM import_receipt ir
       LEFT JOIN supplier s  ON s.supplier_id = ir.supplier_id
       LEFT JOIN employee e  ON e.employee_id = ir.employee_id
       ${where}
       ORDER BY ir.receipt_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
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
      `SELECT id.*, pv.sku, p.product_name, s.size_name, co.color_name
       FROM import_detail id
       JOIN product_variant pv ON pv.variant_id = id.variant_id
       JOIN product p  ON p.product_id = pv.product_id
       JOIN size s     ON s.size_id = pv.size_id
       JOIN color co   ON co.color_id = pv.color_id
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

    await client.query('COMMIT');
    res.status(201).json(receipt);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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
