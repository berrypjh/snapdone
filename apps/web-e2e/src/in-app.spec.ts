import { expect, type Page, test } from '@playwright/test';

import { IN_APP_USER_AGENT, signIn } from './support/fixture';

type AppMessages = { __appMessages: string[] };

test.describe('inside the app WebView', () => {
  test.use({ userAgent: IN_APP_USER_AGENT, viewport: { width: 390, height: 844 } });

  test('renders only the page content, without the web shell', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? '');
    await page.goto('/');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('이미지 액션 라우터');
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
    await page.goto('/login');

    await expect
      .poll(() => page.evaluate(() => (window as unknown as AppMessages).__appMessages))
      .toContainEqual(JSON.stringify({ type: 'ready', title: '로그인' }));
  });

  test('renders a protected page without the web shell for a signed-in WebView', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? '');
    await recordAppMessages(page);
    await page.goto('/history');

    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '로그아웃' })).toHaveCount(0);
    await expect
      .poll(() => appMessages(page))
      .toContainEqual(JSON.stringify({ type: 'ready', title: '기록' }));
  });

  test('opens the default processing page without the web shell and reads the saved preferences', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? '');
    await recordAppMessages(page);
    await page.goto('/settings/processing');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사진 종류별 기본 처리');
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
    await expect(
      page
        .getByRole('group', { name: '텍스트 / 외국어' })
        .getByRole('radio', { name: /^추출 및 번역/ }),
    ).toBeChecked();
    await expect
      .poll(() => appMessages(page))
      .toContainEqual(JSON.stringify({ type: 'ready', title: '사진 종류별 기본 처리' }));
  });

  /** WebView는 앱에서 세션을 받으므로(핸드오프) 두 번째 OAuth 로그인을 시작하지 않는다. */
  test('does not offer Google login inside the app and asks the app for a session', async ({
    page,
  }) => {
    await recordAppMessages(page);
    await page.goto('/history');

    await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toHaveCount(0);
    await expect(page.getByText('앱에서 로그인한 뒤 다시 열어 주세요.')).toBeVisible();
    await expect.poll(() => appMessages(page)).toContainEqual(AUTH_REQUIRED);
  });

  test('hands the app only a challenge, keeping the verifier in an HttpOnly cookie', async ({
    page,
    context,
  }) => {
    await recordAppMessages(page);
    await page.goto('/auth/handoff/start?next=%2Fhistory');

    await expect(page).toHaveURL(/\/auth\/handoff\/ready\?next=%2Fhistory$/);
    const verifier = (await context.cookies()).find((cookie) => cookie.name.includes('handoff'));
    expect(verifier).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    await expect
      .poll(() => appMessages(page))
      .toContainEqual(expect.stringContaining('"type":"handoff-ready"'));
    const messages = await appMessages(page);
    const ready = JSON.parse(messages.find((m) => m.includes('handoff-ready')) ?? '{}');
    expect(ready).toEqual({
      type: 'handoff-ready',
      challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      next: '/history',
    });
    expect(messages.join()).not.toContain(verifier?.value);
    expect(await page.evaluate(() => document.cookie)).not.toContain('handoff');
  });

  test('starts a handoff to one job result, and only to a strictly formed one', async ({
    page,
  }) => {
    const jobId = '4f1c2a9e-0000-4000-8000-000000000000';
    await recordAppMessages(page);
    await page.goto(`/auth/handoff/start?next=%2Fhistory%2F${jobId}`);

    await expect(page).toHaveURL(new RegExp(`/auth/handoff/ready\\?next=%2Fhistory%2F${jobId}$`));
    await expect
      .poll(() => appMessages(page))
      .toContainEqual(expect.stringContaining(`"next":"/history/${jobId}"`));

    // A malformed job path is not a destination: the handoff falls back to the home.
    for (const next of ['%2Fhistory%2Fjob-1', `%2Fhistory%2F${jobId}%2Freceipt`]) {
      await page.goto(`/auth/handoff/start?next=${next}`);
      await expect(page).toHaveURL(/\/auth\/handoff\/ready\?next=%2F$/);
    }
  });

  test('asks the app to start over when the ready page has no verifier', async ({ page }) => {
    await recordAppMessages(page);
    await page.goto('/auth/handoff/ready?next=%2Fhistory');

    await expect.poll(() => appMessages(page)).toContainEqual(AUTH_REQUIRED);
  });

  test('refuses a handoff code from another browser without setting a session', async ({
    page,
    context,
  }) => {
    const response = await page.goto('/auth/handoff?code=stolen&next=%2Fhistory');

    await expect(page).toHaveURL(/\/login\?next=%2Fhistory&error=invalid_callback$/);
    expect(response?.request().redirectedFrom()?.url()).toContain('/auth/handoff?code=');
    expect((await context.cookies()).some((cookie) => cookie.name.includes('session'))).toBe(false);
  });
});

const AUTH_REQUIRED = JSON.stringify({ type: 'auth-required' });

const recordAppMessages = (page: Page) =>
  page.addInitScript(() => {
    const messages: string[] = [];
    Object.assign(window, {
      __appMessages: messages,
      ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
    });
  });

const appMessages = (page: Page) =>
  page.evaluate(() => (window as unknown as AppMessages).__appMessages);
