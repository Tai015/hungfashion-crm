import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const cleanupPool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let createdUsername = null;

test.afterEach(async () => {
  if (!createdUsername) return;
  const username = createdUsername;
  createdUsername = null;
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM customer_interest
       WHERE customer_id IN (SELECT customer_id FROM customer WHERE account_id IN
         (SELECT account_id FROM account WHERE username = $1))`, [username],
    );
    await client.query(
      `DELETE FROM account_sessions WHERE account_id IN
         (SELECT account_id FROM account WHERE username = $1)`, [username],
    );
    await client.query(
      `DELETE FROM customer WHERE account_id IN
         (SELECT account_id FROM account WHERE username = $1)`, [username],
    );
    await client.query('DELETE FROM account WHERE username = $1', [username]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

test.afterAll(async () => cleanupPool.end());

const TOKEN_KEY = 'hung-fashion-access-token';

async function openRegistration(page) {
  await page.goto('/#/khach-hang/register');
  await expect(page.getByRole('heading', { name: /Tạo tài khoản/ })).toBeVisible();
}

async function fillRegistration(page, account) {
  await page.getByLabel('Họ và tên').fill(account.full_name);
  await page.getByLabel('Ngày sinh').fill(account.date_of_birth);
  await page.getByLabel('Tên đăng nhập').fill(account.username);
  await page.getByLabel('Email').fill(account.email);
  await page.locator('input[autocomplete="new-password"]').fill(account.password);
}

async function dismissSuccess(page) {
  const toast = page.locator('.swal2-popup');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Thành công');
  await page.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(toast).toBeHidden();
}

test('API + PostgreSQL thật: đăng ký mới, từ chối trùng tài khoản và đăng nhập được', async ({ page }) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const account = {
    username: `e2e_${suffix}`,
    email: `e2e+${suffix}@example.test`,
    password: 'E2eCustomerPass123!',
    full_name: 'E2E PostgreSQL Customer',
    date_of_birth: '1998-05-12',
  };

  createdUsername = account.username;

  // Không mock API: các request đi qua Vite proxy tới Express và PostgreSQL của CI.
  await openRegistration(page);
  await fillRegistration(page, account);
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  await dismissSuccess(page);

  await expect(page).toHaveURL(/#\/khach-hang\/login$/);
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).toBeNull();

  // Đăng ký lại đúng username/email: unique constraint trong PostgreSQL phải trả HTTP 409.
  await openRegistration(page);
  await fillRegistration(page, account);
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  const duplicateDialog = page.locator('.swal2-popup');
  await expect(duplicateDialog).toBeVisible();
  await expect(duplicateDialog).toContainText('Đăng ký thất bại');
  await expect(duplicateDialog).toContainText('Tên đăng nhập hoặc email đã được sử dụng.');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(duplicateDialog).toBeHidden();

  // Đăng nhập bằng chính thông tin vừa được lưu trong DB.
  await page.goto('/#/khach-hang/login');
  await page.getByLabel('Tên đăng nhập hoặc email').fill(account.username);
  await page.locator('input[autocomplete="current-password"]').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await dismissSuccess(page);
  await expect(page).toHaveURL(/#\/khach-hang\/catalog$/);
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), TOKEN_KEY)).not.toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
});
