import { expect, type Page, test } from '@playwright/test';

import { isHydrated, linkTabKey, overflowsSideways, signIn } from './support/fixture';

/** The home is a protected product page, so it is checked signed in. */
test.beforeEach(async ({ context, baseURL }) => {
  await signIn(context, baseURL ?? '');
});

/**
 * How the app consumes @berrypjh/react-ui as it ships: the first server HTML, a clean
 * hydration, the shared stylesheet actually applied, and a theme that follows the system and the switch.
 * Against `nx start web` (BASE_URL) this is production evidence; under the default
 * `nx dev web` server it only proves the dev build.
 */

/** Collects console errors and uncaught page errors raised while the page loads. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Reads the shared surface token as declared, as resolved, and as painted on <body>. */
const readSurface = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(--ds-background-surface)';
    document.body.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return {
      declared: getComputedStyle(document.documentElement)
        .getPropertyValue('--ds-background-surface')
        .trim(),
      resolved,
      body: getComputedStyle(document.body).backgroundColor,
    };
  });

test('serves the shell, skip link, and pre-paint theme script in the first HTML', async ({
  context,
}) => {
  const response = await context.request.get('/');
  expect(response.ok()).toBe(true);

  const html = await response.text();
  expect(html).toMatch(/<html[^>]*lang="ko"/);
  expect(html).toMatch(/<head>[\s\S]*<script>[^<]*snapdone-theme[^<]*<\/script>/);
  expect(html).toContain('id="main-content"');
  expect(html).toContain('본문으로 건너뛰기');
  expect(html).toContain('이미지 액션 라우터</h1>');
});

test('hydrates without console errors or page errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');

  await expect.poll(() => isHydrated(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('paints the body with the shared stylesheet token', async ({ page }) => {
  await page.goto('/');

  const surface = await readSurface(page);
  expect(surface.declared).not.toBe('');
  expect(surface.body).toBe(surface.resolved);
});

test('follows the system color scheme until the user chooses', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => isHydrated(page)).toBe(true);
  const dark = await readSurface(page);
  expect(dark.body).toBe(dark.resolved);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await readSurface(page);
  expect(light.body).toBe(light.resolved);
  expect(light.body).not.toBe(dark.body);
});

test('remembers the dark mode switch across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  // The switch lives on the profile page.
  await page.goto('/me');
  await expect.poll(() => isHydrated(page)).toBe(true);

  const darkMode = page.getByRole('switch', { name: '다크 모드' });
  await expect(darkMode).not.toBeChecked();
  await darkMode.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(darkMode).toBeChecked();
});

test('exposes one banner, one main, and one page heading', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

/** WebKit on macOS skips links on plain Tab, so link focus needs Alt+Tab there. */

test('draws a visible focus ring on the keyboard-focused skip link', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.keyboard.press(linkTabKey(browserName));

  const skipLink = page.getByRole('link', { name: '본문으로 건너뛰기' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS('outline-style', 'solid');
  await expect(skipLink).not.toHaveCSS('outline-width', '0px');
});

test('does not scroll sideways just below the md breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 800 });
  await page.goto('/');

  expect(await overflowsSideways(page)).toBe(false);
});
