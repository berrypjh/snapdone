import { expect, type Page, test } from '@playwright/test';

import { processedJob, processFirstPhoto, type ReceiptField, signIn } from './support/fixture';

/** Words that would claim work was done. A job without a product result has done nothing. */
const DONE =
  /완료했습니다|기록 완료|정리 완료|저장했습니다|번역 완료|번역했습니다|정리했습니다|추출했습니다/;

const field = (
  value: string | null,
  candidates: string[] = [],
  resolved = value !== null,
): ReceiptField => ({
  value,
  candidates,
  resolved,
});

/** The first photo comes back processed with the user's stored default: a receipt organized as an expense. */
const receiptExpense = processedJob('receipt', 'record_expense', {
  expense: {
    merchant: field('카페 봄'),
    date: field('2026-10-07'),
    total: field('12000'),
    currency: field('KRW'),
    paymentMethod: field(null),
  },
});

/** The first result is the real processing result: the done work, the applied action, the photo, the server values. */
const expectProcessed = async (page: Page, title: string, applied: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(applied)).toBeVisible();
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  // The result offers the same photo with another action; the first photo is no exception.
  await expect(page.getByRole('region', { name: '다른 방식으로 처리' })).toBeVisible();
  await expect(page.getByText('아직 이 작업을 실행하지 않았습니다.')).toHaveCount(0);
};

test('a browser user goes from the intro through the first result to the home page', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'intro', 'receipt', { uploads: [receiptExpense] });
  await page.goto('/onboarding');

  // No purpose question: the intro goes straight to the first photo.
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);

  await processFirstPhoto(page);

  await expectProcessed(page, '지출 정보를 정리했습니다', '영수증 · 지출 정보로 정리');
  // Exactly the server's values: the payment method it did not find is not made up.
  await expect(page.getByRole('region', { name: '지출 정보' }).getByRole('definition')).toHaveText([
    '카페 봄',
    '2026. 10. 7.',
    '12,000원',
    'KRW',
    '사진에서 찾지 못했습니다',
  ]);

  await page.getByRole('button', { name: '완료' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('이미지 액션 라우터');
  // Once the onboarding is finished, its photo is in the recent jobs like any other.
  const recent = page.getByRole('region', { name: '최근 처리' });
  await expect(
    recent.getByRole('link', { name: '영수증 · 지출 정보로 정리 · 처리 완료' }),
  ).toBeVisible();
  await expect(recent.getByText(/카페 봄/)).toBeVisible();
  await expect(recent).not.toContainText('새로 추가한 사진의 처리 기록이 아직 없습니다.');

  // The server now has the onboarding finished, so it does not open again.
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/$/);
});

test('a foreign-language first photo shows the extracted text and its translation', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'first-image', 'foreign_text', {
    uploads: [
      processedJob('text', 'extract_and_translate', {
        original: 'Exit only',
        translation: { needed: true, text: '출구 전용' },
      }),
    ],
  });
  await page.goto('/onboarding/first-image');

  await processFirstPhoto(page);

  await expectProcessed(page, '텍스트를 추출하고 번역했습니다', '텍스트 / 외국어 · 추출 및 번역');
  await expect(page.getByRole('region', { name: '원문' })).toContainText('Exit only');
  await expect(page.getByRole('region', { name: '번역' })).toContainText('출구 전용');
});

test('a first photo without a product result shows only what the server read and claims no work', async ({
  page,
  context,
  baseURL,
}) => {
  // A job made before the product result contract: the classification only.
  await signIn(context, baseURL ?? '', 'first-image', 'foreign_text');
  await page.goto('/onboarding/first-image');

  await processFirstPhoto(page);

  await expect(page.getByRole('heading', { level: 1, name: '사진을 확인했습니다' })).toBeVisible();
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  // Exactly the server's facts, and no done work, no reprocessing of a result that does not exist.
  await expect(page.getByRole('term')).toHaveText(['문장']);
  await expect(page.getByRole('definition')).toHaveText(['Exit only']);
  await expect(page.getByRole('main')).not.toContainText(DONE);
  await expect(page.getByRole('region', { name: '다른 방식으로 처리' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '완료' })).toBeVisible();
});

test('reopening onboarding resumes the saved step', async ({ page, context, baseURL }) => {
  await signIn(context, baseURL ?? '', 'intro');
  await page.goto('/onboarding/first-image');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);

  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/onboarding\/first-image$/);
});
