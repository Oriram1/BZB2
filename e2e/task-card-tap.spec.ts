import { test, expect } from '@playwright/test';

// The whole task card is one tap target: a stretched ::after on the title button.
// The global press-scale on button:active must not shrink it away from the finger.
test('tapping the body of a task card opens the task', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bzb_cookie_consent', 'essential'));
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'לא עכשיו' }).click({ timeout: 8000 }).catch(() => {});
  const card = page.getByRole('group', { name: /^מטלה: / }).first();
  await expect(card).toBeVisible();
  await page.waitForTimeout(800);
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + 120);
  await expect(page).toHaveURL(/\/task\//);
});
