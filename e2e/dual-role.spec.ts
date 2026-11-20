import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const localUrl = process.env.DUAL_TEST_SUPABASE_URL;
const serviceKey = process.env.DUAL_TEST_SERVICE_KEY;

test('adds a second role and switches modes without losing either role', async ({ page }) => {
  test.skip(!localUrl || !serviceKey || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localUrl), 'Requires isolated local Supabase');
  const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false } });
  const email = `dual-${crypto.randomUUID()}@example.invalid`;
  const password = `Bzb!${crypto.randomUUID()}A1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'בדיקה', last_name: 'מקומית' } });
  expect(error).toBeNull();
  const userId = data.user!.id;
  try {
    expect((await admin.from('user_roles').insert({ user_id: userId, role: 'bee' })).error).toBeNull();
    await page.addInitScript(() => localStorage.setItem('bzb_location_prompt_snooze', String(Date.now() + 86400000)));
    await page.goto('/login');
    await page.getByRole('button', { name: 'הכרחיות בלבד' }).click();
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה', { exact: true }).fill(password);
    await page.getByRole('button', { name: /כניסה/ }).click();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 20000 });
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await page.getByRole('button', { name: /הפעלת אפשרות מציע מטלות/ }).click();
    await page.getByLabel('תאריך לידה').fill('1990-01-01');
    await page.getByRole('button', { name: 'הוספת תפקיד' }).click();
    await expect(page).toHaveURL(/\/tasks/);
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
    expect(roles?.map((item) => item.role).sort()).toEqual(['bee', 'tasker']);
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await expect(page.getByText(/מצב נוכחי: מציע מטלות/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'צור מטלה' })).toBeVisible();
    await page.getByRole('button', { name: /מעבר למצב מבצע מטלות/ }).click();
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await expect(page.getByText(/מצב נוכחי: מבצע מטלות/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'צור מטלה' })).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await expect(page.getByText(/מצב נוכחי: מבצע מטלות/)).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test('adult worker can opt into publisher role during signup', async ({ page }) => {
  test.skip(!localUrl || !serviceKey || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localUrl), 'Requires isolated local Supabase');
  const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false } });
  const email = `signup-${crypto.randomUUID()}@example.com`;
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
    await expect(page).toHaveURL(/\/tasks/, { timeout: 20000 });
    expect(signupUserId).toBeTruthy();
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', signupUserId!);
    expect(roles?.map((item) => item.role).sort()).toEqual(['bee', 'tasker']);
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await expect(page.getByText(/מצב נוכחי: מבצע מטלות/)).toBeVisible();
  } finally {
    if (signupUserId) await admin.auth.admin.deleteUser(signupUserId);
  }
});

test('a minor cannot select the publisher role during signup', async ({ page }) => {
  await page.goto('/register/worker');
  await page.getByRole('button', { name: 'הכרחיות בלבד' }).click();
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 16);
  await page.getByLabel('תאריך לידה').fill(date.toISOString().slice(0, 10));
  await expect(page.getByLabel('ארצה גם להציע מטלות')).toHaveCount(0);
});

test('an existing publisher can add the worker role and retain publisher access', async ({ page }) => {
  test.skip(!localUrl || !serviceKey || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localUrl), 'Requires isolated local Supabase');
  const admin = createClient(localUrl!, serviceKey!, { auth: { persistSession: false } });
  const email = `publisher-${crypto.randomUUID()}@example.com`;
  const password = `P!${crypto.randomUUID()}1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const userId = data.user!.id;
  try {
    expect((await admin.from('user_roles').insert({ user_id: userId, role: 'tasker' })).error).toBeNull();
    expect((await admin.from('tasks').insert({ creator_id: userId, category: 'housework', name: 'מטלה שמורה לבדיקה', short_desc: 'בדיקה מקומית', payment: 10 })).error).toBeNull();
    await page.addInitScript(() => localStorage.setItem('bzb_location_prompt_snooze', String(Date.now() + 86400000)));
    await page.goto('/login');
    await page.getByRole('button', { name: 'הכרחיות בלבד' }).click();
    await page.getByLabel('אימייל').fill(email);
    await page.getByLabel('סיסמה', { exact: true }).fill(password);
    await page.getByRole('button', { name: /כניסה/ }).click();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 20000 });
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await page.getByRole('button', { name: /הפעלת אפשרות מבצע מטלות/ }).click();
    await page.getByRole('button', { name: 'הוספת תפקיד' }).click();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 20000 });
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
    expect(roles?.map((item) => item.role).sort()).toEqual(['bee', 'tasker']);
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click();
    await expect(page.getByText(/מצב נוכחי: מבצע מטלות/)).toBeVisible();
    await page.goto('/my-tasks?tab=published');
    await expect(page.getByText('מטלה שמורה לבדיקה')).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
