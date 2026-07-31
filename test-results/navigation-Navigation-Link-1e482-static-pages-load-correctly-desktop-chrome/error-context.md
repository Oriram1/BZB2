# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Navigation & Links Verification >> Footer and static pages load correctly
- Location: e2e/navigation.spec.ts:4:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1, h2').first()
Expected pattern: /מחיר|תוכניות|מסלול|בחר/i
Received string:  "הדף לא נמצא"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h1, h2').first()
    12 × locator resolved to <h1 class="mb-1.5 text-xl font-semibold text-[var(--text-strong)]">הדף לא נמצא</h1>
       - unexpected value "הדף לא נמצא"

```

```yaml
- heading "הדף לא נמצא" [level=1]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Navigation & Links Verification', () => {
  4  |   test('Footer and static pages load correctly', async ({ page }) => {
  5  |     await page.goto('/privacy');
  6  |     await expect(page.locator('h1').first()).toContainText(/פרטיות|מדיניות/i);
  7  | 
  8  |     await page.goto('/terms');
  9  |     await expect(page.locator('h1').first()).toContainText(/תנאי|שימוש/i);
  10 | 
  11 |     await page.goto('/pricing');
> 12 |     await expect(page.locator('h1, h2').first()).toContainText(/מחיר|תוכניות|מסלול|בחר/i);
     |                                                  ^ Error: expect(locator).toContainText(expected) failed
  13 |   });
  14 | 
  15 |   test('Unknown route renders NotFound page with home link', async ({ page }) => {
  16 |     await page.goto('/some-random-unknown-page');
  17 |     await expect(page.locator('text=404')).toBeVisible();
  18 |     
  19 |     // Check link back home exists
  20 |     const homeLink = page.locator('a[href="/"]').first();
  21 |     await expect(homeLink).toBeVisible();
  22 |   });
  23 | });
  24 | 
```