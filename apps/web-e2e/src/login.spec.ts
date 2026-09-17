import { expect, test } from '@playwright/test';

const GOOGLE = { name: 'Google로 계속하기' } as const;

test.describe('login screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the sign-in copy and exactly one Google button, without navigation', async ({
    page,
  }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사진에서 행동까지.');
    await expect(page.getByText('찍거나 올리면 AI가 알아서 처리합니다.')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
    await expect(page.getByRole('button', GOOGLE)).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('complementary')).toHaveCount(0);
  });

  test('does not scroll sideways at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/login');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
  });

  test('shows a callback error from the query', async ({ page }) => {
    await page.goto('/login?error=invalid_callback');

    await expect(page.getByRole('alert')).toHaveText(
      '로그인을 끝내지 못했습니다. 다시 시도해 주세요.',
    );
  });

  test('sends a signed-out visitor from onboarding to login', async ({ page }) => {
    await page.goto('/onboarding');

    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  });

  /**
   * Google이 설정된 Go API가 필요하다. 없으면 버튼이 비활성 상태다.
   * Google에는 실제로 접속하지 않는다 — 동의 화면 요청은 중단한다.
   */
  test('locks the button while the login is starting', async ({ page }) => {
    await page.goto('/login');
    const button = page.getByRole('button', GOOGLE);
    // eslint-disable-next-line playwright/no-skipped-test -- Go가 Google을 제공할 때만 의미가 있다
    test.skip(await button.isDisabled(), 'Go API with Google login is not running');

    await page.route('https://accounts.google.com/**', (route) => route.abort());
    await page.route('**/login*', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return route.continue();
    });

    await button.click();
    await expect(button).toBeDisabled();
  });
});

test('sends a signed-out visitor from a protected page to login and back to that page', async ({
  page,
}) => {
  await page.goto('/history');

  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
  await expect(page.locator('input[name="next"]')).toHaveValue('/history');
});

test('ignores an outside return path', async ({ page }) => {
  await page.goto('/login?next=%2F%2Fevil.example');

  await expect(page.locator('input[name="next"]')).toHaveValue('/');
});

test('refuses a callback that has no matching login in this browser', async ({ page }) => {
  await page.goto(`/auth/callback?code=forged&state=${'s'.repeat(43)}`);

  await expect(page).toHaveURL(/\/login\?next=%2F&error=invalid_callback$/);
  await expect(page.getByRole('alert')).toHaveText(
    '로그인을 끝내지 못했습니다. 다시 시도해 주세요.',
  );
});
