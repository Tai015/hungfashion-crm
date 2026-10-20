import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertLocalPostgres, loadDbConfig, printDbConfig, serverDir, storeAdminDir } from './db-env.mjs';
import { scrapeCatalog } from './scrape-catalog.mjs';
import { normalizeCatalog } from './normalize-catalog.mjs';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const pg = require('pg');
const bcrypt = require('bcryptjs');

const DEMO_PASSWORD = 'Demo@12345';
const HASH_ROUNDS = 10;

const TEST_ACCOUNTS = [
  { role: 'ADMIN', username: 'admin', email: 'admin@hungfashion.local', fullName: 'Nguyễn Quản Trị' },
  { role: 'ADMIN', username: 'admin2', email: 'admin2@hungfashion.local', fullName: 'Quản Trị Dự Phòng' },
  { role: 'QL_NHAN_SU', username: 'qlnhansu', email: 'nhansu@hungfashion.local', fullName: 'Trần Minh Châu' },
  { role: 'QL_KHO', username: 'qlkho', email: 'kho@hungfashion.local', fullName: 'Lê Hoàng Nam' },
  { role: 'QL_BAN_HANG', username: 'qlbanhang', email: 'banhang@hungfashion.local', fullName: 'Phạm Thị Hoa' },
  { role: 'QL_KHACH_HANG', username: 'qlkhachhang', email: 'crm@hungfashion.local', fullName: 'Đỗ Thanh Tùng' },
  { role: 'KHACH_HANG', username: 'khach1', email: 'khach1@hungfashion.local', fullName: 'Ngô Bảo An' },
  { role: 'KHACH_HANG', username: 'khach2', email: 'khach2@hungfashion.local', fullName: 'Vũ Mai Linh' },
  { role: 'KHACH_HANG', username: 'khach3', email: 'khach3@hungfashion.local', fullName: 'Bùi Đức Huy' },
];

const SUPPLIERS = [
  { name: 'Công ty TNHH May mặc Á Đông', contact: 'Nguyễn Văn Khoa', phone: '0901234001', email: 'aodong@supplier.vn', address: '12 Nguyễn Trãi, Q.5, TP.HCM' },
  { name: 'Nhà phân phối Denim Việt', contact: 'Lý Thu Hà', phone: '0901234002', email: 'denimviet@supplier.vn', address: '88 Cộng Hòa, Tân Bình, TP.HCM' },
  { name: 'Xưởng giày dép Sài Gòn', contact: 'Phan Quốc Việt', phone: '0901234003', email: 'giaysg@supplier.vn', address: '45 Lê Văn Việt, TP. Thủ Đức' },
  { name: 'Phụ kiện thời trang Minh Châu', contact: 'Đặng Ngọc Châu', phone: '0901234004', email: 'minhchau@supplier.vn', address: '6 Hai Bà Trưng, Q.1, TP.HCM' },
];

const EXTRA_CUSTOMERS = [
  ['Nguyễn Thị Lan', 'Female', '1998-04-12', 'Áo thun'],
  ['Trần Văn Hùng', 'Male', '1986-11-03', 'Quần jean'],
  ['Lê Thị Hồng', 'Female', '2003-07-21', 'Váy'],
  ['Phạm Quốc Bảo', 'Male', '1975-01-30', 'Áo sơ mi'],
  ['Hoàng Thị Mỹ', 'Female', '1992-09-08', 'Áo khoác'],
  ['Đinh Văn Tài', 'Male', '2001-12-15', 'Giày dép'],
  ['Võ Ngọc Ánh', 'Female', '1968-05-19', 'Phụ kiện'],
  ['Bùi Minh Khang', 'Male', '1995-02-27', 'Quần kaki'],
  ['Đặng Thu Trang', 'Female', '1989-08-04', 'Váy'],
  ['Ngô Nhật Nam', 'Male', '2005-03-11', 'Áo thun'],
  ['Lý Phương Chi', 'Female', '1979-10-22', 'Áo khoác'],
  ['Trịnh Đức Long', 'Male', '1990-06-17', 'Quần jean'],
  ['Mai Thị Hạnh', 'Female', '2000-01-05', 'Phụ kiện'],
  ['Hồ Văn Phúc', 'Male', '1959-12-01', 'Áo sơ mi'],
  ['Cao Ngọc Diệp', 'Female', '1997-07-09', 'Áo thun'],
  ['Phùng Thành Đạt', 'Male', '1983-04-28', 'Giày dép'],
  ['Tạ Khánh Linh', 'Female', '2004-11-14', 'Váy'],
  ['Dương Anh Tuấn', 'Male', '1971-09-16', 'Quần kaki'],
  ['Kiều Thanh Hà', 'Female', '1964-02-08', 'Phụ kiện'],
  ['Quách Hoàng Yến', 'Female', '1993-05-25', 'Áo khoác'],
];

const ORDER_STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
const VARIANT_SIZES = ['S', 'M', 'L'];
const VARIANT_COLORS = ['Đen', 'Trắng', 'Xanh Navy'];

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function upsertAccount(client, { role, username, email, passwordHash }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO account (role_id, username, password_hash, email, status)
     SELECT role_id, $1, $2, $3, 'Active' FROM role WHERE role_name = $4
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           username = EXCLUDED.username,
           role_id = EXCLUDED.role_id,
           updated_at = NOW()
     RETURNING account_id`,
    [username, passwordHash, email, role],
  );
  return row.account_id;
}

async function ensureEmployee(client, accountId, fullName, position) {
  await client.query(
    `INSERT INTO employee (account_id, full_name, gender, email, position, hire_date, is_active)
     SELECT $1, $2, 'Other'::gender_type, a.email, $3, DATE '2023-01-15', TRUE
     FROM account a WHERE a.account_id = $1
     ON CONFLICT (account_id) DO UPDATE SET full_name = EXCLUDED.full_name, position = EXCLUDED.position`,
    [accountId, fullName, position],
  );
}

async function ensureCustomer(client, {
  accountId = null, fullName, gender, dob, phone, email, address, tier = 'Regular', points = 100, interest = null,
}) {
  const { rows: [existing] } = await client.query(
    'SELECT customer_id FROM customer WHERE email = $1',
    [email],
  );
  let customerId = existing?.customer_id;
  if (!customerId) {
    const { rows: [created] } = await client.query(
      `INSERT INTO customer (account_id, full_name, gender, date_of_birth, phone, email, address, loyalty_point, customer_tier)
       VALUES ($1,$2,$3::gender_type,$4,$5,$6,$7,$8,$9)
       RETURNING customer_id`,
      [accountId, fullName, gender, dob, phone, email, address, points, tier],
    );
    customerId = created.customer_id;
  } else {
    await client.query(
      `UPDATE customer SET account_id = COALESCE($2, account_id), full_name = $3, gender = $4::gender_type,
              date_of_birth = $5, phone = $6, address = $7
       WHERE customer_id = $1`,
      [customerId, accountId, fullName, gender, dob, phone, address],
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

  console.log('2. Tài khoản test');
  const accountIds = {};
  for (const acc of TEST_ACCOUNTS) {
    accountIds[acc.email] = await upsertAccount(client, { ...acc, passwordHash });
  }
  await ensureEmployee(client, accountIds['admin@hungfashion.local'], 'Nguyễn Quản Trị', 'Quản trị viên');
  await ensureEmployee(client, accountIds['admin2@hungfashion.local'], 'Quản Trị Dự Phòng', 'Quản trị viên');
  await ensureEmployee(client, accountIds['nhansu@hungfashion.local'], 'Trần Minh Châu', 'Quản lý nhân sự');
  await ensureEmployee(client, accountIds['kho@hungfashion.local'], 'Lê Hoàng Nam', 'Quản lý kho');
  await ensureEmployee(client, accountIds['banhang@hungfashion.local'], 'Phạm Thị Hoa', 'Quản lý bán hàng');
  await ensureEmployee(client, accountIds['crm@hungfashion.local'], 'Đỗ Thanh Tùng', 'Quản lý khách hàng');

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
  }

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

  console.log('6. Khách hàng');
  const customerIds = [];
  const guestAccounts = TEST_ACCOUNTS.filter((a) => a.role === 'KHACH_HANG');
  const guestMeta = [
    { gender: 'Male', dob: '1999-03-18', interest: 'Áo thun' },
    { gender: 'Female', dob: '1994-08-09', interest: 'Váy' },
    { gender: 'Male', dob: '1988-12-02', interest: 'Quần jean' },
  ];
  for (const [i, acc] of guestAccounts.entries()) {
    const id = await ensureCustomer(client, {
      accountId: accountIds[acc.email],
      fullName: acc.fullName,
      gender: guestMeta[i].gender,
      dob: guestMeta[i].dob,
      phone: `091200000${i + 1}`,
      email: acc.email,
      address: `${10 + i} Nguyễn Huệ, Q.1, TP.HCM`,
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
      phone: `0987${String(100000 + i).slice(-6)}`,
      email: `khach-mau-${String(i + 1).padStart(2, '0')}@hungfashion.local`,
      address: `${20 + i} Cách Mạng Tháng 8, TP.HCM`,
      tier: ['New', 'Regular', 'Silver', 'Gold', 'VIP'][i % 5],
      points: 50 + i * 70,
      interest,
    });
    customerIds.push(id);
  }

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

const config = loadDbConfig();
printDbConfig(config);
assertLocalPostgres(config);

await scrapeCatalog();
await normalizeCatalog();

const client = new pg.Client({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
});
await client.connect();
try {
  await client.query('BEGIN');
  await seed(client);
  await client.query('COMMIT');
  console.log('Seed hoàn tất (idempotent).');
  console.log(`Mật khẩu mọi tài khoản test: ${DEMO_PASSWORD}`);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Seed thất bại:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
