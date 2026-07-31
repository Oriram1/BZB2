# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication & Profile Flows >> Protected profile route redirects unauthenticated user
- Location: e2e/auth.spec.ts:39:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:8080/profile"
============================================================
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - img "PrimeOS" [ref=e6]
    - generic [ref=e7]: "404"
    - heading "הדף לא נמצא" [level=1] [ref=e12]
    - paragraph [ref=e13]: העמוד שחיפשתם לא קיים או שהוזז למקום אחר.
    - generic [ref=e14]:
      - link "חזרה לדף הבית" [ref=e15] [cursor=pointer]:
        - /url: /admin
      - button "רענון" [ref=e16] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Authentication & Profile Flows', () => {
  4  |   test('Landing page loads properly with navigation links', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await expect(page).toHaveTitle(/Busy Bee/i);
  7  |     
  8  |     // Check main action buttons
  9  |     const ctaButton = page.locator('a[href="/auth"], a[href="/pricing"], button:has-text("התחברות"), button:has-text("הרשמה")').first();
  10 |     await expect(ctaButton).toBeVisible();
  11 |   });
  12 | 
  13 |   test('Auth role selection page renders tasker and bee options', async ({ page }) => {
  14 |     await page.goto('/auth');
  15 |     await expect(page.locator('text=מציע מטלות')).toBeVisible();
  16 |     await expect(page.locator('text=לקבלת מטלות')).toBeVisible();
  17 |   });
  18 | 
  19 |   test('Login screen renders login form inputs', async ({ page }) => {
  20 |     await page.goto('/login');
  21 |     
  22 |     // Check email and password inputs exist
  23 |     const emailInput = page.locator('input[type="email"]');
  24 |     const passwordInput = page.locator('input[type="password"]');
  25 |     await expect(emailInput).toBeVisible();
  26 |     await expect(passwordInput).toBeVisible();
  27 |     
  28 |     // Submit button exists
  29 |     const submitBtn = page.locator('button[type="submit"]');
  30 |     await expect(submitBtn).toBeVisible();
  31 |   });
  32 | 
  33 |   test('Register screen renders form for tasker role', async ({ page }) => {
  34 |     await page.goto('/register/tasker');
  35 |     await expect(page.locator('input[type="email"]')).toBeVisible();
  36 |     await expect(page.locator('input[type="password"]')).toBeVisible();
  37 |   });
  38 | 
  39 |   test('Protected profile route redirects unauthenticated user', async ({ page }) => {
  40 |     await page.goto('/profile');
  41 |     // RoleGuard should redirect unauthenticated user to /auth or /login
> 42 |     await page.waitForURL(/\/(auth|login)/);
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  43 |     expect(page.url()).toMatch(/\/(auth|login)/);
  44 |   });
  45 | });
  46 | 
```