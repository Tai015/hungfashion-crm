import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;

test('Electron CRUD: sản phẩm, khách hàng, nhân viên và tạo/cập nhật đơn hàng', async () => {
  test.setTimeout(180_000);
  const identifier = process.env.E2E_STAFF_IDENTIFIER;
  const password = process.env.E2E_STAFF_PASSWORD;
  expect(identifier, 'Thiếu E2E_STAFF_IDENTIFIER').toBeTruthy();
  expect(password, 'Thiếu E2E_STAFF_PASSWORD').toBeTruthy();

  const db = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.POSTGRES_SSL === 'true',
  });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const productName = `E2E Product ${suffix}`;
  const editedProductName = `E2E Product Edited ${suffix}`;
  const customerName = `E2E Customer ${suffix}`;
  const customerEmail = `e2e-customer-${suffix}@example.test`;
  const orderCustomerName = `E2E Order Customer ${suffix}`;
  const orderCustomerEmail = `e2e-order-${suffix}@example.test`;
  const employeeName = `E2E Employee ${suffix}`;
  const editedEmployeeName = `E2E Employee Edited ${suffix}`;
  let productId = null;
  let orderCustomerId = null;
  let employeeId = null;

  const electronApp = await electron.launch({
    args: ['desktop/main.js', '--no-sandbox'],
    env: { ...process.env, E2E_ELECTRON_TEST_MODE: 'true' },
  });

  try {
    const launcher = await electronApp.firstWindow();
    await expect(launcher.locator('#open-local')).toBeVisible();
    await launcher.locator('#open-local').click();
    await expect.poll(() => electronApp.windows().length, { timeout: 30_000 }).toBe(2);
    const page = electronApp.windows().find(window => window.url().includes('/#/nhan-vien/login'));
    expect(page, 'Electron phải mở cửa sổ đăng nhập nhân viên').toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.dashboard-sidebar')).toBeVisible();

    const navigate = async label => {
      await page.locator('.dashboard-nav-item').filter({ hasText: label }).click();
    };
    const dismissSuccess = async () => {
      const confirm = page.getByRole('button', { name: 'OK', exact: true });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
    };
    const confirmDanger = async () => {
      const confirm = page.getByRole('button', { name: /Xóa/ }).last();
      await expect(confirm).toBeVisible({ timeout: 5_000 });
      await confirm.click();
    };

    // CUSTOMER: create, edit, then anonymize/delete the disposable profile.
    await navigate('Khách hàng');
    await expect(page.getByRole('heading', { name: 'Quản lý khách hàng' })).toBeVisible();
    await page.getByRole('button', { name: /Thêm khách hàng/ }).click();
    await page.getByPlaceholder('Nguyễn Văn A').fill(customerName);
    await page.getByPlaceholder('email@example.com').fill(customerEmail);
    await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click();
    await expect(page.getByText(customerName, { exact: true })).toBeVisible({ timeout: 15_000 });

    let customerRow = page.locator('tr').filter({ hasText: customerName }).first();
    await customerRow.getByRole('button', { name: 'Sửa thông tin khách hàng' }).click();
    await page.getByPlaceholder('Nguyễn Văn A').fill(`${customerName} Edited`);
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText(`${customerName} Edited`, { exact: true })).toBeVisible({ timeout: 15_000 });
    customerRow = page.locator('tr').filter({ hasText: `${customerName} Edited` }).first();
    await customerRow.getByRole('button', { name: 'Xóa hồ sơ khách hàng' }).click();
    await confirmDanger();
    await expect(page.getByText(`${customerName} Edited`, { exact: true })).toHaveCount(0, { timeout: 15_000 });

    // PRODUCT: create and edit a product; its default variant will be stocked
    // only in the isolated CI PostgreSQL database for the order workflow below.
    await navigate('Sản phẩm');
    await expect(page.getByRole('heading', { name: 'Quản lý sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await page.getByPlaceholder('Áo thun...').fill(productName);
    const productForm = page.locator('form').filter({ has: page.getByPlaceholder('Áo thun...') });
    await productForm.locator('input[type="number"]').nth(0).fill('10000');
    await productForm.locator('input[type="number"]').nth(1).fill('25000');
    await productForm.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await expect(page.getByText(productName, { exact: true })).toBeVisible({ timeout: 15_000 });

    let productRow = page.locator('tr').filter({ hasText: productName }).first();
    await productRow.getByRole('button', { name: 'Chỉnh sửa' }).click();
    await page.getByPlaceholder('Áo thun...').fill(editedProductName);
    await page.locator('form').filter({ has: page.getByPlaceholder('Áo thun...') })
      .getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText(editedProductName, { exact: true })).toBeVisible({ timeout: 15_000 });

    const productResult = await db.query(
      `SELECT p.product_id, pv.variant_id
       FROM product p JOIN product_variant pv ON pv.product_id = p.product_id
       WHERE p.product_name = $1 AND p.is_active = TRUE AND pv.is_active = TRUE
       ORDER BY pv.is_default DESC LIMIT 1`,
      [editedProductName],
    );
    expect(productResult.rows.length, 'Sản phẩm phải có biến thể mặc định trong PostgreSQL').toBe(1);
    productId = productResult.rows[0].product_id;
    await db.query('UPDATE product_variant SET quantity = 5 WHERE variant_id = $1', [productResult.rows[0].variant_id]);

    // Create a second disposable customer, retained for the order-history relation.
    const customerInsert = await db.query(
      `INSERT INTO customer (full_name, email, gender)
       VALUES ($1, $2, 'Other') RETURNING customer_id`,
      [orderCustomerName, orderCustomerEmail],
    );
    orderCustomerId = customerInsert.rows[0].customer_id;

    // EMPLOYEE: create, edit, deactivate, then delete a disposable employee.
    await navigate('Nhân viên');
    await expect(page.getByRole('heading', { name: 'Nhân viên', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Thêm nhân viên' }).click();
    await page.getByPlaceholder('Họ tên *').fill(employeeName);
    await page.getByPlaceholder('Chức vụ *').fill('E2E Tester');
    await page.getByRole('button', { name: 'Lưu nhân viên' }).click();
    await expect(page.getByText(employeeName, { exact: true })).toBeVisible({ timeout: 15_000 });
    let employeeRow = page.locator('tr').filter({ hasText: employeeName }).first();
    await employeeRow.getByRole('button', { name: 'Sửa' }).click();
    await page.getByPlaceholder('Họ tên *').fill(editedEmployeeName);
    await page.getByLabel('Đang làm việc').uncheck();
    await page.getByRole('button', { name: 'Lưu nhân viên' }).click();
    await expect(page.getByText(editedEmployeeName, { exact: true })).toBeVisible({ timeout: 15_000 });
    employeeRow = page.locator('tr').filter({ hasText: editedEmployeeName }).first();
    await employeeRow.getByRole('button', { name: 'Xóa', exact: true }).click();
    await confirmDanger();
    await expect(page.getByText(editedEmployeeName, { exact: true })).toHaveCount(0, { timeout: 15_000 });

    // ORDER: create a counter order in the real Electron UI and transition it.
    await navigate('Đơn hàng');
    await expect(page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();
    await page.getByRole('button', { name: '+ Tạo đơn tại quầy' }).click();
    await expect(page.getByRole('heading', { name: 'Tạo đơn hàng tại quầy' })).toBeVisible();
    const orderForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Tạo đơn hàng tại quầy' }) });
    await orderForm.getByRole('combobox').nth(0).selectOption(String(orderCustomerId));
    await orderForm.getByRole('combobox').nth(1).selectOption(String(productId));
    await expect.poll(async () => orderForm.getByRole('combobox').nth(2).locator('option').count()).toBeGreaterThan(1);
    await orderForm.getByRole('combobox').nth(2).selectOption({ index: 1 });
    await orderForm.getByRole('button', { name: 'Tạo đơn hàng', exact: true }).click();
    await expect(page.getByText(/Đã tạo đơn hàng #/)).toBeVisible({ timeout: 15_000 });
    await dismissSuccess();

    const order = await db.query(
      `SELECT o.order_id, o.order_status
       FROM "order" o WHERE o.customer_id = $1
       ORDER BY o.order_id DESC LIMIT 1`,
      [orderCustomerId],
    );
    expect(order.rows.length).toBe(1);
    const orderId = order.rows[0].order_id;
    const orderRow = page.locator('tr').filter({ hasText: String(orderId) }).first();
    await expect(orderRow).toBeVisible({ timeout: 15_000 });
    await orderRow.getByLabel(`Trạng thái đơn ${orderId}`).selectOption('Confirmed');
    await expect.poll(async () => {
      const result = await db.query('SELECT order_status FROM "order" WHERE order_id=$1', [orderId]);
      return result.rows[0]?.order_status;
    }).toBe('Confirmed');

    // Soft-delete the disposable product after the order is created; history remains linked.
    await navigate('Sản phẩm');
    const finalProductRow = page.locator('tr').filter({ hasText: editedProductName }).first();
    await finalProductRow.getByRole('button', { name: 'Xóa' }).click();
    await confirmDanger();
    await expect(page.getByText(editedProductName, { exact: true })).toHaveCount(0, { timeout: 15_000 });
    const retainedOrder = await db.query('SELECT order_id FROM "order" WHERE order_id=$1', [orderId]);
    expect(retainedOrder.rowCount).toBe(1);
  } finally {
    await electronApp.close().catch(() => {});
    await db.end();
  }
});
