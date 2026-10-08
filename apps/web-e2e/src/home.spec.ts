import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import {
  linkTabKey,
  overflowsSideways,
  receiptJob,
  savePreference,
  SESSION_COOKIE,
  signIn,
  startJob,
  type UserOptions,
} from './support/fixture';
import { enterMain } from './support/keyboard';

/**
 * The home against the fake API, which keeps processing jobs and preferences per user like Go.
 * Whether the home is empty or active depends only on the jobs the server lists — every photo once
 * the onboarding is finished, the onboarding photo included — never on a query or a flag.
 */

test.use({ viewport: { width: 390, height: 844 } });

const EMPTY = '새로 추가한 사진의 처리 기록이 아직 없습니다.';
const REVIEW_EMPTY = '현재 확인이 필요한 처리가 없습니다.';

const section = (page: Page, name: string) => page.getByRole('region', { name });

/** Top of a section on the page, to check the reading order. */
const top = async (page: Page, name: string) =>
  (await section(page, name).boundingBox())?.y ?? Number.NaN;

/** Signs in a complete user with this fake API state and opens the home. */
const openHome = async (
  page: Page,
  context: BrowserContext,
  baseURL: string,
  options: UserOptions = {},
) => {
  const credential = await signIn(context, baseURL, 'complete', 'receipt', options);
  await page.goto('/');
  return credential;
};

test('shows the empty home to a user without photos since the onboarding', async ({
  page,
  context,
  baseURL,
}) => {
  await openHome(page, context, baseURL ?? '');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('이미지 액션 라우터');
  // Adding a photo opens the photo flow, never the onboarding first-photo page.
  await expect(page.getByRole('link', { name: '사진 추가하기' })).toHaveAttribute(
    'href',
    '/process',
  );

  await expect(section(page, '최근 처리')).toContainText(EMPTY);
  await expect(section(page, '확인이 필요한 처리')).toHaveCount(0);
  // The preferences live on the profile page; the empty home only says where.
  await expect(section(page, '기본 처리 설정')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: '내 정보' })).toHaveAttribute(
    'href',
    '/me',
  );

  const main = page.getByRole('main');
  await expect(main).not.toContainText('초기 설정 중입니다');
  await expect(main).not.toContainText(/자동화|Connector|장소|일정/);
  await expect(main.getByRole('link', { name: '기록 보기' })).toHaveCount(0);
});

test('shows the active home with what the server processed', async ({ page, context, baseURL }) => {
  const credential = await signIn(context, baseURL ?? '');
  // A photo started after the onboarding becomes a general job, the same rule as Go.
  await startJob(context.request, credential);
  await page.goto('/');

  const recent = section(page, '최근 처리');
  await expect(recent.getByRole('link', { name: '영수증' })).toBeVisible();
  // A finished job shows no status; only the unfinished ones say what happened.
  await expect(recent).not.toContainText('처리 완료');
  await expect(recent.getByText('12,000원')).toBeVisible();
  await expect(page.getByRole('main').getByRole('img')).toHaveCount(0);
  await expect(section(page, '확인이 필요한 처리')).toContainText(REVIEW_EMPTY);
  expect(await top(page, '최근 처리')).toBeLessThan(await top(page, '확인이 필요한 처리'));
  await expect(section(page, '기본 처리 설정')).toHaveCount(0);
  await expect(page.getByText(EMPTY)).toHaveCount(0);
});

test("never shows another user's jobs", async ({ page, context, baseURL, browser }) => {
  const other = await browser.newContext({ baseURL });
  await signIn(other, baseURL ?? '', 'complete', 'receipt', {
    generalJobs: [receiptJob(['가게', '다른 사용자 상점'])],
  });
  await other.close();

  await openHome(page, context, baseURL ?? '');

  await expect(section(page, '최근 처리')).toContainText(EMPTY);
  await expect(page.getByText('다른 사용자 상점')).toHaveCount(0);
});

test('shows on the profile page the preferences this user saved, not the defaults', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await signIn(context, baseURL ?? '');
  await savePreference(context.request, credential, 'text', 'summarize');
  await savePreference(context.request, credential, 'receipt', 'extract_text');
  await page.goto('/');
  // At phone width the profile page is a bottom tab.
  await page
    .getByRole('navigation', { name: '하단 메뉴' })
    .getByRole('link', { name: '내 정보' })
    .click();
  await expect(page).toHaveURL(/\/me$/);

  const preferences = section(page, '기본 처리 설정');
  await expect(preferences.getByText('요약', { exact: true })).toBeVisible();
  await expect(preferences.getByText('텍스트만 추출', { exact: true })).toBeVisible();
  await expect(preferences.getByText('추출 및 번역', { exact: true })).toHaveCount(0);
  await expect(preferences.getByText('지출 정보로 정리', { exact: true })).toHaveCount(0);
});

test('says the jobs could not be read instead of showing an empty home', async ({
  page,
  context,
  baseURL,
}) => {
  await openHome(page, context, baseURL ?? '', { recentJobsFail: true });

  await expect(section(page, '최근 처리').getByRole('alert')).toHaveText(
    '처리 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await expect(section(page, '확인이 필요한 처리')).toHaveCount(0);
});

test('says on the profile page that the preferences cannot be read, without defaults', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'complete', 'receipt', { preferencesReadFail: true });
  await page.goto('/me');

  const preferences = section(page, '기본 처리 설정');
  await expect(preferences.getByRole('alert')).toHaveText('기본 처리 설정을 불러오지 못했습니다.');
  await expect(preferences.getByText('추출 및 번역', { exact: true })).toHaveCount(0);
  await expect(preferences.getByRole('link', { name: '설정 변경' })).toHaveAttribute(
    'href',
    '/settings/processing',
  );
});

test('does not scroll sideways at 320px with long values', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openHome(page, context, baseURL ?? '', {
    generalJobs: [
      receiptJob(
        ['가게', '서울특별시강남구테헤란로아주긴가게이름이띄어쓰기없이이어지는상호명주식회사본점'],
        [
          '영수증 주소',
          'https://receipts.example.com/2026/10/06/a-very-long-path-without-any-break',
        ],
      ),
    ],
  });

  await expect(section(page, '최근 처리').getByText(/^서울특별시강남구/)).toBeVisible();
  expect(await overflowsSideways(page)).toBe(false);
});

test('reaches the photo flow and the profile page by keyboard', async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  await openHome(page, context, baseURL ?? '');

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['최근 처리']);

  await enterMain(page, browserName);
  // The photo link is the first stop in the main, the profile link of the empty home the next one.
  await page.keyboard.press(linkTabKey(browserName));
  await expect(page.getByRole('link', { name: '사진 추가하기' })).toBeFocused();
  await page.keyboard.press(linkTabKey(browserName));
  await expect(page.getByRole('main').getByRole('link', { name: '내 정보' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/me$/);
});

test('sends a signed-out visitor to login with home as the return path', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

test('treats a session Go no longer accepts as signed out on the home', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: SESSION_COOKIE, value: 'revoked', url: baseURL ?? '', httpOnly: true, sameSite: 'Lax' },
  ]);
  await page.goto('/');

  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});
