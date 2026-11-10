import { defineConfig } from '@playwright/test';

const configuredBaseUrl = process.env.E2E_BASE_URL?.trim();

if (!configuredBaseUrl) {
  throw new Error(
    'Thiếu E2E_BASE_URL. Hãy chọn Local/Render trong Electron Launcher hoặc đặt E2E_BASE_URL trước khi chạy Playwright.',
  );
}

let baseURL;
try {
  const parsedUrl = new URL(configuredBaseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Chỉ chấp nhận HTTP hoặc HTTPS.');
  }
  baseURL = parsedUrl.href.replace(/\/+$/, '');
} catch (error) {
  throw new Error(`E2E_BASE_URL không hợp lệ ("${configuredBaseUrl}"): ${error.message}`);
}

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: process.env.E2E_HEADED !== '1',
    navigationTimeout: 150_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
