import { test, expect } from '@playwright/test';

test('large task lists render on scroll and can also be shown in full', async ({ page }, testInfo) => {
  const tasks = Array.from({ length: 100 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    creator_id: '00000000-0000-4000-8000-000000000999',
    name: `מטלת בדיקה ${String(index + 1).padStart(3, '0')}`,
    short_desc: 'תיאור לבדיקת רשימה ארוכה', category: 'other', payment: 25,
    payment_type: 'task', location: '', scheduled_date: null, scheduled_time: null,
    duration_hours: null, workers_needed: 1, accepted_count: 0, status: 'open',
    latitude: null, longitude: null, publish_state: 'live',
  }));
  await page.addInitScript(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
  await page.route('**/rest/v1/tasks?*', (route) => route.fulfill({ json: tasks }));
  await page.route('**/rest/v1/user_role_ratings?*', (route) => route.fulfill({ json: [] }));
  await page.goto('/tasks');
  const dismiss = page.getByRole('button', { name: 'לא עכשיו' });
  const heading = page.getByRole('heading', { name: 'מטלות זמינות' });
  await expect(dismiss.or(heading).first()).toBeVisible();
  if (await dismiss.isVisible()) await dismiss.click();
  const cards = page.getByRole('button', { name: /^מטלה: מטלת בדיקה/ });
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThan(40);
  await page.screenshot({ path: testInfo.outputPath('task-list-start.png'), animations: 'disabled' });
  await cards.first().focus();
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-label^="מטלה: מטלת בדיקה"]')))).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole('button', { name: 'מטלה: מטלת בדיקה 100' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('task-list-end.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'הצגת כל המטלות ברצף' }).click();
  await expect(cards).toHaveCount(100);
  await page.getByRole('searchbox', { name: 'חיפוש מטלות' }).fill('מטלת בדיקה 099');
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'מטלה: מטלת בדיקה 099' })).toBeVisible();
});
