import { test, expect } from '@playwright/test';

test.describe('Authentication & Profile Flows', () => {
  test('Landing page loads properly with navigation links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Busy Bee/i);
    
    // Check main action buttons
    const ctaButton = page.locator('a[href="/auth"], a[href="/pricing"], button:has-text("התחברות"), button:has-text("הרשמה")').first();
    await expect(ctaButton).toBeVisible();
  });

  test('Auth role selection page renders tasker and bee options', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.locator('text=מציע מטלות')).toBeVisible();
    await expect(page.locator('text=לקבלת מטלות')).toBeVisible();
  });

  test('Login screen renders login form inputs', async ({ page }) => {
    await page.goto('/login');
    
    // Check email and password inputs exist
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    
    // Submit button exists
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });

  test('Register screen renders form for tasker role', async ({ page }) => {
    await page.goto('/register/tasker');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Protected profile route redirects unauthenticated user', async ({ page }) => {
    await page.goto('/profile');
    // RoleGuard should redirect unauthenticated user to /auth or /login
    await page.waitForURL(/\/(auth|login)/);
    expect(page.url()).toMatch(/\/(auth|login)/);
  });
});
