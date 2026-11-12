import { test, expect } from '@playwright/test';

test('task discovery remains usable on a slow mobile connection', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Network throttling requires Chromium CDP');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 400_000 / 8,
    uploadThroughput: 400_000 / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
  const dismissLocation = page.getByRole('button', { name: 'לא עכשיו' });
  const heading = page.getByRole('heading', { name: 'מוצאים משימה' });
  await expect(dismissLocation.or(heading).first()).toBeVisible({ timeout: 60_000 });
  if (await dismissLocation.isVisible()) await dismissLocation.click();
  await expect(heading).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('searchbox', { name: 'חיפוש מטלות' })).toBeVisible();
  await expect(page.getByText(/נמצאו \d+ מטלות|לא נמצאו מטלות/).first()).toBeVisible({ timeout: 60_000 });
});
