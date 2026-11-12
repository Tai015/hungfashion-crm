import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.E2E_INSPECT_URL || 'https://test.taitechshop.store/';
const allowedHosts = new Set(['test.taitechshop.store']);

function safeTargetUrl(route = '/') {
  const parsed = new URL(route, baseUrl);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('E2E_INSPECT_URL must be an HTTPS URL on test.taitechshop.store');
  }
  return parsed.toString();
}

async function capturePage(page, label, route = '/') {
  const errors = [];
  const failedRequests = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || 'unknown',
    });
  });

  const response = await page.goto(safeTargetUrl(route), {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await expect(page.locator('#root')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#root');
    return Boolean(root && root.innerText.trim().length > 0);
  }, { timeout: 30_000 });
  await page.waitForTimeout(1500);

  const snapshot = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' &&
        rect.width > 0 && rect.height > 0;
    };
    const text = (element) => (element.innerText || element.getAttribute('aria-label') || '').trim();
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(text).filter(Boolean),
      buttons: [...document.querySelectorAll('button,[role="button"]')].filter(visible).map(text).filter(Boolean),
      links: [...document.querySelectorAll('a[href]')].filter(visible)
        .map((a) => ({ text: text(a), href: a.href })),
      inputs: [...document.querySelectorAll('input,textarea,select')].filter(visible).map((el) => ({
        type: el.type || el.tagName.toLowerCase(),
        name: el.name || '',
        placeholder: el.placeholder || '',
        ariaLabel: el.getAttribute('aria-label') || '',
      })),
      bodyText: (document.body.innerText || '').trim().slice(0, 30_000),
      rootText: (document.querySelector('#root')?.innerText || '').trim().slice(0, 30_000),
    };
  });

  await fs.mkdir('test-results/remote-site-inspection', { recursive: true });
  await page.screenshot({
    path: path.join('test-results/remote-site-inspection', `${label}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await fs.writeFile(
    path.join('test-results/remote-site-inspection', `${label}.json`),
    JSON.stringify({ label, httpStatus: response?.status(), snapshot, errors, failedRequests }, null, 2),
  );
  await fs.writeFile(
    path.join('test-results/remote-site-inspection', `${label}.txt`),
    snapshot.bodyText,
  );

  console.log(`[REMOTE SITE INSPECTION: ${label}] ${JSON.stringify({
    httpStatus: response?.status(),
    url: snapshot.url,
    viewport: snapshot.viewport,
    headings: snapshot.headings,
    buttons: snapshot.buttons,
    links: snapshot.links,
    inputs: snapshot.inputs,
    errors: errors.slice(0, 30),
    failedRequests: failedRequests.slice(0, 30),
    bodyText: snapshot.bodyText.slice(0, 8000),
  })}`);

  expect(response, 'The website should return an HTTP response').toBeTruthy();
  expect(response.status(), 'The website should return a successful HTTP status').toBeLessThan(400);
  expect(snapshot.rootText.length, 'React should render readable content inside #root').toBeGreaterThan(0);
  return snapshot;
}

test('capture Hung Fashion public storefront on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capturePage(page, 'desktop-storefront', '/');
});

test('capture customer login page on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const snapshot = await capturePage(page, 'customer-login', '/#/khach-hang/login');
  expect(snapshot.rootText).toMatch(/Đăng nhập/i);
  expect(snapshot.inputs.length, 'Customer login should show form inputs').toBeGreaterThanOrEqual(2);
});

test('capture customer registration page on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const snapshot = await capturePage(page, 'customer-register', '/#/khach-hang/register');
  expect(snapshot.rootText).toMatch(/Đăng ký|Tạo tài khoản/i);
  expect(snapshot.inputs.length, 'Customer registration should show form inputs').toBeGreaterThanOrEqual(4);
});
