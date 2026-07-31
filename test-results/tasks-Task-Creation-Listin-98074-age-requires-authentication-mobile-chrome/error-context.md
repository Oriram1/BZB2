# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tasks.spec.ts >> Task Creation & Listing Flows >> Task creation page requires authentication
- Location: e2e/tasks.spec.ts:15:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:8080/create-task"
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
  3  | test.describe('Task Creation & Listing Flows', () => {
  4  |   test('Task list page loads with category filters and view toggle', async ({ page }) => {
  5  |     await page.goto('/tasks');
  6  |     
  7  |     // Page title or header
  8  |     await expect(page.locator('h1, h2')).toContainText(/מטלות|חפש/i);
  9  |     
  10 |     // Check toggle between list and map views
  11 |     const listMapToggle = page.locator('button:has-text("מפה"), button:has-text("רשימה"), [role="tab"]').first();
  12 |     await expect(listMapToggle).toBeVisible();
  13 |   });
  14 | 
  15 |   test('Task creation page requires authentication', async ({ page }) => {
  16 |     await page.goto('/create-task');
  17 |     // Protected by RoleGuard, should redirect unauthenticated users
> 18 |     await page.waitForURL(/\/(auth|login)/);
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  19 |     expect(page.url()).toMatch(/\/(auth|login)/);
  20 |   });
  21 | 
  22 |   test('404 page renders for invalid task ID or unknown route', async ({ page }) => {
  23 |     await page.goto('/task/invalid-id-99999');
  24 |     // Should render task page or error alert without breaking app
  25 |     await expect(page.locator('body')).toBeVisible();
  26 |   });
  27 | });
  28 | 
```