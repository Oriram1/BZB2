# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Navigation & Links Verification >> Unknown route renders NotFound page with home link
- Location: e2e/navigation.spec.ts:15:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a[href="/"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('a[href="/"]').first()

```

```yaml
- main:
  - img "PrimeOS"
  - text: "404"
  - heading "הדף לא נמצא" [level=1]
  - paragraph: העמוד שחיפשתם לא קיים או שהוזז למקום אחר.
  - link "חזרה לדף הבית":
    - /url: /admin
  - button "רענון"
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
  12 |     await expect(page.locator('h1, h2').first()).toContainText(/מחיר|תוכניות|מסלול|בחר/i);
  13 |   });
  14 | 
  15 |   test('Unknown route renders NotFound page with home link', async ({ page }) => {
  16 |     await page.goto('/some-random-unknown-page');
  17 |     await expect(page.locator('text=404')).toBeVisible();
  18 |     
  19 |     // Check link back home exists
  20 |     const homeLink = page.locator('a[href="/"]').first();
> 21 |     await expect(homeLink).toBeVisible();
     |                            ^ Error: expect(locator).toBeVisible() failed
  22 |   });
  23 | });
  24 | 
```