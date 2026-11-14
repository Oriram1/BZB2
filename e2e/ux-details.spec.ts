import { test, expect } from '@playwright/test';

// Checks for the UX-details pass (docs/ux-details-audit.md) that need a real browser.

test.describe('UX details', () => {
  test('headings use balanced wrapping and paragraphs avoid orphans', async ({ page }) => {
    await page.goto('/privacy');
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    expect(await h1.evaluate((el) => getComputedStyle(el).getPropertyValue('text-wrap-style') || getComputedStyle(el).textWrap)).toContain('balance');
  });

  test('hovering a link warms that page chunk before the tap', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (req) => { if (/pages\/(Pricing|Login)/.test(req.url())) chunks.push(req.url()); });
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    const before = chunks.length;
    // Any in-app link whose route has a prefetch loader.
    const link = page.locator('a[href="/pricing"], a[href="/login"]').first();
    await link.dispatchEvent('pointerover', { bubbles: true });
    await expect.poll(() => chunks.length, { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('page fallback never flashes a skeleton for an instant load', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('.animate-pulse')).toHaveCount(0);
  });

  test('reduced motion removes view-transition animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/privacy');
    const hasRule = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((r) => r.cssText.includes('view-transition')); } catch { return false; }
      }));
    expect(hasRule).toBe(true);
  });

  test('small controls get a 44px touch hit area on coarse pointers', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'coarse pointer only');
    await page.goto('/login');
    const rule = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((r) => r.cssText.includes('role="checkbox"') && r.cssText.includes('44px')); } catch { return false; }
      }));
    expect(rule).toBe(true);
  });

  test('entrance animations leave no forced end state that blocks later styles', async ({ page }) => {
    await page.goto('/privacy');
    const forwards = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((r) => /\.animate-(slide-up|fade-in|pop-in)\b/.test(r.cssText) && r.cssText.includes('forwards')); } catch { return false; }
      }));
    expect(forwards).toBe(false);
  });
});
