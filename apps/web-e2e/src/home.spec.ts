import { expect, test } from '@playwright/test';

test('renders the bootstrap page in Korean', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('이미지 액션 라우터');
});

test('states that the product is still being set up', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('초기 설정 중입니다')).toBeVisible();
});
