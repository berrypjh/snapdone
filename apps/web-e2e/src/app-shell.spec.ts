import { expect, test } from '@playwright/test';

import { linkTabKey, overflowsSideways, signIn } from './support/fixture';

/**
 * The shell swaps at the md breakpoint: the sidebar is desktop-only, and below
 * it the header carries the wordmark and a bottom tab bar carries the menu (home, history, profile). This is the contract described in
 * docs/design/foundation.md, and it is easy to break by editing a utility class.
 */
const MD_BREAKPOINT = 768;

/** The home is a protected product page, so the shell is checked signed in. */
test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL ?? '');
});

test('keeps the sidebar on desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('complementary')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '하단 메뉴' })).toBeHidden();

  // On a sub page the way back is the header's arrow at every width, next to the screen title.
  await page.goto('/process');
  const header = page.getByRole('banner');
  await expect(header).toContainText('사진 처리');
  await expect(header.getByRole('link', { name: '홈으로 돌아가기' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: '홈' })).toHaveCount(0);
});

test('keeps the header and the sidebar on screen while the page scrolls', async ({ page }) => {
  // A short window so the home scrolls.
  await page.setViewportSize({ width: 1280, height: 360 });
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await expect(page.getByRole('banner')).toBeInViewport();
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeInViewport();
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

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole('banner')).toBeInViewport();

  // The bottom tabs carry the menu, the current page marked, and lead to each page.
  const tabs = page.getByRole('navigation', { name: '하단 메뉴' });
  await expect(tabs.getByRole('link')).toHaveText(['홈', '기록', '내 정보']);
  await expect(tabs.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: '기록' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(tabs.getByRole('link', { name: '기록' })).toHaveAttribute('aria-current', 'page');
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
