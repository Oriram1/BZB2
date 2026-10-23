import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('wallet choice opens checkout immediately and an unpaid task never charges the saved card', async ({ page }, testInfo) => {
  test.skip(!api || !service, 'Requires local Supabase');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `choice-${crypto.randomUUID()}@example.test`;
  const password = `Choice-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const setting = await admin.from('billing_settings').select('value').eq('key', 'task_billing').single();
  expect(setting.error).toBeNull();
  let taskId: string | undefined;
  try {
    expect((await admin.from('billing_settings').update({ value: 'on' }).eq('key', 'task_billing')).error).toBeNull();
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    expect((await admin.from('billing_user_state').upsert({ user_id: id, free_task_used_at: new Date().toISOString() })).error).toBeNull();
    expect((await admin.rpc('save_payment_method', { _user_id: id, _token: 'saved-choice-token', _card_last4: '2444', _card_expiry: '1230' })).error).toBeNull();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await page.reload();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
    await page.evaluate(() => sessionStorage.setItem('bzb.pendingTaskDraft', JSON.stringify({ form: {
      category: 'housework', taskName: 'בחירת אמצעי תשלום', shortDesc: 'בדיקה מקומית', fullDesc: '', payment: '10', paymentType: 'task',
      workers: '1', location: 'תל אביב', date: '2027-01-01', time: '10:00', duration: '1', durationUnit: 'days', expiry: '3', notes: '',
    }, lat: null, lng: null, insurance: true, imageUrl: null })));
    await page.goto('/create-task?resume=1');
    await page.getByRole('button', { name: 'פרסם מטלה', exact: false }).click();
    await expect(page.getByTestId('charge-confirm')).toContainText('2444');
    await page.getByRole('radio', { name: 'תשלום עכשיו - Apple Pay, Google Pay או Bit', exact: true }).check();
    await expect(page.getByTestId('charge-confirm')).toContainText('ותשלמו עכשיו');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('payment-choice.png'), fullPage: false, animations: 'disabled' });
    let checkoutRequested = false;
    await page.route('**/functions/v1/task-pay', async route => {
      const body = route.request().postDataJSON();
      expect(body.action).toBe('wallet');
      checkoutRequested = true;
      await route.fulfill({ json: { url: `${new URL(page.url()).origin}/test-checkout` } });
    });
    const popupPromise = page.waitForEvent('popup');
    const insertedResponse = page.waitForResponse(r => r.url().includes('/rest/v1/tasks') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'שליחה לאישור ומעבר לתשלום', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/test-checkout$/);
    expect(checkoutRequested).toBe(true);
    await popup.close();
    const inserted = await insertedResponse;
    expect(inserted.ok(), JSON.stringify(await inserted.json())).toBe(true);
    await expect(page).toHaveURL(/\/my-tasks\?tab=published$/);
    const task = await admin.from('tasks').select('id,payment_mode,publish_state').eq('creator_id', id).single();
    expect(task.error).toBeNull();
    taskId = task.data!.id;
    expect(task.data!.payment_mode).toBe('one_time');
    expect(task.data!.publish_state).toBe('pending_review');
    await expect(page.getByText('אפשר לשלם כבר עכשיו', { exact: false })).toBeVisible();
    const reviewed = await admin.rpc('task_review_decide', { _task_id: taskId, _admin_id: id, _approve: true });
    expect(reviewed.error).toBeNull();
    expect(reviewed.data.state).toBe('pending_payment');
    expect((await admin.from('billing_charges').select('id').eq('task_id', taskId)).data).toEqual([]);
    await page.reload();
    await expect(page.getByText('הכרטיס השמור לא חויב.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'לנסות שוב', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'תשלום חד-פעמי', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'תשלום ב-Bit', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('awaiting-payment.png'), fullPage: true, animations: 'disabled' });
  } finally {
    if (taskId) expect((await admin.from('tasks').delete().eq('id', taskId)).error).toBeNull();
    expect((await admin.from('billing_settings').update({ value: setting.data!.value }).eq('key', 'task_billing')).error).toBeNull();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
