import { expect, test } from '@playwright/test';

import { signIn } from './support/fixture';

/** 1×1 PNG. The fake API does not read it; Go would judge the format by its content. */
const PHOTO = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
};

test('a browser user goes from the intro through purposes to the first photo', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'intro');
  await page.goto('/onboarding');

  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding\/purpose$/);

  const next = page.getByRole('button', { name: '다음' });
  await expect(next).toBeDisabled();
  await page.getByRole('checkbox', { name: '맛집 / 카페' }).check();
  await page.getByRole('checkbox', { name: '영수증' }).check();
  await next.click();
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);

  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByRole('heading', { name: '사진을 처리할까요?' })).toBeVisible();
  await page.getByRole('button', { name: '처리하기' }).click();

  await expect(page.getByRole('status')).toHaveText('다음 단계는 준비 중입니다.');
});

test('unsure stays alone and a skip also reaches the first photo', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'intro');
  await page.goto('/onboarding');
  await page.getByRole('button', { name: '시작하기' }).click();

  await page.getByRole('checkbox', { name: '여행' }).check();
  await page.getByRole('checkbox', { name: '아직 모르겠어요' }).check();
  await expect(page.getByRole('checkbox', { name: '여행' })).not.toBeChecked();

  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);
});

test('reopening onboarding resumes the saved step', async ({ page, context, baseURL }) => {
  await signIn(context, baseURL ?? '', 'intro');
  await page.goto('/onboarding/first-image');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);

  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);
});
