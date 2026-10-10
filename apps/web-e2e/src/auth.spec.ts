import { type BrowserContext, expect, type Page, type Request, test } from '@playwright/test';

import {
  answerGoogle,
  FAKE_API_URL,
  GOOGLE,
  IN_APP_USER_AGENT,
  mintSession,
  SESSION_COOKIE,
  signIn,
} from './support/fixture';

/**
 * Browser login against the fake auth API (support/fake-api.mts). Google itself is never
 * contacted: the consent screen is answered with `page.route`.
 */

const sessionCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE);

/** Records every request URL and Referer so the one-time code can be traced after the login. */
const recordRequests = (page: Page) => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return requests;
};

test.use({ viewport: { width: 390, height: 844 } });

test('a new Google user lands on onboarding with an HttpOnly session cookie', async ({
  page,
  context,
}) => {
  const requests = recordRequests(page);
  await answerGoogle(page, 'new');
  await page.goto('/login');

  await page.getByRole('button', GOOGLE).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('사진 한 장으로');
  const cookie = await sessionCookie(context);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', secure: false });
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000);
  expect((await context.cookies()).some((c) => c.name.includes('preauth'))).toBe(false);

  const callback = requests.find((r) => new URL(r.url()).pathname === '/auth/callback');
  const code = new URL(callback?.url() ?? 'http://x').searchParams.get('code');
  expect(code).toBeTruthy();
  const response = await callback?.response();
  expect(response?.status()).toBe(303);
  expect(response?.headers()['cache-control']).toBe('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');

  const after = requests.slice(requests.indexOf(callback as Request) + 1);
  for (const request of after) {
    expect(request.url()).not.toContain(code);
    expect((await request.allHeaders())['referer'] ?? '').not.toContain(code);
  }
  // The session value is not checked against the HTML: `next dev` inlines React's debug record of the
  // awaited `cookies()` store into the page. Production React builds emit no such record.
  const leaks = await page.evaluate(
    ([code, session]) => {
      const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
      const outside = stored + document.cookie + location.href;
      const html = document.documentElement.outerHTML;
      return [
        ...(code && (outside + html).includes(code) ? ['code'] : []),
        ...(session && outside.includes(session) ? ['session'] : []),
      ];
    },
    [code ?? '', cookie?.value ?? ''],
  );
  expect(leaks).toEqual([]);
});

test('a returning user goes back to the protected page they asked for', async ({ page }) => {
  await answerGoogle(page, 'returning');
  await page.goto('/history');
  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);

  await page.getByRole('button', GOOGLE).click();

  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
});

test('closing the Google screen returns to login quietly, ready to try again', async ({
  page,
  context,
}) => {
  await answerGoogle(page, 'access_denied');
  await page.goto('/login');

  await page.getByRole('button', GOOGLE).click();

  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', GOOGLE)).toBeEnabled();
  expect(await sessionCookie(context)).toBeUndefined();
});

test('treats a session cookie Go no longer accepts as signed out', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: 'revoked', url: baseURL ?? '', httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto('/history');

  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
});

test.describe('signed in', () => {
  test('opens a protected page directly', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL ?? '');
    await page.goto('/history');

    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
  });

  test('sends a user who has not finished onboarding to onboarding', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? '', 'intro');
    await page.goto('/history');

    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('skips the login page', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL ?? '');
    await page.goto('/login?next=%2Fhistory');

    await expect(page).toHaveURL(/\/history$/);
  });

  test('logs out, revokes the session, and cannot go back to the protected page', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const credential = await signIn(context, baseURL ?? '');
    await page.goto('/history');

    // Logout lives on the profile page the header links to.
    await page.getByRole('banner').getByRole('link', { name: '내 정보' }).click();
    await page.getByRole('main').getByRole('button', { name: '로그아웃' }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(await sessionCookie(context)).toBeUndefined();
    const lookup = await context.request.get(`${FAKE_API_URL}/v1/auth/session`, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    expect(lookup.status()).toBe(401);

    // Back leads to the profile page the logout was on, which now asks for a login.
    await page.goBack();
    await expect(page).toHaveURL(/\/login\?next=%2Fme$/);
    await expect(page.getByRole('heading', { name: '내 정보' })).toHaveCount(0);
  });
});

test.describe('WebView handoff', () => {
  test.use({ userAgent: IN_APP_USER_AGENT });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const messages: string[] = [];
      Object.assign(window, {
        __appMessages: messages,
        ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
      });
    });
  });

  const readyMessage = (page: Page) =>
    page.evaluate(() =>
      (window as unknown as { __appMessages: string[] }).__appMessages.find((message) =>
        message.includes('handoff-ready'),
      ),
    );

  /** Plays the app: reads the challenge from the ready page and asks for a code with its own session. */
  const handoffCode = async (page: Page, appCredential: string, next = '/history') => {
    await page.goto(`/auth/handoff/start?next=${encodeURIComponent(next)}`);
    await expect.poll(() => readyMessage(page)).toBeTruthy();
    const { challenge } = JSON.parse((await readyMessage(page)) ?? '{}') as { challenge: string };
    const response = await page.request.post(`${FAKE_API_URL}/v1/auth/handoff/start`, {
      headers: { Authorization: `Bearer ${appCredential}` },
      data: { challenge, next },
    });
    return ((await response.json()) as { code: string }).code;
  };

  test('replaces the WebView session with the app user and drops the code from the URL', async ({
    page,
    context,
    baseURL,
  }) => {
    const previous = await signIn(context, baseURL ?? '');
    const app = await mintSession(context.request, 'complete', 'mobile');
    const code = await handoffCode(page, app);

    await page.goto(`/auth/handoff?code=${code}&next=%2Fhistory`);

    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('기록');
    const cookie = await sessionCookie(context);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).not.toBe(previous);
    expect((await context.cookies()).some((c) => c.name.includes('handoff'))).toBe(false);
    expect(await page.content()).not.toContain(code);
  });

  test('lands on the default processing page with the app user', async ({ page, context }) => {
    const app = await mintSession(context.request, 'complete', 'mobile');
    const code = await handoffCode(page, app, '/settings/processing');

    await page.goto(`/auth/handoff?code=${code}&next=%2Fsettings%2Fprocessing`);

    await expect(page).toHaveURL(/\/settings\/processing$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사진 종류별 기본 처리');
    await expect(
      page.getByRole('group', { name: '영수증' }).getByRole('radio', { name: /^지출 정보로 정리/ }),
    ).toBeChecked();
  });

  test('refuses a handoff code the second time', async ({ page, context }) => {
    const app = await mintSession(context.request, 'complete', 'mobile');
    const code = await handoffCode(page, app);
    await page.goto(`/auth/handoff?code=${code}&next=%2Fhistory`);
    await expect(page).toHaveURL(/\/history$/);
    await context.clearCookies();

    await handoffCode(page, app);
    await page.goto(`/auth/handoff?code=${code}&next=%2Fhistory`);

    await expect(page).toHaveURL(/\/login\?next=%2Fhistory&error=invalid_callback$/);
    expect(await sessionCookie(context)).toBeUndefined();
  });

  test('keeps the WebView on this site for an outside next', async ({ page, context, baseURL }) => {
    const app = await mintSession(context.request, 'complete', 'mobile');
    const code = await handoffCode(page, app, '/');

    await page.goto(`/auth/handoff?code=${code}&next=%2F%2Fevil.example`);
    expect(new URL(page.url()).origin).toBe(baseURL);
    await expect(page).toHaveURL(/\/login\?next=%2F&error=invalid_callback$/);
    expect(await sessionCookie(context)).toBeUndefined();

    await page.goto('/auth/handoff/start?next=https%3A%2F%2Fevil.example');
    await expect(page).toHaveURL(/\/auth\/handoff\/ready\?next=%2F$/);
    expect(new URL(page.url()).origin).toBe(baseURL);
  });
});
