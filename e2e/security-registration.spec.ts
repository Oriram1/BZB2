import { test, expect } from '@playwright/test';

test('registration failures never query email existence and remain usable', async ({ page }, testInfo) => {
  let aliasCalls = 0;
  let signupCalls = 0;
  await page.addInitScript(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
  // No paid maps call, account creation, or email is sent by this browser test.
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.route('**/functions/v1/geocode-address', route => route.fulfill({
    json: { formattedAddress: 'תל אביב, ישראל', lat: 32.0853, lng: 34.7818 },
  }));
  await page.route('**/rest/v1/rpc/is_email_alias_taken', route => {
    aliasCalls++;
    return route.fulfill({ status: 403, json: { message: 'permission denied' } });
  });
  await page.route('**/auth/v1/signup**', route => {
    signupCalls++;
    return route.fulfill({ status: 500, json: { code: 'unexpected_failure', msg: 'Database error saving new user' } });
  });
  await page.goto('/register/tasker');
  await expect(page.locator('#firstName')).toBeVisible();
  // The Maps loader leaves a partial namespace even when its script is blocked.
  // Exercise the HTTP geocode fallback instead of a half-initialized Geocoder.
  await page.evaluate(() => Reflect.deleteProperty(window, 'google'));
  await page.locator('#firstName').fill('בדיקת');
  await page.locator('#lastName').fill('אבטחה');
  await page.locator('#age').fill('30');
  await page.getByRole('radio').first().click();
  await page.locator('#address').fill('תל אביב');
  await page.locator('#email').fill('security@example.com');
  await page.locator('#phone').fill('0501234567');
  await page.locator('#password').fill('UniqueTest-2026!');
  await page.locator('#terms').check();
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('לא ניתן להשלים הרשמה עם הפרטים האלה. אם כבר נרשמת, אפשר להתחבר או לאפס סיסמה')).toBeVisible();
  expect(signupCalls).toBe(1);
  expect(aliasCalls).toBe(0);
  await expect(page.locator('button[type=submit]')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('registration-error.png'), fullPage: true, animations: 'disabled' });

  await page.route('**/auth/v1/signup**', route => route.fulfill({ status: 422,
    json: { code: 'weak_password', msg: 'Password is compromised' },
  }));
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('הסיסמה הזו אינה בטוחה לשימוש. כדאי לבחור סיסמה אחרת וייחודית')).toBeVisible();
  await expect(page.locator('button[type=submit]')).toBeEnabled();
  expect(aliasCalls).toBe(0);
});
