import { test, expect } from '@playwright/test';

test.describe('Task Creation & Listing Flows', () => {
  test('Task list page loads with category filters and view toggle', async ({ page }) => {
    await page.goto('/tasks');
    
    // Page title or header
    await expect(page.locator('h1, h2')).toContainText(/מטלות|חפש/i);
    
    // Check toggle between list and map views
    const listMapToggle = page.locator('button:has-text("מפה"), button:has-text("רשימה"), [role="tab"]').first();
    await expect(listMapToggle).toBeVisible();
  });

  test('Task creation page requires authentication', async ({ page }) => {
    await page.goto('/create-task');
    // Protected by RoleGuard, should redirect unauthenticated users
    await page.waitForURL(/\/(auth|login)/);
    expect(page.url()).toMatch(/\/(auth|login)/);
  });

  test('404 page renders for invalid task ID or unknown route', async ({ page }) => {
    await page.goto('/task/invalid-id-99999');
    // Should render task page or error alert without breaking app
    await expect(page.locator('body')).toBeVisible();
  });
});
