import { type APIRequestContext, type BrowserContext, expect, type Page } from '@playwright/test';

/** The fake API started by `playwright.config.mts` (`support/fake-api.mts`). */
export const FAKE_API_URL = 'http://127.0.0.1:4010';

/** Where the fake API sends the browser to "Google". Never resolves; tests answer it with `page.route`. */
const FAKE_AUTHORIZE = 'https://oauth.fake.test/**';

/** The Google login button on `/login`. */
export const GOOGLE = { name: 'Google로 계속하기' } as const;

/**
 * An iPhone WebView User-Agent with the app's `SnapdoneApp/<contract version>` token from
 * libs/webview-bridge. Written out literally to pin the wire format.
 */
export const IN_APP_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 SnapdoneApp/1';

/** Whether the page scrolls sideways at its current viewport. */
export const overflowsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/** WebKit on macOS skips links on plain Tab, so link focus needs Alt+Tab there. */
export const linkTabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

/** `next dev` cookie name (`authCookies()` outside production). */
export const SESSION_COOKIE = 'snapdone-session-dev';

/** `first-image` is a user who skipped the purposes and is about to add the first photo. */
type OnboardingStep = 'intro' | 'first-image' | 'complete';

/** What the fake API returns for this user's photos. Chosen per user so parallel tests stay apart. */
export type PhotoResult = 'receipt' | 'foreign_text';

/** What the classifier read from one photo (Go `processing.Result`). */
export type JobResult = {
  category: 'receipt' | 'foreign_text' | 'place' | 'event' | 'shopping' | 'work' | 'other';
  facts: { label: string; value: string }[];
  suggestedAction: 'save_place' | 'add_to_calendar' | 'record_expense' | 'translate' | 'none';
  confidence: 'high' | 'medium' | 'low';
};

/**
 * Per-user fake API state, chosen per user so parallel tests stay apart.
 * `generalJobs` are photos this user already processed after the onboarding, oldest first.
 * The `*Fails` switches make that one request answer 500 for this user.
 */
export type UserOptions = {
  generalJobs?: JobResult[];
  preferenceSaveFails?: boolean;
  preferencesReadFail?: boolean;
  recentJobsFail?: boolean;
};

/** A completed receipt job with these facts. */
export const receiptJob = (...facts: [label: string, value: string][]): JobResult => ({
  category: 'receipt',
  facts: facts.map(([label, value]) => ({ label, value })),
  suggestedAction: 'record_expense',
  confidence: 'high',
});

/** Mints a session in the fake API and returns its credential. */
export const mintSession = async (
  request: APIRequestContext,
  onboardingStep: OnboardingStep,
  kind: 'web' | 'mobile' = 'web',
  result: PhotoResult = 'receipt',
  options: UserOptions = {},
): Promise<string> => {
  const response = await request.post(`${FAKE_API_URL}/__fixture/sessions`, {
    data: { onboardingStep, kind, result, ...options },
  });
  return ((await response.json()) as { credential: string }).credential;
};

/** Signs this browser context in the way `/auth/callback` would: an HttpOnly session cookie. */
export const signIn = async (
  context: BrowserContext,
  baseURL: string,
  onboardingStep: OnboardingStep = 'complete',
  result: PhotoResult = 'receipt',
  options: UserOptions = {},
): Promise<string> => {
  const credential = await mintSession(context.request, onboardingStep, 'web', result, options);
  await context.addCookies([
    { name: SESSION_COOKIE, value: credential, url: baseURL, httpOnly: true, sameSite: 'Lax' },
  ]);
  return credential;
};

/** 1×1 PNG. The fake API does not read it; Go would judge the format by its content. */
const PHOTO = {
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
};

/** Saves one image type's preference the way the settings page would (Go `PUT /v1/processing-preferences/{imageType}`). */
export const savePreference = async (
  request: APIRequestContext,
  credential: string,
  imageType: 'text' | 'receipt',
  action: string,
) => {
  await request.put(`${FAKE_API_URL}/v1/processing-preferences/${imageType}`, {
    headers: { Authorization: `Bearer ${credential}` },
    data: { action },
  });
};

/** Starts a processing job the way an app would. After the onboarding it is a general job. */
export const startJob = async (request: APIRequestContext, credential: string) => {
  await request.post(`${FAKE_API_URL}/v1/processing-jobs`, {
    headers: { Authorization: `Bearer ${credential}` },
    multipart: { image: PHOTO },
  });
};

/**
 * Picks a photo on `/onboarding/first-image` and processes it. The file input is the one
 * non-role locator: the browser's file chooser has no accessible name to reach it by.
 */
export const processFirstPhoto = async (page: Page) => {
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByRole('heading', { name: '사진을 처리할까요?' })).toBeVisible();
  await page.getByRole('button', { name: '처리하기' }).click();
};

/** Answers the provider consent screen: a new user, a returning user, or the user closing it. */
export const answerGoogle = (page: Page, decision: 'new' | 'returning' | 'access_denied') =>
  page.route(FAKE_AUTHORIZE, (route) => {
    const state = new URL(route.request().url()).searchParams.get('state') ?? '';
    const query = new URLSearchParams({ state });
    query.set(decision === 'access_denied' ? 'error' : 'code', decision);
    return route.fulfill({
      status: 302,
      headers: { location: `${FAKE_API_URL}/v1/auth/oauth/callback?${query}` },
    });
  });

type Faults = { startStatus?: number; startDelayMs?: number };

/** Global fault switches. Only the serial `faults` projects may call this. */
export const setFaults = async (request: APIRequestContext, faults: Faults) => {
  await request.put(`${FAKE_API_URL}/__fixture/faults`, { data: faults });
};

export const startCalls = async (request: APIRequestContext): Promise<number> =>
  ((await (await request.get(`${FAKE_API_URL}/__fixture/faults`)).json()) as { startCalls: number })
    .startCalls;
