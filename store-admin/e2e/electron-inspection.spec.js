import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outputDir = 'test-results/electron-inspection';

test('capture real Electron launcher, employee login and test center', async () => {
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
    await expect(employeeWindow.locator('body')).not.toBeEmpty({ timeout: 45_000 });
    await expect(employeeWindow.locator('input').first()).toBeVisible({ timeout: 45_000 });
    await employeeWindow.screenshot({ path: `${outputDir}/electron-employee-login.png`, fullPage: true });

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
