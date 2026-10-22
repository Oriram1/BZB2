import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('replace a card on a nonrenewing trial and return to the subscription', async ({ page }, testInfo) => {
  test.skip(!api || !anon || !service, 'Run scripts/task-completion-e2e.sh with local Supabase.');
  test.setTimeout(120_000);
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
    await page.context().route('**/functions/v1/task-pay', async route => {
      expect(route.request().postDataJSON()).toEqual({ action: 'update_card' });
      attempt++;
      await route.fulfill(attempt === 1
        ? { status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'payment_unavailable' }) }
        : { contentType: 'application/json', body: JSON.stringify({ url: `${new URL(page.url()).origin}/billing/return?charge=${chargeId}&result=success&flow=card-update` }) });
    });
    await page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('סה״כ לתשלום עכשיו');
    await page.screenshot({ path: testInfo.outputPath('payment-summary.png'), fullPage: false, animations: 'disabled' });
    const failedPopupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true }).click();
    const failedPopup = await failedPopupPromise;
    await expect.poll(() => failedPopup.isClosed()).toBe(true);
    await expect(page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true })).toBeEnabled();
    await page.getByRole('dialog').getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(page.getByRole('button', { name: 'חזרה למנוי מתחדש', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'החלפת כרטיס אשראי', exact: true }).click();
    await page.evaluate(() => sessionStorage.setItem('bzb.pendingTaskDraft', '{"name":"pending draft"}'));
    await page.context().route('**/functions/v1/billing-confirm', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'paid', cardUpdated: true }) }));
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true }).click();
    const checkoutPage = await popupPromise;
    await expect(page).toHaveURL(/\/subscription$/);
    await expect(checkoutPage.getByRole('heading', { name: 'הכרטיס הוחלף בהצלחה' })).toBeVisible();
    await checkoutPage.screenshot({ path: testInfo.outputPath('card-update-success.png'), fullPage: true });
    await checkoutPage.getByRole('link', { name: 'למנוי שלי', exact: true }).click();
    await expect(page.getByText('לא יתחדש', { exact: true })).toBeVisible();
    await checkoutPage.goto(`/billing/return?charge=${chargeId}&result=cancel&flow=card-update`);
    await page.context().unroute('**/functions/v1/billing-confirm');
    await page.context().route('**/functions/v1/billing-confirm', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'pending' }) }));
    await checkoutPage.reload();
    await expect(checkoutPage.getByRole('heading', { name: 'החלפת הכרטיס לא הושלמה' })).toBeVisible({ timeout: 10_000 });
    await expect(checkoutPage.getByRole('link', { name: 'חזרה למנוי שלי' })).toHaveAttribute('href', '/subscription');
    await checkoutPage.close();
    expect((await admin.from('subscriptions').delete().eq('user_id', id)).error).toBeNull();
    await page.goto('/pricing?plan=quarterly&checkout=1');
    await expect(page.getByRole('dialog')).toContainText('סה״כ עכשיו');
    await expect(page.getByRole('dialog')).toContainText('הכרטיס יישמר אצל חברת הסליקה');
    await page.screenshot({ path: testInfo.outputPath('subscription-summary.png'), fullPage: false, animations: 'disabled' });
    await page.getByRole('dialog').getByRole('button', { name: 'ביטול', exact: true }).click();

    await page.context().unroute('**/functions/v1/task-pay');
    await page.context().route('**/functions/v1/task-pay', async route => {
      expect(route.request().postDataJSON()).toEqual({ action: 'card_setup' });
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'payment_unavailable' }) });
    });
    await page.route('**/rest/v1/rpc/my_publish_quote', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ due: 8, task_fee: 3, insurance_fee: 5, free_slot: false, subscriber: false, has_card: false, pending_payment_count: 0 }) }));
    await page.evaluate(() => sessionStorage.setItem('bzb.pendingTaskDraft', JSON.stringify({ form: {
      category: 'housework', taskName: 'טיוטה שנשמרת בזמן תשלום', shortDesc: 'בדיקת שמירת טופס', fullDesc: '',
      payment: '125', paymentType: 'task', workers: '1', location: 'תל אביב', date: '2027-01-01', time: '10:00',
      duration: '1', durationUnit: 'days', expiry: '3', notes: '',
    }, lat: null, lng: null, insurance: true, imageUrl: null })));
    await page.goto('/create-task?resume=1');
    await expect(page.getByTestId('publish-quote')).toContainText('8');
    await page.getByRole('button', { name: 'פרסם מטלה', exact: false }).click();
    await expect(page.getByRole('dialog')).toContainText('שמירת כרטיס לפני פרסום');
    await page.screenshot({ path: testInfo.outputPath('task-card-summary.png'), fullPage: false, animations: 'disabled' });
    const setupPopupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'פתיחת דף מאובטח', exact: true }).click();
    const setupPopup = await setupPopupPromise;
    await expect.poll(() => setupPopup.isClosed()).toBe(true);
    await expect(page.getByText('לא הצלחנו לפתוח את דף התשלום. לא בוצע חיוב. אפשר לנסות שוב.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'חזרה', exact: true }).click();
    await expect(page.getByText('טיוטה שנשמרת בזמן תשלום', { exact: true })).toBeVisible();
  } finally {
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
