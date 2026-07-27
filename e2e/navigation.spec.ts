import { test, expect } from '@playwright/test';

test.describe('Navigation & Links Verification', () => {
  test('Footer and static pages load correctly', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1').first()).toContainText(/פרטיות|מדיניות/i);

    await page.goto('/terms');
    await expect(page.locator('h1').first()).toContainText(/תנאי|שימוש/i);

    await page.goto('/pricing');
    await expect(page.locator('h1, h2').first()).toContainText(/מחיר|תוכניות|מסלול|בחר/i);
  });

  test('Unknown route renders NotFound page with home link', async ({ page }) => {
    await page.goto('/some-random-unknown-page');
    await expect(page.locator('text=404')).toBeVisible();
    
    // Check link back home exists
    const homeLink = page.locator('a[href="/"]').first();
    await expect(homeLink).toBeVisible();
  });
});
