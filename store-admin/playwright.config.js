import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL?.trim().replace(/\/+$/, '');

if (!baseURL) {
  throw new Error(
    'E2E_BASE_URL is required. Set it to the Vercel Preview URL or local API URL before running Playwright.'
  );
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    extraHTTPHeaders: process.env.E2E_VERCEL_BYPASS_TOKEN
      ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS_TOKEN }
      : undefined,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
