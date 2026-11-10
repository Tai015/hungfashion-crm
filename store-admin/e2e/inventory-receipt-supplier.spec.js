import { test, expect } from '@playwright/test';
import pg from 'pg';

const { Pool } = pg;
const db = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true',
});

const staffIdentifier = process.env.E2E_STAFF_IDENTIFIER;
const staffPassword = process.env.E2E_STAFF_PASSWORD;
const suffix = `e2e-${Date.now()}`;
let categoryId;
let productId;
let variantId;
let supplierId;
let employeeId;
let token;

test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', {
    data: { identifier: staffIdentifier, password: staffPassword, audience: 'staff' },
  });
  expect(login.status(), 'E2E staff login').toBe(200);
  token = (await login.json()).token;

  const employee = await db.query(
    `SELECT e.employee_id
     FROM employee e JOIN account a ON a.account_id=e.account_id
     WHERE LOWER(a.username)=LOWER($1) OR LOWER(a.email)=LOWER($1)
     LIMIT 1`,
    [staffIdentifier],
  );
  expect(employee.rowCount, 'E2E staff employee record').toBe(1);
  employeeId = employee.rows[0].employee_id;

  const category = await db.query(
    'INSERT INTO category (category_name) VALUES ($1) RETURNING category_id',
    [`E2E ${suffix}`],
  );
  categoryId = category.rows[0].category_id;

  const product = await db.query(
    `INSERT INTO product (category_id, product_name, import_price, selling_price)
     VALUES ($1, $2, 200000, 300000) RETURNING product_id`,
    [categoryId, `E2E product ${suffix}`],
  );
  productId = product.rows[0].product_id;

  const variant = await db.query(
    `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, is_default)
     VALUES ($1, NULL, NULL, $2, 0, TRUE) RETURNING variant_id`,
    [productId, `E2E-DEFAULT-${Date.now()}`],
  );
  variantId = variant.rows[0].variant_id;

  const supplier = await db.query(
    'INSERT INTO supplier (supplier_name) VALUES ($1) RETURNING supplier_id',
    [`E2E supplier ${suffix}`],
  );
  supplierId = supplier.rows[0].supplier_id;
});

test.afterAll(async () => {
  try {
    if (productId) {
      await db.query('DELETE FROM import_receipt WHERE supplier_id=$1', [supplierId]);
      await db.query('DELETE FROM product WHERE product_id=$1', [productId]);
    }
    if (supplierId) await db.query('DELETE FROM supplier WHERE supplier_id=$1', [supplierId]);
    if (categoryId) await db.query('DELETE FROM category WHERE category_id=$1', [categoryId]);
  } finally {
    await db.end();
  }
});

test('nhập kho sản phẩm chưa có nhà cung cấp bằng biến thể mặc định sẽ tạo liên kết cùng transaction', async ({ request }) => {
  const before = await db.query(
    'SELECT COUNT(*)::int AS count FROM product_supplier WHERE product_id=$1',
    [productId],
  );
  expect(before.rows[0].count).toBe(0);

  const response = await request.post('/api/inventory/receipts', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      supplier_id: supplierId,
      receipt_type: 'Import',
      note: 'E2E nhập sản phẩm chưa có nhà cung cấp',
      details: [{ variant_id: variantId, quantity: 1, unit_price: 200000 }],
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const receipt = await response.json();

  const [stock, link, receiptRow, detail] = await Promise.all([
    db.query('SELECT quantity FROM product_variant WHERE variant_id=$1', [variantId]),
    db.query(
      'SELECT product_id, supplier_id FROM product_supplier WHERE product_id=$1 AND supplier_id=$2',
      [productId, supplierId],
    ),
    db.query('SELECT receipt_id FROM import_receipt WHERE receipt_id=$1 AND supplier_id=$2', [receipt.receipt_id, supplierId]),
    db.query('SELECT quantity, unit_price FROM import_detail WHERE receipt_id=$1 AND variant_id=$2', [receipt.receipt_id, variantId]),
  ]);

  expect(stock.rows[0].quantity).toBe(1);
  expect(link.rowCount).toBe(1);
  expect(receiptRow.rowCount).toBe(1);
  expect(detail.rows[0]).toMatchObject({ quantity: 1, unit_price: '200000.00' });

  // A repeated import from the same supplier must not duplicate the relationship.
  const second = await request.post('/api/inventory/receipts', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      supplier_id: supplierId,
      receipt_type: 'Import',
      details: [{ variant_id: variantId, quantity: 2, unit_price: 200000 }],
    },
  });
  expect(second.status(), await second.text()).toBe(201);

  const duplicateLink = await db.query(
    'SELECT COUNT(*)::int AS count FROM product_supplier WHERE product_id=$1 AND supplier_id=$2',
    [productId, supplierId],
  );
  const updatedStock = await db.query('SELECT quantity FROM product_variant WHERE variant_id=$1', [variantId]);
  expect(duplicateLink.rows[0].count).toBe(1);
  expect(updatedStock.rows[0].quantity).toBe(3);
});

test('biến thể không tồn tại phải rollback toàn bộ phiếu nhập và tồn kho', async ({ request }) => {
  const beforeReceipts = await db.query('SELECT COUNT(*)::int AS count FROM import_receipt WHERE supplier_id=$1', [supplierId]);
  const beforeStock = await db.query('SELECT quantity FROM product_variant WHERE variant_id=$1', [variantId]);

  const response = await request.post('/api/inventory/receipts', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      supplier_id: supplierId,
      receipt_type: 'Import',
      details: [{ variant_id: 2147483000, quantity: 5, unit_price: 100000 }],
    },
  });

  expect(response.status()).toBe(409);
  const afterReceipts = await db.query('SELECT COUNT(*)::int AS count FROM import_receipt WHERE supplier_id=$1', [supplierId]);
  const afterStock = await db.query('SELECT quantity FROM product_variant WHERE variant_id=$1', [variantId]);
  expect(afterReceipts.rows[0].count).toBe(beforeReceipts.rows[0].count);
  expect(afterStock.rows[0].quantity).toBe(beforeStock.rows[0].quantity);
});
