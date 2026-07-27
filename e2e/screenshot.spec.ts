import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const outDir = '/Users/itaykarkason/.gemini/antigravity/brain/40bfc80c-a9bc-452f-89ad-9b0fcc36986b/scratch';

test.describe('Visual Screen Walkthrough', () => {
  const routes = [
    { name: 'landing', path: '/' },
    { name: 'auth', path: '/auth' },
    { name: 'login', path: '/login' },
    { name: 'register-tasker', path: '/register/tasker' },
    { name: 'tasks-list', path: '/tasks' },
  ];

  test('Capture screenshots', async ({ page }, testInfo) => {
    // Ensure dir exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const isMobile = testInfo.project.name.includes('mobile');
    const device = isMobile ? 'mobile' : 'desktop';

    for (const route of routes) {
      await page.goto(route.path);
      // Wait for network idle and animations
      await page.waitForTimeout(2000); 
      
      const screenshotPath = path.join(outDir, `${route.name}-${device}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
