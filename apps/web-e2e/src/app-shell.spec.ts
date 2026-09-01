import { expect, test } from '@playwright/test';

/**
 * The shell swaps at the md breakpoint: the sidebar is desktop-only, and below
 * it the header carries the wordmark instead. This is the contract described in
 * docs/design/foundation.md, and it is easy to break by editing a utility class.
 */
const MD_BREAKPOINT = 768;

test('keeps the sidebar on desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('complementary')).toBeVisible();
});

test('drops the sidebar below the md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: MD_BREAKPOINT - 1, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('complementary')).toBeHidden();
  await expect(page.getByRole('banner')).toContainText('이미지 액션 라우터');
});

test('does not let the page scroll sideways on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );

  expect(overflows).toBe(false);
});
