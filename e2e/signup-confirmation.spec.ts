import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const localUrl = process.env.DUAL_TEST_SUPABASE_URL;
const serviceKey = process.env.DUAL_TEST_SERVICE_KEY;
const mailUrl = process.env.DUAL_TEST_MAIL_URL;

test('email verification preserves signup profile and both roles', async ({ page, request }) => {
  test.skip(!localUrl || !serviceKey || !mailUrl || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localUrl) || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(mailUrl), 'Requires isolated local Supabase and mailbox');
  const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false } });
  const email = `confirm-${crypto.randomUUID()}@example.com`;
  let signupUserId: string | undefined;
  try {
    await page.addInitScript(() => localStorage.setItem('bzb_location_prompt_snooze', String(Date.now() + 86400000)));
    await page.route('**/functions/v1/geocode-address', route => route.fulfill({ json: { formattedAddress: 'כתובת בדיקה', lat: 32, lng: 34 } }));
    await page.goto('/register/worker');
    await page.getByRole('button', { name: 'הכרחיות בלבד' }).click();
    await page.getByLabel('שם פרטי').fill('דנה');
    await page.getByLabel('שם משפחה').fill('בדיקה');
    await page.getByLabel('תאריך לידה').fill('1990-01-01');
    await page.getByLabel('ארצה גם להציע מטלות').check();
    await page.getByRole('radio').first().click();
    await page.getByLabel('כתובת', { exact: true }).fill('כתובת בדיקה');
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('טלפון').fill('0501234567');
    await page.getByLabel('סיסמה', { exact: true }).fill('Example!123');
    await page.getByRole('checkbox', { name: /תנאי השימוש/ }).check();
    const signupResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/auth/v1/signup' && response.request().method() === 'POST');
    await page.getByRole('button', { name: /יאללה, נרשמים/ }).click();
    const signup = await (await signupResponse).json();
    signupUserId = signup.user?.id ?? signup.id;
    await expect(page).toHaveURL(/\/login/, { timeout: 20000 });
    expect(signupUserId).toBeTruthy();
    const { data: { user } } = await admin.auth.admin.getUserById(signupUserId!);
    expect(user).toBeTruthy();
    expect(user!.email_confirmed_at).toBeFalsy();
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user!.id);
    expect(roles?.map((item) => item.role).sort()).toEqual(['bee', 'tasker']);
    const { data: profile } = await admin.from('profiles').select('phone,address').eq('user_id', user!.id).single();
    expect(profile).toMatchObject({ phone: '0501234567', address: 'כתובת בדיקה' });
    let messageId = '';
    await expect.poll(async () => {
      const inbox = await (await request.get(`${mailUrl}/api/v1/messages`)).json();
      const mail = inbox.messages?.find((item: { To?: Array<{ Address: string }>, ID: string }) => item.To?.some((to) => to.Address === email));
      messageId = mail?.ID ?? '';
      return Boolean(messageId);
    }).toBe(true);
    const message = await (await request.get(`${mailUrl}/api/v1/message/${messageId}`)).json();
    const href = String(message.HTML ?? '').match(/href="([^"]+\/auth\/v1\/verify\?[^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    expect(href).toBeTruthy();
    // The local mailer uses its default redirect URL; verify the real token
    // without following that unrelated local redirect, then sign in normally.
    const confirmation = await request.get(href!, { maxRedirects: 0 });
    expect(confirmation.status()).toBeGreaterThanOrEqual(300);
    expect(confirmation.status()).toBeLessThan(400);
    await expect.poll(async () => (await admin.auth.admin.getUserById(user!.id)).data.user?.email_confirmed_at).toBeTruthy();
    await page.goto('/login');
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה', { exact: true }).fill('Example!123');
    await page.getByRole('button', { name: /כניסה/ }).click();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 20000 });
  } finally {
    if (signupUserId) await admin.auth.admin.deleteUser(signupUserId);
  }
});
