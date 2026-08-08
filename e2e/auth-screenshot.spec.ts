import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Credentials come from the environment, never from the file. Set them for a
 * run with:
 *
 *   E2E_EMAIL=you@example.com E2E_PASSWORD=... npx playwright test e2e/auth-screenshot.spec.ts
 *
 * Without them the test skips rather than failing, so a plain `playwright test`
 * on a fresh clone stays green.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const outDir = path.join(process.cwd(), 'docs', 'visual-review');

test.describe('Authenticated Visual Screen Walkthrough', () => {
  // We will try to visit these pages. Some might redirect if the user lacks the role.
  const routes = [
    { name: 'profile', path: '/profile' },
    { name: 'create-task', path: '/create-task' },
    { name: 'my-tasks', path: '/my-tasks' },
    { name: 'chat', path: '/chat' },
  ];

  test('Login and capture screenshots', async ({ page }, testInfo) => {
    test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run this walkthrough.');

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const isMobile = testInfo.project.name.includes('mobile');
    const device = isMobile ? 'mobile' : 'desktop';

    // 1. Log in
    await page.goto('/login');

    // The cookie banner is pinned to the bottom and covers the submit button,
    // so it has to be answered before the form can be used.
    const essentialOnly = page.getByRole('button', { name: 'הכרחיות בלבד' });
    if (await essentialOnly.isVisible().catch(() => false)) {
      await essentialOnly.click();
    }

    await page.fill('input[type="email"]', EMAIL!);
    await page.fill('input[type="password"]', PASSWORD!);
    await page.click('button[type="submit"]');

    // Wait for the login to complete (redirects to /tasks)
    await page.waitForURL('/tasks', { timeout: 15000 });
    await page.waitForTimeout(2000); // Allow auth state to settle globally

    // 2. Iterate through protected routes
    for (const route of routes) {
      await page.goto(route.path);
      // Wait for any skeletons or data to load
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(3000);

      const screenshotPath = path.join(outDir, `${route.name}-${device}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
