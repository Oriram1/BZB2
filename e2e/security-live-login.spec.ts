import { test, expect } from '@playwright/test';

test('existing E2E account can sign in and read its profile after permission changes', async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_USER_A_EMAIL || !process.env.E2E_USER_A_PASSWORD, 'Requires configured E2E account');
  await page.addInitScript(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
  const failures: string[] = [];
  page.on('response', response => {
    if (response.url().includes('/rest/v1/') && response.status() >= 400) failures.push(new URL(response.url()).pathname);
  });
  await page.goto('/login');
  await page.locator('input[type=email]').fill(process.env.E2E_USER_A_EMAIL!);
  await page.locator('input[type=password]').fill(process.env.E2E_USER_A_PASSWORD!);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('button', { name: 'עריכה', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'עריכה', exact: true }).click();
  await expect(page.locator('main input').first()).toBeVisible();
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('authenticated-profile.png'), fullPage: true, animations: 'disabled' });
});
