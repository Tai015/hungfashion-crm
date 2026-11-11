import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('Electron launcher mở local và đăng nhập nhân viên thật', async () => {
  const identifier = process.env.E2E_STAFF_IDENTIFIER;
  const password = process.env.E2E_STAFF_PASSWORD;
  expect(identifier, 'Thiếu E2E_STAFF_IDENTIFIER').toBeTruthy();
  expect(password, 'Thiếu E2E_STAFF_PASSWORD').toBeTruthy();

  const electronApp = await electron.launch({
    args: ['desktop/main.js', '--no-sandbox'],
    env: {
      ...process.env,
      E2E_ELECTRON_TEST_MODE: 'true',
    },
  });

  try {
    const launcherPage = await electronApp.firstWindow();
    await expect(launcherPage.locator('#open-local')).toBeVisible();

    // Click the same "Mở bản local" control that a user clicks in the desktop app.
    await launcherPage.locator('#open-local').click();

    await expect.poll(() => electronApp.windows().length, {
      message: 'Launcher phải mở thêm cửa sổ nhân viên trong Electron',
      timeout: 30_000,
    }).toBe(2);

    const employeePage = electronApp.windows().find((page) =>
      page.url().includes('/#/nhan-vien/login')
    );
    expect(employeePage, 'Không tìm thấy cửa sổ đăng nhập nhân viên do Electron mở').toBeTruthy();

    await expect(employeePage.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    expect(await employeePage.evaluate(() => window.storeAdminLauncher?.isElectronApp)).toBe(true);

    // Keep real Electron screenshots separate from test fixtures and credentials.
    const screenshotDir = path.resolve(
      process.env.E2E_SCREENSHOT_DIR || 'artifacts/electron-screenshots',
    );
    await mkdir(screenshotDir, { recursive: true });
    await employeePage.screenshot({
      path: path.join(screenshotDir, '01-employee-admin-login.png'),
      fullPage: true,
    });

    await employeePage.getByLabel('Tên đăng nhập hoặc email').fill(identifier);
    await employeePage.locator('input[type="password"]').fill(password);
    await employeePage.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(employeePage.getByRole('heading', { name: 'Đăng nhập' })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect.poll(() => employeePage.url(), { timeout: 20_000 }).toContain('#/admin/dashboard');
    await employeePage.waitForLoadState('domcontentloaded');
    await employeePage.screenshot({
      path: path.join(screenshotDir, '02-admin-dashboard.png'),
      fullPage: true,
    });
  } finally {
    await electronApp.close();
  }
});
