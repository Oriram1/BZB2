import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const outDir = '/Users/itaykarkason/Python Projects/busybee-chore-connect/docs/visual-review';

test.describe('Authenticated Visual Screen Walkthrough', () => {
  // We will try to visit these pages. Some might redirect if the user lacks the role.
  const routes = [
    { name: 'profile', path: '/profile' },
    { name: 'create-task', path: '/create-task' },
    { name: 'my-tasks', path: '/my-tasks' },
    { name: 'chat', path: '/chat' }
  ];

  test('Login and capture screenshots', async ({ page }, testInfo) => {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const isMobile = testInfo.project.name.includes('mobile');
    const device = isMobile ? 'mobile' : 'desktop';

    // 1. Log in
    await page.goto('/login');
    await page.fill('input[type="email"]', 'itayk93@gmail.com');
    await page.fill('input[type="password"]', 'I637@A18!');
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
