import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('replace a card on a nonrenewing trial and return to the subscription', async ({ page }, testInfo) => {
  test.skip(!api || !anon || !service, 'Run scripts/task-completion-e2e.sh with local Supabase.');
  test.setTimeout(90_000);
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `card-update-${crypto.randomUUID()}@example.test`;
  const password = `Card-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const chargeId = crypto.randomUUID();
  try {
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    expect((await admin.from('subscriptions').insert({ user_id: id, plan_id: 'quarterly', status: 'active',
      current_period_start: '2026-10-01T00:00:00Z', current_period_end: '2027-01-01T00:00:00Z',
      cancel_at_period_end: true, is_trial: true, card_last4: '2444' })).error).toBeNull();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await page.reload();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
    await page.goto('/subscription');
    await expect(page.getByText('לא יתחדש', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('subscription-card-update.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Provider and DB settlement are tested separately in wallet.e2e.test.ts.
    let attempt = 0;
    await page.route('**/functions/v1/task-pay', async route => {
      expect(route.request().postDataJSON()).toEqual({ action: 'update_card' });
      attempt++;
      await route.fulfill(attempt === 1
        ? { status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'payment_unavailable' }) }
        : { contentType: 'application/json', body: JSON.stringify({ url: `${new URL(page.url()).origin}/billing/return?charge=${chargeId}&result=success&flow=card-update` }) });
    });
    await page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true }).click();
    await expect(page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'חזרה למנוי מתחדש', exact: true })).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem('bzb.pendingTaskDraft', '{"name":"pending draft"}'));
    await page.route('**/functions/v1/billing-confirm', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'paid', cardUpdated: true }) }));
    await page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'הכרטיס הוחלף בהצלחה' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('card-update-success.png'), fullPage: true });
    await page.getByRole('link', { name: 'למנוי שלי', exact: true }).click();
    await expect(page.getByText('לא יתחדש', { exact: true })).toBeVisible();
    await page.goto(`/billing/return?charge=${chargeId}&result=cancel&flow=card-update`);
    await page.unroute('**/functions/v1/billing-confirm');
    await page.route('**/functions/v1/billing-confirm', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'pending' }) }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'החלפת הכרטיס לא הושלמה' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'חזרה למנוי שלי' })).toHaveAttribute('href', '/subscription');
  } finally {
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
