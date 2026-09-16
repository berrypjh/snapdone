import { expect, test } from '@playwright/test';

/**
 * The User-Agent the app's WebView sends: a normal mobile Safari string plus the bridge token
 * `SnapdoneApp/<contract version>` from libs/webview-bridge. Written out literally to pin the wire format.
 */
const IN_APP_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SnapdoneApp/1';

type AppMessages = { __appMessages: string[] };

test.describe('inside the app WebView', () => {
  test.use({ userAgent: IN_APP_USER_AGENT, viewport: { width: 390, height: 844 } });

  test('renders only the page content, without the web shell', async ({ page }) => {
    await page.goto('/history');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
  });

  test('tells the app the page title once it is ready', async ({ page }) => {
    await page.addInitScript(() => {
      const messages: string[] = [];
      Object.assign(window, {
        __appMessages: messages,
        ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
      });
    });
    await page.goto('/history');

    await expect
      .poll(() => page.evaluate(() => (window as unknown as AppMessages).__appMessages))
      .toContainEqual(JSON.stringify({ type: 'ready', title: '기록' }));
  });
});

test('browser visitors reach the history page from the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  await page
    .getByRole('navigation', { name: '주요 메뉴' })
    .getByRole('link', { name: '기록' })
    .click();

  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
});
