import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { cleanupProductImage, storeProductImage } from '../media-storage.js';

const router = Router();
const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      const error = new Error('Ảnh sản phẩm chỉ hỗ trợ JPG, PNG, WebP hoặc GIF.');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

function receiveProductImage(req, res, next) {
  productImageUpload.single('image')(req, res, error => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 413
      : error.status || 400;
    return res.status(status).json({ message: status === 413 ? 'Ảnh sản phẩm tối đa 5 MB.' : error.message });
  });
}

function productRequestData(req) {
  if (typeof req.body?.data !== 'string') return req.body || {};
  const data = JSON.parse(req.body.data);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Thông tin sản phẩm không hợp lệ.');
  return data;
}

function productImageMatchesSignature(file) {
  if (!file) return true;
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (file.mimetype === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  return false;
}

function parseProductImage(req, res, next) {
  try {
    productRequestData(req);
  } catch {
    return res.status(400).json({ message: 'Thông tin sản phẩm không hợp lệ.' });
  }
  if (req.file && !productImageMatchesSignature(req.file)) {
    return res.status(400).json({ message: 'Nội dung tệp không phải ảnh hợp lệ.' });
  }
  next();
}

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

// GET /api/products/brands – danh sách thương hiệu dùng cho bộ lọc sản phẩm
router.get('/brands', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT brand_id, brand_name FROM brand WHERE is_active=TRUE ORDER BY brand_name`,
    );
    return res.json(rows);
  } catch {
    return res.status(500).json({ message: 'Không thể tải danh sách thương hiệu.' });
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
      category: 'c.category_name',
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
      `SELECT pv.*,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE s.size_name END AS size_name,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE co.color_name END AS color_name,
              co.hex_code,
              CASE WHEN pv.is_default THEN 'Mặc định' ELSE CONCAT_WS(' / ', s.size_name, co.color_name) END AS variant_label
       FROM product_variant pv
       LEFT JOIN size s ON s.size_id = pv.size_id
       LEFT JOIN color co ON co.color_id = pv.color_id
       WHERE pv.product_id = $1 AND pv.is_active = TRUE
       ORDER BY pv.is_default DESC, s.size_id NULLS FIRST, co.color_name NULLS FIRST`,
      [req.params.id]
    );

    res.json({ ...rows[0], variants });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/products – thêm sản phẩm + biến thể
router.post('/', receiveProductImage, parseProductImage, async (req, res) => {
  let client;
  let transactionStarted = false;
  let uploadedImage;
  try {
    const { category_id, product_name, description, import_price, selling_price, image_url, variants = [] } = productRequestData(req);
    if (!Array.isArray(variants)) return res.status(400).json({ message: 'Danh sách biến thể không hợp lệ.' });
    if (req.file) uploadedImage = await storeProductImage(req.file.buffer, req.file.mimetype);

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const { rows } = await client.query(
      `INSERT INTO product (category_id, product_name, description, import_price, selling_price, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [category_id, product_name, description, import_price, selling_price, uploadedImage?.url || image_url || null]
    );
    const product = rows[0];

    if (variants.length === 0) {
      await client.query(
        `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, is_default)
         VALUES ($1, NULL, NULL, $2, 0, TRUE)`,
        [product.product_id, `DEFAULT-${product.product_id}`]
      );
    } else {
      for (const v of variants) {
        if (!v || !Number.isInteger(Number(v.size_id)) || Number(v.size_id) < 1
          || !Number.isInteger(Number(v.color_id)) || Number(v.color_id) < 1
          || typeof v.sku !== 'string' || !v.sku.trim()
          || !Number.isInteger(Number(v.quantity ?? 0)) || Number(v.quantity ?? 0) < 0) {
          const error = new Error('Thông tin biến thể không hợp lệ.');
          error.status = 400;
          throw error;
        }
        await client.query(
          `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, is_default)
           VALUES ($1,$2,$3,$4,$5,FALSE)`,
          [product.product_id, Number(v.size_id), Number(v.color_id), v.sku.trim(), Number(v.quantity ?? 0)]
        );
      }
    }

    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json(product);
  } catch (err) {
    if (transactionStarted) await client?.query('ROLLBACK').catch(() => {});
    await cleanupProductImage(uploadedImage);
    console.error('[products] create failed:', err);
    const storageFailed = req.file && !uploadedImage;
    const cloudinaryMode = String(process.env.MEDIA_STORAGE || '').trim().toLowerCase() === 'cloudinary';
    res.status(storageFailed && cloudinaryMode ? 502 : err.status || 500).json({
      message: storageFailed ? `Không thể lưu ảnh${cloudinaryMode ? ' lên Cloudinary' : ''}. Vui lòng thử lại.` : err.message,
    });
  } finally {
    client?.release();
  }
});

// PUT/PATCH /api/products/:id – cập nhật sản phẩm (PATCH là alias cho PUT)
async function updateProduct(req, res) {
  let uploadedImage;
  try {
    const { category_id, supplier_id, product_name, description, import_price, selling_price, image_url } = productRequestData(req);
    if (req.file) uploadedImage = await storeProductImage(req.file.buffer, req.file.mimetype);
    const { rows } = await pool.query(
      `UPDATE product
       SET category_id=$1, supplier_id=$2, product_name=$3, description=$4,
           import_price=$5, selling_price=$6, image_url=COALESCE($7, image_url), updated_at=NOW()
       WHERE product_id=$8 RETURNING *`,
      [category_id||null, supplier_id||null, product_name, description, import_price, selling_price, uploadedImage?.url || image_url || null, req.params.id]
    );
    if (!rows.length) {
      await cleanupProductImage(uploadedImage);
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    res.json(rows[0]);
  } catch (err) {
    await cleanupProductImage(uploadedImage);
    console.error('[products] update failed:', err);
    const storageFailed = req.file && !uploadedImage;
    const cloudinaryMode = String(process.env.MEDIA_STORAGE || '').trim().toLowerCase() === 'cloudinary';
    res.status(storageFailed && cloudinaryMode ? 502 : 500).json({
      message: storageFailed ? `Không thể lưu ảnh${cloudinaryMode ? ' lên Cloudinary' : ''}. Vui lòng thử lại.` : err.message,
    });
  }
}
router.put('/:id', receiveProductImage, parseProductImage, updateProduct);
router.patch('/:id', receiveProductImage, parseProductImage, updateProduct);

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
