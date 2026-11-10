import { test, expect } from '@playwright/test';

test('Production API health endpoint responds without changing data', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
});

test('Production serves the HungFashion application shell', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('#root')).toBeAttached();
  await expect(page).not.toHaveTitle(/Log in to Vercel|Security Checkpoint/i);
});
