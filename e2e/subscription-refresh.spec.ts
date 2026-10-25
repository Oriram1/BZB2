import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('subscription survives a fresh login and refresh recovers from a network error', async ({ page, browser }, testInfo) => {
  test.skip(!api || !anon || !service, 'Requires local Supabase.');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `restore-${crypto.randomUUID()}@example.test`;
  const password = `Restore-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const fresh = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    expect((await admin.from('subscriptions').insert({ user_id: id, plan_id: 'quarterly', status: 'active',
      current_period_start: '2026-10-01T00:00:00Z', current_period_end: '2027-01-01T00:00:00Z',
      cancel_at_period_end: false, is_trial: false })).error).toBeNull();
    for (const session of [page, await fresh.newPage()]) {
      await session.goto('/login');
      await session.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
      await session.reload();
      await session.locator('input[type=email]').fill(email);
      await session.locator('input[type=password]').fill(password);
      await session.locator('button[type=submit]').click();
      await expect(session).toHaveURL(/\/tasks$/, { timeout: 20_000 });
      await session.goto('/subscription');
      await expect(session.getByText('פעיל', { exact: true })).toBeVisible();
    }
    await page.route('**/rest/v1/subscriptions?*', route => route.fulfill({ status: 503, headers: { 'Retry-After': '0', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After' },
      contentType: 'application/json', body: JSON.stringify({ message: 'test unavailable' }) }));
    await page.getByRole('button', { name: 'רענון מצב המנוי', exact: true }).click();
    await expect(page.getByText('לא הצלחנו לבדוק את מצב המנוי. אפשר לנסות שוב.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('subscription-refresh-error.png'), fullPage: true });
    await page.unroute('**/rest/v1/subscriptions?*');
    await page.getByRole('button', { name: 'רענון מצב המנוי', exact: true }).click();
    await expect(page.getByText('המנוי שלכם זמין בחשבון הזה')).toBeVisible();
    await expect(page.getByText('פעיל', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('subscription-refresh-active.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await admin.from('subscriptions').delete().eq('user_id', id)).error).toBeNull();
    await page.getByRole('button', { name: 'רענון מצב המנוי', exact: true }).click();
    await expect(page.getByText('לא נמצא מנוי פעיל בחשבון הזה')).toBeVisible();
    await expect(page.getByText('אין מנוי פעיל', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('subscription-refresh-empty.png'), fullPage: true });
  } finally {
    await fresh.close();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
