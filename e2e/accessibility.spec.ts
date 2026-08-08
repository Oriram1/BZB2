import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Guardrail for the WCAG 2.2 AA remediation. ESLint catches the markup-level
 * mistakes at author time; this catches the ones that only exist once the page
 * is rendered — contrast, duplicate ids, orphaned aria references, landmarks.
 *
 * Only guest-reachable routes are covered: the signed-in screens need a session
 * fixture, which this suite does not have yet.
 */
const PUBLIC_ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/auth', name: 'auth' },
  { path: '/login', name: 'login' },
  { path: '/tasks', name: 'task list' },
  { path: '/pricing', name: 'pricing' },
  { path: '/privacy', name: 'privacy policy' },
  { path: '/terms', name: 'terms' },
];

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

for (const route of PUBLIC_ROUTES) {
  test(`${route.name} has no automatically detectable WCAG 2.2 AA violations`, async ({ page }) => {
    await page.goto(route.path);
    // The cookie banner renders on first visit and is part of the page under
    // test, so it is scanned too rather than dismissed away.
    await page.waitForLoadState('networkidle');

    const results = await scan(page);

    // Print the rule and the offending selector; a bare count is unactionable.
    const summary = results.violations.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
    expect(summary, `axe violations on ${route.path}`).toEqual([]);
  });
}

test('every public route exposes exactly one h1 and one main landmark', async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route.path);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('h1').count(), `h1 count on ${route.path}`).toBe(1);
    expect(await page.locator('main').count(), `main count on ${route.path}`).toBe(1);
  }
});

test('the skip link is the first thing the keyboard reaches and it works', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('href', '#main');
  await expect(focused).toBeVisible();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('no control smaller than 24x24 CSS px (WCAG 2.5.8)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const undersized = await page.evaluate(() => {
    // 2.5.8 exempts two things this page relies on:
    //  - "Inline": a link sitting inside a sentence, sized by the line box.
    //  - Controls that are visually hidden until focused (the skip link), which
    //    are full size at the moment they can actually be used.
    const isInline = (el: Element) => {
      const parent = el.parentElement;
      if (!parent) return false;
      if (!['P', 'SPAN', 'LI', 'LABEL'].includes(parent.tagName)) return false;
      return (parent.textContent || '').trim() !== (el.textContent || '').trim();
    };
    const isHiddenUntilFocus = (el: Element) => el.classList.contains('sr-only');

    return [...document.querySelectorAll('a[href], button, input, select, [role="button"]')]
      .filter(
        (el) =>
          !el.closest('[inert]') &&
          (el as HTMLElement).offsetParent !== null &&
          !isInline(el) &&
          !isHiddenUntilFocus(el),
      )
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((m) => m.w > 0 && (m.w < 24 || m.h < 24));
  });

  expect(undersized).toEqual([]);
});

test('no nested interactive controls (a wrapping button, or vice versa)', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const nested = await page.evaluate(() =>
    [...document.querySelectorAll('a button, button a, a a, button button')].map(
      (el) => `${el.tagName} inside ${el.parentElement?.closest('a, button')?.tagName}: ${(el.textContent || '').trim().slice(0, 30)}`,
    ),
  );

  expect(nested).toEqual([]);
});
