import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// ── CATEGORY ──────────────────────────────────────────────

// GET /api/products/categories
router.get('/categories', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, parent.category_name AS parent_name
       FROM category c
       LEFT JOIN category parent ON parent.category_id = c.parent_id
       ORDER BY c.parent_id NULLS FIRST, c.category_name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products/categories
router.post('/categories', async (req, res) => {
  try {
    const { category_name, description, parent_id } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO category (category_name, description, parent_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [category_name, description, parent_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Tên danh mục đã tồn tại' });
    res.status(500).json({ message: err.message });
  }
});

// ── SIZES & COLORS ────────────────────────────────────────

// GET /api/products/sizes
router.get('/sizes', async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM size ORDER BY size_id`);
  res.json(rows);
});

// GET /api/products/colors
router.get('/colors', async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM color ORDER BY color_name`);
  res.json(rows);
});

// ── PRODUCTS ──────────────────────────────────────────────

// GET /api/products – danh sách sản phẩm
router.get('/', async (req, res) => {
  try {
    const {
      search, category_id, brand_id, supplier_id, min_price, max_price,
      page = '1', limit = '20', sort = 'created_at', order = 'desc',
    } = req.query;
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const sortColumns = {
      created_at: 'p.created_at',
      name: 'p.product_name',
      price: 'p.selling_price',
    };
    if (!Number.isInteger(pageNumber) || pageNumber < 1
      || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
      || !sortColumns[sort] || !['asc', 'desc'].includes(String(order).toLowerCase())) {
      return res.status(400).json({ message: 'Tham số phân trang hoặc sắp xếp không hợp lệ.' });
    }
    const offset = (pageNumber - 1) * pageSize;
    const conditions = ['p.is_active = TRUE'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.product_name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    for (const [value, column, label] of [
      [category_id, 'p.category_id', 'Danh mục'],
      [brand_id, 'p.brand_id', 'Thương hiệu'],
      [supplier_id, 'p.supplier_id', 'Nhà cung cấp'],
    ]) {
      if (value !== undefined && (!/^\d+$/.test(String(value)) || Number(value) < 1)) {
        return res.status(400).json({ message: `${label} không hợp lệ.` });
      }
      if (value !== undefined) {
        params.push(Number(value));
        conditions.push(`${column} = $${params.length}`);
      }
    }
    for (const [value, operator, label] of [
      [min_price, '>=', 'Giá tối thiểu'],
      [max_price, '<=', 'Giá tối đa'],
    ]) {
      if (value !== undefined && (!/^\d+(\.\d{1,2})?$/.test(String(value)) || Number(value) < 0)) {
        return res.status(400).json({ message: `${label} không hợp lệ.` });
      }
      if (value !== undefined) {
        params.push(Number(value));
        conditions.push(`p.selling_price ${operator} $${params.length}`);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(pageSize, offset);

    const { rows } = await pool.query(
      `SELECT p.*, c.category_name, b.brand_name, s.supplier_name,
              COALESCE(SUM(pv.quantity), 0)::int AS total_stock
       FROM product p
       JOIN category c ON c.category_id = p.category_id
       LEFT JOIN brand b ON b.brand_id = p.brand_id
       LEFT JOIN supplier s ON s.supplier_id = p.supplier_id
       LEFT JOIN product_variant pv ON pv.product_id = p.product_id AND pv.is_active = TRUE
       ${where}
       GROUP BY p.product_id, c.category_name, b.brand_name, s.supplier_name
       ORDER BY ${sortColumns[sort]} ${String(order).toUpperCase()}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM product p ${where}`,
      params.slice(0, -2)
    );

    res.json({ data: rows, total: countRows[0].total, page: pageNumber, limit: pageSize });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.category_name
       FROM product p JOIN category c ON c.category_id = p.category_id
       WHERE p.product_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });

    const { rows: variants } = await pool.query(
      `SELECT pv.*, s.size_name, co.color_name, co.hex_code
       FROM product_variant pv
       JOIN size s ON s.size_id = pv.size_id
       JOIN color co ON co.color_id = pv.color_id
       WHERE pv.product_id = $1 AND pv.is_active = TRUE
       ORDER BY s.size_id, co.color_name`,
      [req.params.id]
    );

    res.json({ ...rows[0], variants });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products – thêm sản phẩm + biến thể
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { category_id, product_name, description, import_price, selling_price, image_url, variants = [] } = req.body;

    const { rows } = await client.query(
      `INSERT INTO product (category_id, product_name, description, import_price, selling_price, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [category_id, product_name, description, import_price, selling_price, image_url]
    );
    const product = rows[0];

    for (const v of variants) {
      await client.query(
        `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [product.product_id, v.size_id, v.color_id, v.sku, v.quantity ?? 0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(product);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/products/:id – cập nhật sản phẩm
router.put('/:id', async (req, res) => {
  try {
    const { category_id, product_name, description, import_price, selling_price, image_url } = req.body;
    const { rows } = await pool.query(
      `UPDATE product
       SET category_id=$1, product_name=$2, description=$3,
           import_price=$4, selling_price=$5, image_url=$6, updated_at=NOW()
       WHERE product_id=$7 RETURNING *`,
      [category_id, product_name, description, import_price, selling_price, image_url, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/products/:id – soft delete
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE product SET is_active=FALSE, updated_at=NOW() WHERE product_id=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    res.json({ message: 'Đã ẩn sản phẩm' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── VARIANTS ──────────────────────────────────────────────

// POST /api/products/:id/variants – thêm biến thể
router.post('/:id/variants', async (req, res) => {
  try {
    const { size_id, color_id, sku, quantity } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, size_id, color_id, sku, quantity ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Biến thể (size + màu) đã tồn tại' });
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/products/variants/:variantId/quantity – cập nhật số lượng
router.patch('/variants/:variantId/quantity', async (req, res) => {
  try {
    const { quantity } = req.body;
    const { rows } = await pool.query(
      `UPDATE product_variant SET quantity=$1 WHERE variant_id=$2 RETURNING *`,
      [quantity, req.params.variantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy biến thể' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
