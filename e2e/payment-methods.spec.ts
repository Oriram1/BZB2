import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('one-time wallets and Bit preserve card choice and handle unavailable Bit', async ({ page }, testInfo) => {
  test.skip(!api || !anon || !service, 'Requires local Supabase via scripts/task-completion-e2e.sh');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `methods-${crypto.randomUUID()}@example.test`;
  const password = `Methods-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  let taskId: string | undefined;
  try {
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    const task = await admin.from('tasks').insert({ creator_id: id, name: 'תשלום למטלת בדיקה', short_desc: 'בדיקת אמצעי תשלום', category: 'housework', payment: 50 }).select('id').single();
    expect(task.error).toBeNull();
    taskId = task.data!.id;
    expect((await admin.from('tasks').update({ publish_state: 'pending_payment', payment_due: 8 }).eq('id', taskId)).error).toBeNull();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await page.reload();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
    await page.goto('/my-tasks?tab=published');
    await expect(page.getByRole('button', { name: 'תשלום ב-Bit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('payment-methods.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'לשלם בכרטיס אחר', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('שמירת כרטיס מחייבת כרטיס אשראי רגיל');
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('הכרטיס לא יישמר');
    await page.getByRole('button', { name: 'חזרה', exact: true }).click();
    await page.context().route('**/functions/v1/task-pay', async route => {
      expect(route.request().postDataJSON()).toEqual({ action: 'bit', task_id: taskId });
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'bit_unavailable' }) });
    });
    await page.getByRole('button', { name: 'תשלום ב-Bit', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('סיכום תשלום ב-Bit');
    await expect(page.getByRole('dialog')).toContainText('הכרטיס לא יישמר');
    await page.screenshot({ path: testInfo.outputPath('bit-summary.png'), fullPage: true, animations: 'disabled' });
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true }).click();
    const popup = await popupPromise;
    await expect.poll(() => popup.isClosed()).toBe(true);
    await expect(page.getByText('תשלום ב-Bit עדיין לא זמין. אפשר לשלם בכרטיס או בארנק דיגיטלי', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true })).toBeEnabled();
  } finally {
    if (taskId) expect((await admin.from('tasks').delete().eq('id', taskId)).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
