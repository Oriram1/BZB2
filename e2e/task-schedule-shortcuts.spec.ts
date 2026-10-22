import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const api = process.env.LOCAL_SUPABASE_URL;
const service = process.env.LOCAL_SERVICE_KEY;
if (api && !['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Local Supabase required');

test('schedule shortcuts fill editable fields and keep three choices on one row', async ({ page }, testInfo) => {
  test.skip(!api || !service, 'Requires local Supabase');
  const admin = createClient(api!, service!, { auth: { persistSession: false } });
  const email = `schedule-${crypto.randomUUID()}@example.test`;
  const password = `Schedule-${crypto.randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  try {
    expect((await admin.from('user_roles').insert({ user_id: id, role: 'tasker' })).error).toBeNull();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
    await page.reload();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 20_000 });
    await page.goto('/create-task');
    await page.getByRole('radio', { name: 'עבודות בית', exact: true }).check();
    await page.getByRole('button', { name: 'הבא', exact: true }).click();
    await page.getByLabel('מה צריך לעשות?', { exact: true }).fill('בדיקת תאריך ושעה');
    await page.getByLabel('תיאור קצר (עד 120 תווים)', { exact: true }).fill('בדיקה מקומית');
    await page.getByRole('button', { name: 'הבא', exact: true }).click();
    await page.getByLabel('תשלום מוצע', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'הבא', exact: true }).click();
    await page.clock.install({ time: new Date('2027-01-31T12:00:00Z') });
    // Updating a field renders the date shortcuts with the fixed current date.
    await page.getByRole('button', { name: '09:00', exact: true }).click();
    await expect(page.getByLabel('שעה', { exact: true })).toHaveValue('09:00');
    await page.getByRole('button', { name: 'בעוד חודש', exact: true }).click();
    await expect(page.getByLabel('תאריך', { exact: true })).toHaveValue('28/02/2027');
    await page.getByRole('button', { name: 'מחר', exact: true }).click();
    await expect(page.getByLabel('תאריך', { exact: true })).toHaveValue('01/02/2027');
    await page.getByRole('button', { name: 'בעוד שבוע', exact: true }).click();
    await expect(page.getByLabel('תאריך', { exact: true })).toHaveValue('07/02/2027');
    await expect(page.getByRole('button', { name: 'בעוד שבוע', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '14:00', exact: true }).click();
    await expect(page.getByLabel('שעה', { exact: true })).toHaveValue('14:00');
    for (const label of ['בחירת תאריך מהירה', 'בחירת שעה מהירה']) {
      const boxes = await page.getByRole('group', { name: label }).getByRole('button').evaluateAll(es => es.map(e => {
        const r = e.getBoundingClientRect(); return { y: r.y, height: r.height };
      }));
      expect(boxes).toHaveLength(3);
      expect(new Set(boxes.map(b => b.y)).size).toBe(1);
      expect(boxes.every(b => b.height >= 44)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('schedule-shortcuts.png'), fullPage: true, animations: 'disabled' });
    await page.getByLabel('שעה', { exact: true }).fill('16:30');
    await expect(page.getByRole('group', { name: 'בחירת שעה מהירה' }).locator('[aria-pressed=true]')).toHaveCount(0);
    await page.getByLabel('תאריך', { exact: true }).fill('02/03/2027');
    await expect(page.getByRole('group', { name: 'בחירת תאריך מהירה' }).locator('[aria-pressed=true]')).toHaveCount(0);
  } finally {
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
