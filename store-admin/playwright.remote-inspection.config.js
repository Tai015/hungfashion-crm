import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'remote-site-inspection.spec.js',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/remote-site-inspection', open: 'never' }],
  ],
  outputDir: 'test-results/remote-site-inspection-run',
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
});
