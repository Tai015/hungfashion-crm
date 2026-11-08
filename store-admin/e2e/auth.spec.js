import { test, expect } from '@playwright/test';

const customerPath = '/#/khach-hang/login';
const staffPath = '/#/nhan-vien/login';

async function expectLoginScreen(page, path, audienceLabel) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByText(audienceLabel, { exact: false })).toBeVisible();
  await expect(page.getByLabel('Tên đăng nhập hoặc email')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
}

test('màn hình đăng nhập khách hàng hiển thị đúng', async ({ page }) => {
  await expectLoginScreen(page, customerPath, 'Cửa hàng');
});

test('màn hình đăng nhập nhân viên hiển thị đúng', async ({ page }) => {
  await expectLoginScreen(page, staffPath, 'Nhân viên');
});

test('khách hàng đăng nhập thành công bằng tài khoản E2E', async ({ page }) => {
  const identifier = process.env.E2E_CUSTOMER_IDENTIFIER;
  const password = process.env.E2E_CUSTOMER_PASSWORD;
  test.skip(!identifier || !password, 'Chưa cấu hình GitHub Secrets cho tài khoản khách hàng E2E.');

  await page.goto(customerPath);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0);
});

test('nhân viên đăng nhập thành công bằng tài khoản E2E', async ({ page }) => {
  const identifier = process.env.E2E_STAFF_IDENTIFIER;
  const password = process.env.E2E_STAFF_PASSWORD;
  test.skip(!identifier || !password, 'Chưa cấu hình GitHub Secrets cho tài khoản nhân viên E2E.');

  await page.goto(staffPath);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0);
});
