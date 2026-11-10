import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrapeCatalog } from './scrape-catalog.mjs';
import { normalizeCatalog } from './normalize-catalog.mjs';
import { createSeedClientConfig } from './seed-db-config.mjs';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const pg = require('pg');
const bcrypt = require('bcryptjs');
const storeAdminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(storeAdminDir, 'server');
let dbHelpers;
if (process.env.SEED_ISOLATED_LOCAL !== 'true') dbHelpers = await import('./db-env.mjs');

const isolatedLocalSeed = process.env.SEED_ISOLATED_LOCAL === 'true';
const seedTarget = process.env.SEED_TARGET || 'local';

if (!['local', 'aiven', 'runtime'].includes(seedTarget)) {
  throw new Error('SEED_TARGET phải là local hoặc aiven.');
}
if (isolatedLocalSeed && seedTarget !== 'local') {
  throw new Error('SEED_ISOLATED_LOCAL chỉ dùng cùng SEED_TARGET=local.');
}

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const HASH_ROUNDS = 10;
const LOCKED_DEMO_ACCOUNT = {
  role: 'KHACH_HANG',
  username: 'demo_khach_khoa',
  email: 'demo-khach-khoa@hungfashion.local',
  fullName: 'Khách Demo Đã Khóa',
  status: 'Blocked',
};
const DEMO_PROMOTIONS = [
  { code: 'DEMO10', name: 'Demo giảm 10%', promoType: 'Percent', value: 10, minOrder: 200000, maxDiscount: 100000 },
  { code: 'DEMO50K', name: 'Demo giảm 50.000đ', promoType: 'FixedAmount', value: 50000, minOrder: 300000, maxDiscount: null },
  { code: 'SURVEY10', name: 'Cảm ơn hoàn thành khảo sát', promoType: 'Percent', value: 10, minOrder: 100000, maxDiscount: 50000 },
];

const TEST_ACCOUNTS = [
  { role: 'ADMIN', username: 'admin', email: 'admin@hungfashion.local', fullName: 'Demo Administrator' },
  { role: 'ADMIN', username: 'admin2', email: 'admin2@hungfashion.local', fullName: 'Demo Admin Backup' },
  { role: 'QL_NHAN_SU', username: 'qlnhansu', email: 'nhansu@hungfashion.local', fullName: 'Demo HR Manager' },
  { role: 'QL_KHO', username: 'qlkho', email: 'kho@hungfashion.local', fullName: 'Demo Warehouse Manager' },
  { role: 'QL_BAN_HANG', username: 'qlbanhang', email: 'banhang@hungfashion.local', fullName: 'Demo Sales Manager' },
  { role: 'QL_KHACH_HANG', username: 'qlkhachhang', email: 'crm@hungfashion.local', fullName: 'Demo CRM Manager' },
  { role: 'KHACH_HANG', username: 'khach1', email: 'khach1@hungfashion.local', fullName: 'Demo Customer 01' },
  { role: 'KHACH_HANG', username: 'khach2', email: 'khach2@hungfashion.local', fullName: 'Demo Customer 02' },
  { role: 'KHACH_HANG', username: 'khach3', email: 'khach3@hungfashion.local', fullName: 'Demo Customer 03' },
];

const SUPPLIERS = Array.from({ length: 4 }, (_, index) => ({
  name: `Demo Supplier ${String(index + 1).padStart(2, '0')}`,
  contact: `Demo Contact ${String(index + 1).padStart(2, '0')}`,
  phone: `00000000${String(index + 1).padStart(2, '0')}`,
  email: `supplier-${String(index + 1).padStart(2, '0')}@hungfashion.local`,
  address: `Synthetic address ${String(index + 1).padStart(2, '0')}`,
}));

const DEMO_BIRTH_DATES_BY_AGE_GROUP = [
  '2010-06-15', // <18
  '2004-06-15', // 18-24
  '1996-06-15', // 25-34
  '1986-06-15', // 35-44
  '1975-06-15', // 45+
];
const EXTRA_CUSTOMERS = Array.from({ length: 20 }, (_, index) => [
  `Demo Customer ${String(index + 1).padStart(2, '0')}`,
  index % 2 ? 'Female' : 'Male',
  DEMO_BIRTH_DATES_BY_AGE_GROUP[index % DEMO_BIRTH_DATES_BY_AGE_GROUP.length],
  ['Áo thun', 'Quần jean', 'Váy', 'Áo khoác'][index % 4],
]);

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
const VARIANT_SIZES = ['S', 'M', 'L'];
const VARIANT_COLORS = ['Đen', 'Trắng', 'Xanh Navy'];

if (typeof DEMO_PASSWORD !== 'string' || DEMO_PASSWORD.length < 8 || Buffer.byteLength(DEMO_PASSWORD, 'utf8') > 72) {
  throw new Error('Set SEED_DEMO_PASSWORD to a value between 8 and 72 UTF-8 bytes before seeding.');
}

function getDatabaseConfig() {
  if (!isolatedLocalSeed) return dbHelpers.loadDbConfig();
  const host = process.env.SEED_DB_HOST;
  const port = Number(process.env.SEED_DB_PORT);
  const database = process.env.SEED_DB_NAME;
  const user = process.env.SEED_DB_USER;
  const password = process.env.SEED_DB_PASSWORD;
  if (!['127.0.0.1', 'localhost'].includes(host) || !Number.isInteger(port) || port < 1
    || !database || !user || !password) {
    throw new Error('Isolated seed requires explicit SEED_DB_* values and a loopback PostgreSQL host.');
  }
  return { host, port, database, user, password, serverDir, storeAdminDir };
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function upsertAccount(client, { role, username, email, passwordHash, status = 'Active' }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO account (role_id, username, password_hash, email, status)
     SELECT role_id, $1, $2, $3, $5 FROM role WHERE role_name = $4
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           username = EXCLUDED.username,
           role_id = EXCLUDED.role_id,
           status = EXCLUDED.status,
           updated_at = NOW()
     RETURNING account_id`,
    [username, passwordHash, email, role, status],
  );
  return row.account_id;
}

async function ensureEmployee(client, accountId, fullName, position) {
  await client.query(
    `INSERT INTO employee (account_id, full_name, gender, email, position, hire_date, is_active)
     SELECT $1, $2, 'Other'::gender_type, a.email, $3, CURRENT_DATE - (($1 % 6) * 30)::int, TRUE
     FROM account a WHERE a.account_id = $1
     ON CONFLICT (account_id) DO UPDATE SET full_name = EXCLUDED.full_name, position = EXCLUDED.position, hire_date = EXCLUDED.hire_date`,
    [accountId, fullName, position],
  );
}

async function ensureCustomer(client, {
  accountId = null, fullName, gender = 'Other', dob, phone, email, address, tier = 'Regular', points = 100, interest = null,
}) {
  // Seed data phải có email để có thể đối chiếu hồ sơ khách hàng.
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail)) {
    throw new Error(`Email seed không hợp lệ hoặc bị thiếu của khách hàng "${fullName}".`);
  }

  // Seed data phải có ngày sinh trong bộ dữ liệu demo và giới tính hợp lệ.
  // Không tự sinh ngày sinh ngẫu nhiên vì sẽ làm sai tuổi hiển thị trong CRM.
  const normalizedGender = gender || 'Other';
  if (!['Male', 'Female', 'Other'].includes(normalizedGender)) {
    throw new Error(`Giới tính seed không hợp lệ của khách hàng "${fullName}".`);
  }
  if (typeof dob !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dob)) {
    throw new Error(`Khách hàng seed "${fullName}" phải có ngày sinh theo định dạng YYYY-MM-DD.`);
  }
  const birthDate = new Date(`${dob}T00:00:00.000Z`);
  const today = new Date();
  const age = today.getUTCFullYear() - birthDate.getUTCFullYear()
    - (today.getUTCMonth() < birthDate.getUTCMonth()
      || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate()) ? 1 : 0);
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== dob
    || birthDate > new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    || age < 0 || age > 120) {
    throw new Error(`Ngày sinh seed không hợp lệ của khách hàng "${fullName}" (tuổi phải từ 0 đến 120).`);
  }

  // Khớp theo email trước; nếu hồ sơ seed cũ chưa có email thì dùng số điện thoại
  // đã biết của chính dữ liệu demo để bổ sung email, tránh tạo hồ sơ trùng.
  const { rows: matches } = await client.query(
    `SELECT customer_id, email, phone
     FROM customer
     WHERE LOWER(BTRIM(email)) = $1
        OR ($2::varchar IS NOT NULL AND phone = $2)
     ORDER BY CASE WHEN LOWER(BTRIM(email)) = $1 THEN 0 ELSE 1 END
     LIMIT 2`,
    [normalizedEmail, phone || null],
  );
  if (matches.length > 1) {
    throw new Error(`Không thể xác định duy nhất hồ sơ seed của "${fullName}" theo email/số điện thoại; cần kiểm tra dữ liệu trước khi seed.`);
  }

  let customerId = matches[0]?.customer_id;
  if (!customerId) {
    const { rows: [created] } = await client.query(
      `INSERT INTO customer (account_id, full_name, gender, date_of_birth, phone, email, address, loyalty_point, customer_tier)
       VALUES ($1,$2,$3::gender_type,$4,$5,$6,$7,$8,$9)
       RETURNING customer_id`,
      [accountId, fullName, normalizedGender, dob, phone, normalizedEmail, address, points, tier],
    );
    customerId = created.customer_id;
  } else {
    await client.query(
      `UPDATE customer SET account_id = COALESCE($2, account_id), full_name = $3,
              gender = COALESCE($4::gender_type, 'Other'::gender_type),
              date_of_birth = $5, phone = $6, email = $7, address = $8
       WHERE customer_id = $1`,
      [customerId, accountId, fullName, normalizedGender, dob, phone, normalizedEmail, address],
    );
  }
  if (interest) {
    await client.query(
      `INSERT INTO customer_interest (customer_id, interest_id)
       SELECT $1, interest_id FROM interest WHERE interest_name = $2
       ON CONFLICT DO NOTHING`,
      [customerId, interest],
    );
  }
  return customerId;
}

async function seed(client) {
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, HASH_ROUNDS);
  const clean = JSON.parse(await readFile(path.join(storeAdminDir, 'data', 'clean', 'products.json'), 'utf8'));
  const catalog = clean.products || [];
  if (catalog.length < 80) throw new Error('Dữ liệu clean quá ít, dừng seed sản phẩm.');

  console.log('HF_SEED_PROGRESS:seed_roles');
  console.log('1. Vai trò, quyền (schema đã seed, bổ sung nếu thiếu)');
  await client.query(`
    INSERT INTO role (role_name, description) VALUES
      ('ADMIN','Quản trị toàn bộ hệ thống'),
      ('QL_NHAN_SU','Quản lý nhân sự'),
      ('QL_KHO','Quản lý kho'),
      ('QL_BAN_HANG','Quản lý bán hàng'),
      ('QL_KHACH_HANG','Quản lý khách hàng (CRM)'),
      ('KHACH_HANG','Khách hàng')
    ON CONFLICT (role_name) DO NOTHING
  `);

  console.log('HF_SEED_PROGRESS:seed_accounts');
  console.log('2. Tài khoản test');
  const accountIds = {};
  for (const acc of TEST_ACCOUNTS) {
    accountIds[acc.email] = await upsertAccount(client, { ...acc, passwordHash });
  }
  accountIds[LOCKED_DEMO_ACCOUNT.email] = await upsertAccount(client, { ...LOCKED_DEMO_ACCOUNT, passwordHash });
  await ensureEmployee(client, accountIds['admin@hungfashion.local'], 'Demo Employee Admin 01', 'Quản trị viên');
  await ensureEmployee(client, accountIds['admin2@hungfashion.local'], 'Demo Employee Admin 02', 'Quản trị viên');
  await ensureEmployee(client, accountIds['nhansu@hungfashion.local'], 'Demo Employee HR 01', 'Quản lý nhân sự');
  await ensureEmployee(client, accountIds['kho@hungfashion.local'], 'Demo Employee Warehouse 01', 'Quản lý kho');
  await ensureEmployee(client, accountIds['banhang@hungfashion.local'], 'Demo Employee Sales 01', 'Quản lý bán hàng');
  await ensureEmployee(client, accountIds['crm@hungfashion.local'], 'Demo Employee CRM 01', 'Quản lý khách hàng');
  await client.query(
    `INSERT INTO employee (full_name, position, hire_date, is_active)
     SELECT 'Demo Employee Inactive 01', 'Nhân viên kho', DATE '2022-03-01', FALSE
     WHERE NOT EXISTS (SELECT 1 FROM employee WHERE full_name = 'Demo Employee Inactive 01')`,
  );

  const { rows: [warehouseStaff] } = await client.query(
    'SELECT employee_id FROM employee WHERE account_id = $1',
    [accountIds['kho@hungfashion.local']],
  );
  const { rows: [salesStaff] } = await client.query(
    'SELECT employee_id FROM employee WHERE account_id = $1',
    [accountIds['banhang@hungfashion.local']],
  );
  const { rows: [crmStaff] } = await client.query(
    'SELECT employee_id FROM employee WHERE account_id = $1',
    [accountIds['crm@hungfashion.local']],
  );

  console.log('HF_SEED_PROGRESS:seed_suppliers');
  console.log('3. Nhà cung cấp');
  for (const s of SUPPLIERS) {
    await client.query(
      `INSERT INTO supplier (supplier_name, contact_name, phone, email, address)
       SELECT $1::varchar(200),$2,$3,$4,$5
       WHERE NOT EXISTS (SELECT 1 FROM supplier WHERE supplier_name = $1::varchar(200))`,
      [s.name, s.contact, s.phone, s.email, s.address],
    );
  }
  const { rows: supplierRows } = await client.query(
    'SELECT supplier_id FROM supplier WHERE supplier_name = ANY($1) ORDER BY supplier_id',
    [SUPPLIERS.map((s) => s.name)],
  );

  console.log('HF_SEED_PROGRESS:seed_products');
  console.log('4. Danh mục, thương hiệu, sản phẩm, biến thể, hình');
  const { rows: sizeRows } = await client.query(
    'SELECT size_id, size_name FROM size WHERE size_name = ANY($1)',
    [VARIANT_SIZES],
  );
  const { rows: colorRows } = await client.query(
    'SELECT color_id, color_name FROM color WHERE color_name = ANY($1)',
    [VARIANT_COLORS],
  );
  const sizeByName = Object.fromEntries(sizeRows.map((r) => [r.size_name, r.size_id]));
  const colorByName = Object.fromEntries(colorRows.map((r) => [r.color_name, r.color_id]));
  const variantIds = [];

  for (const [index, item] of catalog.entries()) {
    await client.query(
      `INSERT INTO category (category_name) SELECT $1::varchar(100) WHERE NOT EXISTS (SELECT 1 FROM category WHERE category_name = $1::varchar(100))`,
      [item.categoryName],
    );
    await client.query(
      `INSERT INTO brand (brand_name) SELECT $1::varchar(150) WHERE NOT EXISTS (SELECT 1 FROM brand WHERE brand_name = $1::varchar(150))`,
      [item.brandName],
    );
    const supplierId = supplierRows[index % supplierRows.length].supplier_id;
    const { rows: [product] } = await client.query(
      `INSERT INTO product (category_id, brand_id, supplier_id, product_name, description, import_price, selling_price, image_url)
       SELECT c.category_id, b.brand_id, $3, $4, $5, $6, $7, $8
       FROM category c, brand b
       WHERE c.category_name = $1::varchar(100) AND b.brand_name = $2::varchar(150)
         AND NOT EXISTS (SELECT 1 FROM product p WHERE p.product_name = $4::varchar(200))
       RETURNING product_id`,
      [item.categoryName, item.brandName, supplierId, item.productName, item.description, item.importPrice, item.sellingPrice, item.imageUrl],
    );
    let productId = product?.product_id;
    if (!productId) {
      const { rows: [found] } = await client.query('SELECT product_id FROM product WHERE product_name = $1', [item.productName]);
      productId = found.product_id;
    }
    // Refresh prices for products owned by this imported catalog; keep order history unchanged.
    await client.query(
      `UPDATE product p
       SET import_price = $2, selling_price = $3, updated_at = NOW()
       FROM brand b
       WHERE p.product_id = $1 AND p.brand_id = b.brand_id AND b.brand_name = $4`,
      [productId, item.importPrice, item.sellingPrice, item.brandName],
    );
    for (const [imgIndex, url] of item.images.entries()) {
      await client.query(
        `INSERT INTO product_image (product_id, image_url, is_primary, display_order)
         SELECT $1,$2,$3,$4
         WHERE NOT EXISTS (SELECT 1 FROM product_image WHERE product_id = $1 AND image_url = $2)`,
        [productId, url, imgIndex === 0, imgIndex + 1],
      );
    }
    const sizeName = VARIANT_SIZES[index % VARIANT_SIZES.length];
    const colorName = VARIANT_COLORS[index % VARIANT_COLORS.length];
    const sku = `${item.skuPrefix}-${sizeName}-${colorName}`.slice(0, 100);
    const { rows: [variant] } = await client.query(
      `INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, selling_price)
       VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (sku) DO UPDATE SET selling_price = EXCLUDED.selling_price
       RETURNING variant_id`,
      [productId, sizeByName[sizeName], colorByName[colorName], sku, item.sellingPrice],
    );
    variantIds.push({ variantId: variant.variant_id, unitPrice: item.importPrice, qty: 12 + (index % 20) });
    const completed = index + 1;
    console.log(`HF_SEED_PRODUCTS:${completed}:${catalog.length}`);
  }

  console.log('HF_SEED_PROGRESS:seed_receipts');
  console.log('5. Phiếu nhập kho');
  const { rows: [existingReceipt] } = await client.query(
    `SELECT receipt_id FROM import_receipt WHERE note = 'SEED-IMPORT-CATALOG'`,
  );
  let receiptId = existingReceipt?.receipt_id;
  if (!receiptId) {
    const { rows: [receipt] } = await client.query(
      `INSERT INTO import_receipt (supplier_id, employee_id, receipt_type, note, total_amount, receipt_date)
       VALUES ($1,$2,'Import','SEED-IMPORT-CATALOG',0, NOW() - INTERVAL '40 days')
       RETURNING receipt_id`,
      [supplierRows[0].supplier_id, warehouseStaff.employee_id],
    );
    receiptId = receipt.receipt_id;
  }
  let receiptTotal = 0;
  for (const v of variantIds) {
    const { rowCount } = await client.query(
      `INSERT INTO import_detail (receipt_id, variant_id, quantity, unit_price)
       SELECT $1,$2,$3,$4
       WHERE NOT EXISTS (SELECT 1 FROM import_detail WHERE receipt_id = $1 AND variant_id = $2)`,
      [receiptId, v.variantId, v.qty, v.unitPrice],
    );
    if (rowCount) receiptTotal += v.qty * v.unitPrice;
    await client.query(
      `UPDATE product_variant SET quantity = (
         SELECT COALESCE(SUM(quantity),0) FROM import_detail WHERE variant_id = $1
       ) WHERE variant_id = $1`,
      [v.variantId],
    );
  }
  if (receiptTotal > 0) {
    await client.query('UPDATE import_receipt SET total_amount = total_amount + $2 WHERE receipt_id = $1', [receiptId, receiptTotal]);
  }

  console.log('HF_SEED_PROGRESS:seed_customers');
  console.log('6. Khách hàng');
  const customerIds = [];
  const guestAccounts = TEST_ACCOUNTS.filter((a) => a.role === 'KHACH_HANG');
  const guestMeta = [
    { gender: 'Male', dob: '2010-03-18', interest: 'Áo thun' },
    { gender: 'Female', dob: '2004-08-09', interest: 'Váy' },
    { gender: 'Male', dob: '1978-12-02', interest: 'Quần jean' },
  ];
  for (const [i, acc] of guestAccounts.entries()) {
    const id = await ensureCustomer(client, {
      accountId: accountIds[acc.email],
      fullName: acc.fullName,
      gender: guestMeta[i].gender,
      dob: guestMeta[i].dob,
      phone: `000000000${i + 1}`,
      email: acc.email,
    address: `Synthetic demo address ${String(i + 1).padStart(2, '0')}`,
      tier: i === 0 ? 'Gold' : 'Silver',
      points: 400 + i * 80,
      interest: guestMeta[i].interest,
    });
    customerIds.push(id);
  }
  for (const [i, [fullName, gender, dob, interest]] of EXTRA_CUSTOMERS.entries()) {
    const id = await ensureCustomer(client, {
      fullName,
      gender,
      dob,
      phone: `000000${String(i + 1).padStart(4, '0')}`,
      email: `khach-mau-${String(i + 1).padStart(2, '0')}@hungfashion.local`,
      address: `Synthetic demo address ${String(i + 21).padStart(2, '0')}`,
      tier: ['New', 'Regular', 'Silver', 'Gold', 'VIP'][i % 5],
      points: 50 + i * 70,
      interest,
    });
    customerIds.push(id);
  }

  console.log('6.1 Khách demo cho thao tác khóa và xóa');
  await ensureCustomer(client, {
    accountId: accountIds[LOCKED_DEMO_ACCOUNT.email],
    fullName: LOCKED_DEMO_ACCOUNT.fullName,
    gender: 'Other', dob: '1995-01-01', phone: '0000000101',
    email: LOCKED_DEMO_ACCOUNT.email, address: 'Hồ sơ demo trạng thái khóa',
    tier: 'Regular', points: 0,
  });
  await ensureCustomer(client, {
    fullName: 'Khách Demo Chưa Có Lịch Sử', gender: 'Female', dob: '1998-06-15',
    phone: '0000000102', email: 'demo-xoa-khach@hungfashion.local',
    address: 'Hồ sơ demo có thể xóa', tier: 'New', points: 0,
  });
  const orderBlockerCustomerId = await ensureCustomer(client, {
    fullName: 'Khách Demo Đã Có Đơn', gender: 'Male', dob: '1992-03-20',
    phone: '0000000103', email: 'demo-chan-xoa@hungfashion.local',
    address: 'Hồ sơ demo có đơn hàng', tier: 'Regular', points: 0,
  });

  console.log('HF_SEED_PROGRESS:seed_orders');
  console.log('7. Đơn hàng');
  const rand = mulberry32(841065);
  const { rows: sellable } = await client.query(
    `SELECT variant_id, COALESCE(selling_price, 199000) AS price, quantity
     FROM product_variant WHERE sku LIKE 'FS-%' AND quantity > 2 ORDER BY variant_id`,
  );
  for (let n = 1; n <= 40; n += 1) {
    const note = `SEED-ORDER-${String(n).padStart(2, '0')}`;
    const { rows: [dup] } = await client.query('SELECT order_id FROM "order" WHERE note = $1', [note]);
    if (dup) continue;
    const customerId = customerIds[n % customerIds.length];
    const status = ORDER_STATUSES[(n - 1) % ORDER_STATUSES.length];
    const daysAgo = 8 + n * 6;
    const v1 = sellable[n % sellable.length];
    const v2 = sellable[(n * 3) % sellable.length];
    const qty1 = 1 + Math.floor(rand() * 2);
    const qty2 = 1;
    const subtotal = Number(v1.price) * qty1 + Number(v2.price) * qty2;
    const { rows: [order] } = await client.query(
      `INSERT INTO "order" (customer_id, employee_id, order_status, subtotal, discount_amt, total_amount, note, order_channel, ordered_at, updated_at)
       VALUES ($1,$2,$3::order_status,$4,0,$4,$5,'Website', NOW() - ($6 || ' days')::interval, NOW() - ($6 || ' days')::interval)
       RETURNING order_id`,
      [customerId, salesStaff.employee_id, status, subtotal, note, daysAgo],
    );
    await client.query(
      `INSERT INTO order_detail (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4), ($1,$5,$6,$7)`,
      [order.order_id, v1.variant_id, qty1, v1.price, v2.variant_id, qty2, v2.price],
    );
    await client.query(
      `INSERT INTO payment (order_id, method, status, amount, paid_at)
       VALUES ($1, 'Cash', $2::payment_status, $3, CASE WHEN $2 IN ('Paid') THEN NOW() ELSE NULL END)
       ON CONFLICT (order_id) DO NOTHING`,
      [order.order_id, ['Delivered', 'Shipped'].includes(status) ? 'Paid' : 'Pending', subtotal],
    );
  }

  const demoBlockerOrderNote = 'SEED-ORDER-DEMO-DELETE-BLOCKER';
  const { rows: [existingDemoBlockerOrder] } = await client.query(
    'SELECT order_id FROM "order" WHERE note=$1', [demoBlockerOrderNote],
  );
  if (!existingDemoBlockerOrder) {
    const [firstVariant, secondVariant] = [sellable[0], sellable[1] || sellable[0]];
    const subtotal = Number(firstVariant.price) + Number(secondVariant.price);
    const { rows: [order] } = await client.query(
      `INSERT INTO "order" (customer_id, employee_id, order_status, subtotal, discount_amt, total_amount, note, order_channel)
       VALUES ($1,$2,'Confirmed',$3,0,$3,$4,'Website') RETURNING order_id`,
      [orderBlockerCustomerId, salesStaff.employee_id, subtotal, demoBlockerOrderNote],
    );
    await client.query(
      `INSERT INTO order_detail (order_id, variant_id, quantity, unit_price)
       VALUES ($1,$2,1,$3),($1,$4,1,$5)`,
      [order.order_id, firstVariant.variant_id, firstVariant.price, secondVariant.variant_id, secondVariant.price],
    );
    await client.query(
      `INSERT INTO payment (order_id, method, status, amount)
       VALUES ($1,'Cash','Pending',$2) ON CONFLICT (order_id) DO NOTHING`,
      [order.order_id, subtotal],
    );
  }

  await client.query(`
    UPDATE product_variant pv
    SET quantity = GREATEST(
      COALESCE((SELECT SUM(d.quantity) FROM import_detail d WHERE d.variant_id = pv.variant_id), 0)
      - COALESCE((
          SELECT SUM(od.quantity) FROM order_detail od
          JOIN "order" o ON o.order_id = od.order_id
          WHERE od.variant_id = pv.variant_id
            AND o.order_status NOT IN ('Cancelled', 'Refunded')
        ), 0),
      0
    )
    WHERE pv.sku LIKE 'FS-%'
  `);

  console.log('HF_SEED_PROGRESS:seed_promotions');
  console.log('7.1 Khuyến mãi demo');
  for (const promotion of DEMO_PROMOTIONS) {
    await client.query(
      `INSERT INTO promotion (code, name, promo_type, value, min_order, max_discount, start_date, end_date, is_active, created_by)
       VALUES ($1,$2,$3::promotion_type,$4,$5,$6,CURRENT_DATE - 1,CURRENT_DATE + 180,TRUE,$7)
       ON CONFLICT (code) DO UPDATE SET
         name=EXCLUDED.name, promo_type=EXCLUDED.promo_type, value=EXCLUDED.value,
         min_order=EXCLUDED.min_order, max_discount=EXCLUDED.max_discount,
         start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date,
         is_active=TRUE, created_by=EXCLUDED.created_by`,
      [promotion.code, promotion.name, promotion.promoType, promotion.value, promotion.minOrder, promotion.maxDiscount, salesStaff.employee_id],
    );
  }

  console.log('HF_SEED_PROGRESS:seed_feedback');
  console.log('8. Phản hồi sản phẩm');
  const { rows: productRows } = await client.query(
    `SELECT product_id FROM product WHERE product_name IN (SELECT product_name FROM product LIMIT 20) ORDER BY product_id LIMIT 12`,
  );
  const comments = [
    'Vải mát, form đẹp.',
    'Giao hàng nhanh, đúng màu.',
    'Size hơi nhỏ so với mô tả.',
    'Đáng tiền, sẽ mua lại.',
    'Hình ảnh sát thực tế.',
  ];
  for (let i = 0; i < 12; i += 1) {
    const content = `SEED-FB-${i + 1}: ${comments[i % comments.length]}`;
    await client.query(
      `INSERT INTO feedback (customer_id, product_id, employee_id, feedback_type, rating, content, status)
       SELECT $1,$2,$3,'Product',$4,$5,$6::feedback_status
       WHERE NOT EXISTS (SELECT 1 FROM feedback WHERE content = $5)`,
      [
        customerIds[i % customerIds.length],
        productRows[i % productRows.length].product_id,
        crmStaff.employee_id,
        3 + (i % 3),
        content,
        ['New', 'Processing', 'Resolved'][i % 3],
      ],
    );
  }

  console.log('HF_SEED_PROGRESS:seed_surveys');
  console.log('9. Khảo sát');
  const { rows: [survey] } = await client.query(
    `INSERT INTO survey (created_by, title, description, status, start_date, end_date)
     SELECT $1, $2, $3, 'Active', CURRENT_DATE - 10, CURRENT_DATE + 40
     WHERE NOT EXISTS (SELECT 1 FROM survey WHERE title = $2::varchar(300))
     RETURNING survey_id`,
    [crmStaff.employee_id, 'Khảo sát trải nghiệm cửa hàng Hung Fashion', 'Thu thập ý kiến khách hàng về sản phẩm và dịch vụ.'],
  );
  let surveyId = survey?.survey_id;
  if (!surveyId) {
    const { rows: [found] } = await client.query(
      `SELECT survey_id FROM survey WHERE title = 'Khảo sát trải nghiệm cửa hàng Hung Fashion'`,
    );
    surveyId = found.survey_id;
  }
  await client.query(
    `INSERT INTO survey_question (survey_id, question_text, question_type, display_order)
     SELECT $1, seed.q, seed.t::question_type, seed.ord
     FROM (VALUES
       ('Bạn hài lòng mức nào với chất lượng sản phẩm?', 'Rating', 1),
       ('Kênh mua sắm bạn dùng nhiều nhất?', 'SingleChoice', 2),
       ('Góp ý thêm cho cửa hàng?', 'Text', 3)
     ) AS seed(q,t,ord)
     WHERE NOT EXISTS (SELECT 1 FROM survey_question WHERE survey_id = $1 AND question_text = seed.q)`,
    [surveyId],
  );
  const { rows: questions } = await client.query(
    'SELECT question_id, question_type, display_order FROM survey_question WHERE survey_id = $1 ORDER BY display_order',
    [surveyId],
  );
  const choiceQ = questions.find((q) => q.question_type === 'SingleChoice');
  if (choiceQ) {
    await client.query(
      `INSERT INTO survey_option (question_id, option_text, display_order)
       SELECT $1, seed.t, seed.ord FROM (VALUES ('Website',1),('Cửa hàng',2),('Mạng xã hội',3)) AS seed(t,ord)
       WHERE NOT EXISTS (SELECT 1 FROM survey_option WHERE question_id = $1 AND option_text = seed.t)`,
      [choiceQ.question_id],
    );
  }
  const { rows: options } = await client.query(
    'SELECT option_id FROM survey_option WHERE question_id = $1 ORDER BY display_order',
    [choiceQ.question_id],
  );
  for (let i = 0; i < 8; i += 1) {
    const cid = customerIds[i];
    await client.query(
      `INSERT INTO survey_invitation (survey_id, customer_id, invited_by, status)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (survey_id, customer_id) DO NOTHING`,
      [surveyId, cid, crmStaff.employee_id, i < 5 ? 'Completed' : 'Sent'],
    );
  }
  for (let i = 0; i < 5; i += 1) {
    const cid = customerIds[i];
    const { rows: [resp] } = await client.query(
      `INSERT INTO survey_response (survey_id, customer_id)
       VALUES ($1,$2)
       ON CONFLICT (survey_id, customer_id) DO UPDATE SET survey_id = EXCLUDED.survey_id
       RETURNING response_id`,
      [surveyId, cid],
    );
    const ratingQ = questions.find((q) => q.question_type === 'Rating');
    const textQ = questions.find((q) => q.question_type === 'Text');
    await client.query(
      `INSERT INTO survey_answer (response_id, question_id, answer_text)
       SELECT $1,$2,$3
       WHERE NOT EXISTS (SELECT 1 FROM survey_answer WHERE response_id = $1 AND question_id = $2)`,
      [resp.response_id, ratingQ.question_id, String(4 + (i % 2))],
    );
    await client.query(
      `INSERT INTO survey_answer (response_id, question_id, option_id)
       SELECT $1,$2,$3
       WHERE NOT EXISTS (SELECT 1 FROM survey_answer WHERE response_id = $1 AND question_id = $2)`,
      [resp.response_id, choiceQ.question_id, options[i % options.length].option_id],
    );
    await client.query(
      `INSERT INTO survey_answer (response_id, question_id, answer_text)
       SELECT $1,$2,$3
       WHERE NOT EXISTS (SELECT 1 FROM survey_answer WHERE response_id = $1 AND question_id = $2)`,
      [resp.response_id, textQ.question_id, 'SEED: Nhân viên tư vấn nhiệt tình.'],
    );
  }
}

const config = getDatabaseConfig();
const clientConfig = createSeedClientConfig({
  target: seedTarget,
  config,
  sslEnabled: process.env.POSTGRES_SSL,
  caPath: process.env.POSTGRES_CA_PATH,
  projectRoot: storeAdminDir,
  allowRuntimeTarget: process.env.ALLOW_NONLOCAL_SEED === 'true',
});

if (process.env.SEED_USE_EXISTING_CATALOG !== 'true') {
  console.log('HF_SEED_PROGRESS:scrape_catalog');
  await scrapeCatalog();
  console.log('HF_SEED_PROGRESS:normalize_catalog');
  await normalizeCatalog();
}

console.log('HF_SEED_PROGRESS:connect_database');
const client = new pg.Client(clientConfig);
await client.connect();
try {
  await client.query('BEGIN');
  await seed(client);
  await client.query('COMMIT');
  console.log('Seed hoàn tất (idempotent).');
  console.log('Mật khẩu tài khoản seed lấy từ SEED_DEMO_PASSWORD; không in giá trị.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Seed thất bại:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
