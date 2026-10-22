import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('free-task banner reflects server eligibility and stays hidden for guests', async ({ page }, testInfo) => {
  test.skip(!api || !service, 'Requires local Supabase via scripts/task-completion-e2e.sh');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `pricing-free-${crypto.randomUUID()}@example.test`;
  const password = `Pricing-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const setting = await admin.from('billing_settings').select('value').eq('key', 'task_billing').single();
  expect(setting.error).toBeNull();
  try {
    expect((await admin.from('billing_settings').update({ value: 'on' }).eq('key', 'task_billing')).error).toBeNull();
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'תוכניות מנוי 🐝' })).toBeVisible();
    await expect(page.getByTestId('first-task-free')).toHaveCount(0);
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await page.reload();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
    await page.goto('/pricing');
    await expect(page.getByTestId('first-task-free')).toBeVisible();
    await expect(page.getByText('פעם אחת לכל משתמש, ובלי כרטיס אשראי.', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('eligible.png'), fullPage: true, animations: 'disabled' });
    expect((await admin.from('billing_user_state').upsert({ user_id: id, free_task_used_at: new Date().toISOString() })).error).toBeNull();
    const response = page.waitForResponse(r => r.url().includes('/rpc/my_publish_quote'));
    await page.reload();
    const quote = await response;
    expect((await quote.json()).free_slot).toBe(false);
    await expect(page.getByTestId('first-task-free')).toHaveCount(0);
    await expect(page.getByText('פעם אחת לכל משתמש, ובלי כרטיס אשראי.', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('used.png'), fullPage: true, animations: 'disabled' });
  } finally {
    expect((await admin.from('billing_settings').update({ value: setting.data!.value }).eq('key', 'task_billing')).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
