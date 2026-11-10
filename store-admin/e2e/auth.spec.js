import { test, expect } from '@playwright/test';

const customerPath = '/#/khach-hang/login';
const staffPath = '/#/nhan-vien/login';

async function gotoApp(page, path) {
  await page.goto(path);

  // The Preview may not have a reachable API. Dismiss the app's non-blocking
  // connectivity warning so this read-only UI check can still inspect the form.
  const backendWarning = page.getByRole('heading', { name: 'Không kết nối được máy chủ' });
  if (await backendWarning.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Đóng' }).click();
  }

  // Vercel Deployment Protection renders its own login page instead of the app.
  // Detect it explicitly so the failure explains the missing automation bypass.
  const vercelProtection = page.getByRole('heading', { name: /Log in to Vercel/i });
  const securityCheckpoint = page.getByText(/Security Checkpoint/i).first();
  if (await securityCheckpoint.isVisible().catch(() => false)) {
    throw new Error(
      'Vercel is showing a Security Checkpoint instead of the application. This is a Vercel edge/security challenge, not an application login failure. Review Vercel security/deployment settings and allow the GitHub Actions Preview request; do not weaken protection globally. The failure screenshot is retained as an artifact.'
    );
  }
  if (await vercelProtection.isVisible().catch(() => false)) {
    throw new Error(
      'Vercel Deployment Protection is blocking the Preview. Add the Vercel-generated automation bypass value as the GitHub Actions secret VERCEL_AUTOMATION_BYPASS_SECRET, then rerun this workflow. The test screenshot is retained as an artifact.'
    );
  }
}

async function expectLoginScreen(page, path, audienceLabel) {
  await gotoApp(page, path);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.getByText(audienceLabel, { exact: false })).toBeVisible();
  await expect(page.getByLabel('Tên đăng nhập hoặc email')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
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

  await gotoApp(page, customerPath);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0);
});

test('nhân viên đăng nhập thành công bằng tài khoản E2E', async ({ page }) => {
  const identifier = process.env.E2E_STAFF_IDENTIFIER;
  const password = process.env.E2E_STAFF_PASSWORD;
  test.skip(!identifier || !password, 'Chưa cấu hình GitHub Secrets cho tài khoản nhân viên E2E.');

  await gotoApp(page, staffPath);
  await page.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0);
});
