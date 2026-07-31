# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-screenshot.spec.ts >> Authenticated Visual Screen Walkthrough >> Login and capture screenshots
- Location: e2e/auth-screenshot.spec.ts:16:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation to "/tasks" until "load"
============================================================
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - img "PrimeOS" [ref=e6]
    - heading "כניסה למערכת" [level=1] [ref=e7]
    - paragraph [ref=e8]: התחברו כדי להמשיך לעבודה במערכת.
    - generic [ref=e9]: כתובת מייל
    - textbox "כתובת מייל" [ref=e10]: itayk93@gmail.com
    - generic [ref=e11]:
      - generic [ref=e12]: סיסמה
      - link "שכחתי סיסמה" [ref=e13] [cursor=pointer]:
        - /url: /reset-password
    - generic [ref=e14]:
      - textbox "סיסמה" [ref=e15]: I637@A18!
      - button "הצג סיסמה" [ref=e16] [cursor=pointer]
    - alert [ref=e20]: הכניסה נכשלה. בדקו את כתובת המייל והסיסמה.
    - button "כניסה" [ref=e21] [cursor=pointer]
    - paragraph [ref=e22]:
      - text: אין לך חשבון?
      - link "הירשם" [ref=e23] [cursor=pointer]:
        - /url: /signup
    - navigation "קישורים משפטיים" [ref=e24]:
      - link "פרטיות" [ref=e25] [cursor=pointer]:
        - /url: /privacy
      - link "Cookies" [ref=e26] [cursor=pointer]:
        - /url: /cookies
      - link "בקשות מידע" [ref=e27] [cursor=pointer]:
        - /url: /data-requests
      - link "תנאי שימוש" [ref=e28] [cursor=pointer]:
        - /url: /terms
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import fs from 'fs';
  3  | import path from 'path';
  4  | 
  5  | const outDir = '/Users/itaykarkason/Python Projects/busybee-chore-connect/docs/visual-review';
  6  | 
  7  | test.describe('Authenticated Visual Screen Walkthrough', () => {
  8  |   // We will try to visit these pages. Some might redirect if the user lacks the role.
  9  |   const routes = [
  10 |     { name: 'profile', path: '/profile' },
  11 |     { name: 'create-task', path: '/create-task' },
  12 |     { name: 'my-tasks', path: '/my-tasks' },
  13 |     { name: 'chat', path: '/chat' }
  14 |   ];
  15 | 
  16 |   test('Login and capture screenshots', async ({ page }, testInfo) => {
  17 |     if (!fs.existsSync(outDir)) {
  18 |       fs.mkdirSync(outDir, { recursive: true });
  19 |     }
  20 | 
  21 |     const isMobile = testInfo.project.name.includes('mobile');
  22 |     const device = isMobile ? 'mobile' : 'desktop';
  23 | 
  24 |     // 1. Log in
  25 |     await page.goto('/login');
  26 |     await page.fill('input[type="email"]', 'itayk93@gmail.com');
  27 |     await page.fill('input[type="password"]', 'I637@A18!');
  28 |     await page.click('button[type="submit"]');
  29 |     
  30 |     // Wait for the login to complete (redirects to /tasks)
> 31 |     await page.waitForURL('/tasks', { timeout: 15000 });
     |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  32 |     await page.waitForTimeout(2000); // Allow auth state to settle globally
  33 | 
  34 |     // 2. Iterate through protected routes
  35 |     for (const route of routes) {
  36 |       await page.goto(route.path);
  37 |       // Wait for any skeletons or data to load
  38 |       await page.waitForTimeout(3000); 
  39 |       
  40 |       const screenshotPath = path.join(outDir, `${route.name}-${device}.png`);
  41 |       await page.screenshot({ path: screenshotPath, fullPage: true });
  42 |     }
  43 |   });
  44 | });
  45 | 
```