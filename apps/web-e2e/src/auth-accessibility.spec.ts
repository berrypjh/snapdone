import { expect, type Page, test } from '@playwright/test';

import {
  answerGoogle,
  GOOGLE,
  IN_APP_USER_AGENT,
  overflowsSideways,
  processFirstPhoto,
  signIn,
} from './support/fixture';

/**
 * ON-01 screens by width, color scheme, keyboard, and assistive-technology semantics.
 * Real screen readers are a manual check; this pins the roles, names, and live regions they read.
 */

const WIDTHS = [320, 767, 768, 1280] as const;
const SCHEMES = ['light', 'dark'] as const;

/** Text color and background resolve to different colors, so the copy is not painted invisible. */
const textIsVisibleOnBody = (page: Page) =>
  page.evaluate(() => {
    const heading = document.querySelector('h1');
    return (
      !!heading &&
      getComputedStyle(heading).color !== getComputedStyle(document.body).backgroundColor
    );
  });

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    test(`login at ${width}px in ${scheme} mode keeps one main, one heading, and one Google button`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/login');

      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('button', GOOGLE)).toBeVisible();
      await expect(page.getByRole('navigation')).toHaveCount(0);
      expect(await overflowsSideways(page)).toBe(false);
      expect(await textIsVisibleOnBody(page)).toBe(true);
    });

    test(`onboarding at ${width}px in ${scheme} mode does not scroll sideways`, async ({
      page,
      context,
      baseURL,
    }) => {
      await signIn(context, baseURL ?? '', 'intro');
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/onboarding');

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await overflowsSideways(page)).toBe(false);
      expect(await textIsVisibleOnBody(page)).toBe(true);
    });
  }
}

test('the first result at 320px takes focus on its heading and completes with the keyboard', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'first-image');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/onboarding/first-image');
  await processFirstPhoto(page);

  await expect(page.getByRole('heading', { level: 1, name: '사진을 확인했습니다' })).toBeFocused();
  expect(await overflowsSideways(page)).toBe(false);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '완료' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/$/);
});

test('signs in with the keyboard alone', async ({ page }) => {
  await answerGoogle(page, 'returning');
  await page.goto('/login');

  await page.keyboard.press('Tab');
  const button = page.getByRole('button', GOOGLE);
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/$/);
});

test('reads a callback error once, as an alert', async ({ page }) => {
  await page.goto('/login?error=network');

  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveText('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('shows no error for a cancelled login', async ({ page }) => {
  await page.goto('/login?error=cancelled');

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', GOOGLE)).toBeEnabled();
});

test('hides the decorative arrows and check marks from assistive technology', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'intro');
  await page.goto('/onboarding');

  const tree = await page.getByRole('main').ariaSnapshot();
  expect(tree).not.toContain('↓');
  expect(tree).not.toContain('✓');
  await expect(page.getByRole('button', { name: '시작하기' })).toBeEnabled();
});

test('the handoff page announces one status while it waits', async ({ page }) => {
  await page.goto('/auth/handoff/ready?next=%2F');

  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('로그인 정보를 확인하는 중입니다.');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test.describe('the app WebView shows the same content without the menu', () => {
  const mainText = (page: Page) => page.getByRole('main').innerText();

  const PAGES = [
    { path: '/history', step: 'complete' },
    { path: '/onboarding', step: 'intro' },
  ] as const;

  for (const { path, step } of PAGES) {
    test(`${path}`, async ({ browser, baseURL }) => {
      const web = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      const app = await browser.newContext({
        baseURL,
        viewport: { width: 390, height: 844 },
        userAgent: IN_APP_USER_AGENT,
      });
      await signIn(web, baseURL ?? '', step);
      await signIn(app, baseURL ?? '', step);
      const webPage = await web.newPage();
      const appPage = await app.newPage();
      await webPage.goto(path);
      await appPage.goto(path);

      const webText = (await mainText(webPage)).replace('로그아웃', '').trim();
      expect((await mainText(appPage)).trim()).toBe(webText);
      await expect(appPage.getByRole('banner')).toHaveCount(0);
      await expect(appPage.getByRole('navigation')).toHaveCount(0);
      await expect(appPage.getByRole('button', { name: '로그아웃' })).toHaveCount(0);

      await web.close();
      await app.close();
    });
  }
});
