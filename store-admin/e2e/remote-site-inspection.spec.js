import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const targetUrl = process.env.E2E_INSPECT_URL || 'https://test.taitechshop.store/';
const allowedHosts = new Set(['test.taitechshop.store']);

function safeTargetUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
    throw new Error('E2E_INSPECT_URL must be an HTTPS URL on test.taitechshop.store');
  }
  return parsed.toString();
}

async function collectPage(page, label) {
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

  const response = await page.goto(safeTargetUrl(targetUrl), {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await expect(page.locator('#root')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#root');
    return Boolean(root && root.innerText.trim().length > 0);
  }, { timeout: 30_000 });

  // Allow client-side lazy content and fonts to settle without waiting for
  // long-lived analytics, websocket, or event-stream requests.
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
      headings: [...document.querySelectorAll('h1,h2,h3')]
        .filter(visible).map(text).filter(Boolean).slice(0, 80),
      buttons: [...document.querySelectorAll('button,[role="button"]')]
        .filter(visible).map(text).filter(Boolean).slice(0, 100),
      links: [...document.querySelectorAll('a[href]')]
        .filter(visible).map((a) => ({ text: text(a), href: a.href }))
        .slice(0, 100),
      inputs: [...document.querySelectorAll('input,textarea,select')]
        .filter(visible).map((el) => ({
          type: el.type || el.tagName.toLowerCase(),
          name: el.name || '',
          placeholder: el.placeholder || '',
          ariaLabel: el.getAttribute('aria-label') || '',
        })).slice(0, 80),
      bodyText: (document.body.innerText || '').trim().slice(0, 30_000),
      rootText: (document.querySelector('#root')?.innerText || '').trim().slice(0, 30_000),
      storageKeys: (() => {
        try { return Object.keys(localStorage); } catch { return []; }
      })(),
    };
  });

  const health = await page.request.get(new URL('/api/health', safeTargetUrl(targetUrl)).toString(), {
    timeout: 15_000,
  }).then(async (res) => ({
    status: res.status(),
    body: (await res.text()).slice(0, 2000),
  })).catch((error) => ({ error: error.message }));

  await fs.mkdir('test-results/remote-site-inspection', { recursive: true });
  await page.screenshot({
    path: path.join('test-results/remote-site-inspection', `${label}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await fs.writeFile(
    path.join('test-results/remote-site-inspection', `${label}.json`),
    JSON.stringify({ label, httpStatus: response?.status(), snapshot, health, errors, failedRequests }, null, 2),
  );
  await fs.writeFile(
    path.join('test-results/remote-site-inspection', `${label}.txt`),
    snapshot.bodyText,
  );

  console.log(`\\n[REMOTE SITE INSPECTION: ${label}]\\n${JSON.stringify({
    httpStatus: response?.status(),
    title: snapshot.title,
    url: snapshot.url,
    viewport: snapshot.viewport,
    headings: snapshot.headings,
    buttons: snapshot.buttons,
    links: snapshot.links,
    inputs: snapshot.inputs,
    health,
    consoleOrPageErrors: errors.slice(0, 30),
    failedRequests: failedRequests.slice(0, 30),
    bodyText: snapshot.bodyText.slice(0, 10_000),
  }, null, 2)}\\n[/REMOTE SITE INSPECTION]`);

  expect(response, 'The website should return an HTTP response').toBeTruthy();
  expect(response.status(), 'The website should return a successful HTTP status').toBeLessThan(400);
  expect(snapshot.rootText.length, 'React should render readable content inside #root').toBeGreaterThan(0);
}

test('capture rendered Hung Fashion website in desktop Chromium', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await collectPage(page, 'desktop');
});

test('capture rendered Hung Fashion website in mobile Chromium', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await collectPage(page, 'mobile');
  } finally {
    await context.close();
  }
});
