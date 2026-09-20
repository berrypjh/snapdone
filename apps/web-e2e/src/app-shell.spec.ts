import { expect, test } from '@playwright/test';

import { linkTabKey, overflowsSideways } from './support/fixture';

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

test('shows the sidebar exactly at the md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: MD_BREAKPOINT, height: 800 });
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

  expect(await overflowsSideways(page)).toBe(false);
});

/**
 * The skip link is the first keyboard stop. It stays visually hidden until focused,
 * and following it must move focus into <main>, not just scroll there.
 */
test('moves keyboard focus into the main content through the skip link', async ({
  page,
  browserName,
}) => {
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: '본문으로 건너뛰기' });
  await page.keyboard.press(linkTabKey(browserName));
  await expect(skipLink).toBeFocused();

  const revealed = await skipLink.boundingBox();
  expect(revealed?.width ?? 0).toBeGreaterThan(1);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});
