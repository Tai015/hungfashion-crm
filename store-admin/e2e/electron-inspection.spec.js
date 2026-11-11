import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'test-results/electron-inspection';

test('capture Electron launcher, employee login, admin dashboard and test center', async () => {
  const identifier = process.env.E2E_ADMIN_IDENTIFER;
  const password = process.env.E2E_ADMIN_PASSWORD;
  expect(identifier, 'GitHub Secret E2E_ADMIN_IDENTIFER must be configured').toBeTruthy();
  expect(password, 'GitHub Secret E2E_ADMIN_PASSWORD must be configured').toBeTruthy();

  await mkdir(outputDir, { recursive: true });

  const electronApp = await electron.launch({
    args: ['desktop/main.js', '--no-sandbox'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: '1',
    },
  });

  try {
    const launcher = await electronApp.firstWindow();
    await expect(launcher.locator('h1')).toHaveText('Store Admin');
    await expect(launcher.locator('#open-deploy')).toBeVisible();
    await launcher.screenshot({ path: `${outputDir}/electron-launcher.png`, fullPage: true });

    await launcher.locator('#open-deploy').click();
    await expect.poll(
      async () => (await electronApp.windows()).some((page) => page.url().includes('#/nhan-vien/login')),
      { timeout: 60_000, message: 'Electron employee login window should open' },
    ).toBe(true);

    const employeeWindow = (await electronApp.windows()).find((page) => page.url().includes('#/nhan-vien/login'));
    await expect(employeeWindow.locator('input[autocomplete="username"]')).toBeVisible({ timeout: 45_000 });
    await employeeWindow.screenshot({ path: `${outputDir}/electron-employee-login.png`, fullPage: true });

    await employeeWindow.locator('input[autocomplete="username"]').fill(identifier);
    await employeeWindow.locator('input[autocomplete="current-password"]').fill(password);
    await employeeWindow.locator('form button[type="submit"]').click();

    // Successful authentication redirects ADMIN accounts to the admin dashboard.
    // Do not persist credentials or include them in diagnostics/artifacts.
    await expect.poll(
      () => employeeWindow.evaluate(() => window.location.hash),
      { timeout: 60_000, message: 'Admin credentials should authenticate and redirect to the dashboard' },
    ).toBe('#/admin/dashboard');
    await expect(employeeWindow.locator('body')).not.toContainText('Đăng nhập vào khu vực quản lý');
    await expect(employeeWindow.locator('body')).toContainText('Tổng quan', { timeout: 30_000 });
    await employeeWindow.screenshot({ path: `${outputDir}/electron-admin-dashboard.png`, fullPage: true });

    await launcher.locator('#open-test-center').click();
    await expect.poll(
      async () => (await electronApp.windows()).some((page) => page.url().includes('test-center.html')),
      { timeout: 15_000, message: 'Electron test center window should open' },
    ).toBe(true);

    const testCenter = (await electronApp.windows()).find((page) => page.url().includes('test-center.html'));
    await expect(testCenter.locator('h1')).toHaveText('Trung tâm kiểm thử');
    await testCenter.screenshot({ path: `${outputDir}/electron-test-center.png`, fullPage: true });
  } finally {
    await electronApp.close();
  }
});
