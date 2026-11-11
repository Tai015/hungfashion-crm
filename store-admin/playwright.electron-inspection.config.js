import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'electron-inspection.spec.js',
  timeout: 120_000,
  expect: { timeout: 45_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/electron-inspection', open: 'never' }]],
  outputDir: 'test-results/electron-inspection-run',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
});
