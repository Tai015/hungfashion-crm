import { test, expect } from '@playwright/test';

const TOKEN_KEY = 'hung-fashion-access-token';
const loginPath = '/#/nhan-vien/login';

async function openStaffLogin(page) {
  await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.goto(loginPath);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await page.getByLabel('Tên đăng nhập hoặc email').fill('e2e-staff');
  await page.locator('input[autocomplete="current-password"]').fill('WrongOrTestPass123!');
}

test('hiện lại cảnh báo khi nhập sai cùng thông tin hai lần', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/auth/login', route => {
    attempts += 1;
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Thông tin đăng nhập không chính xác.' }),
    });
  });

  await openStaffLogin(page);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    const dialog = page.locator('.swal2-popup');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Đăng nhập thất bại');
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(dialog).toBeHidden();
  }

  expect(attempts).toBe(2);
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
});

test('chỉ lưu token và chuyển trang sau khi xác nhận đăng nhập thành công', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'e2e-success-token',
      user: { account_id: 7, username: 'e2e-staff', full_name: 'E2E Staff', role: 'ADMIN' },
    }),
  }));

  await openStaffLogin(page);
  await page.locator('input[autocomplete="current-password"]').fill('CorrectTestPass123!');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  const dialog = page.locator('.swal2-popup');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Đăng nhập thành công');
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  await expect(page).toHaveURL(/#\/nhan-vien\/login$/);

  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBe('e2e-success-token');
  await expect(page).toHaveURL(/#\/admin\/dashboard$/);
});

test('bấm bên ngoài thông báo thành công vẫn lưu token và chuyển trang', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'e2e-outside-token',
      user: { account_id: 8, username: 'e2e-staff', full_name: 'E2E Staff', role: 'ADMIN' },
    }),
  }));

  await openStaffLogin(page);
  await page.locator('input[autocomplete="current-password"]').fill('CorrectTestPass123!');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  const dialog = page.locator('.swal2-popup');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();

  // Click the backdrop, well outside the centered SweetAlert popup.
  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBe('e2e-outside-token');
  await expect(page).toHaveURL(/#\/admin\/dashboard$/);
});
