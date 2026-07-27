import { test, expect } from '@playwright/test';

test.describe('Responsive & RTL Layout Audits', () => {
  test('Mobile view does not have horizontal overflow scrollbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    
    // Page width should match client width without horizontal overflow
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('RTL direction is applied to document root', async ({ page }) => {
    await page.goto('/');
    const dirAttr = await page.getAttribute('html', 'dir');
    expect(dirAttr).toBe('rtl');
  });
});
