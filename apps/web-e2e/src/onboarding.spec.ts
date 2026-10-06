import { expect, type Page, test } from '@playwright/test';

import { processFirstPhoto, signIn } from './support/fixture';

/** Words that would claim the suggested work was already done. Nothing runs it yet. */
const DONE = /완료했습니다|기록 완료|정리 완료|저장했습니다|번역 완료|번역했습니다/;

/** The first result screen: the heading, then only what the fake API read from the photo. */
const expectResult = async (page: Page, facts: { term: string; value: string }) => {
  await expect(page.getByRole('heading', { level: 1, name: '사진을 확인했습니다' })).toBeVisible();
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  // Exactly the server's facts: no store, date, or payment method the server did not send.
  await expect(page.getByRole('term')).toHaveText([facts.term]);
  await expect(page.getByRole('definition')).toHaveText([facts.value]);
  await expect(page.getByRole('heading', { level: 2, name: '추천 작업' })).toBeVisible();
  await expect(page.getByText('아직 이 작업을 실행하지 않았습니다.')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(DONE);
};

test('a browser user goes from the intro through the first result to the home page', async ({
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

  await processFirstPhoto(page);

  await expectResult(page, { term: '금액', value: '12,000원' });
  await expect(page.getByText('영수증 사진')).toBeVisible();
  await expect(page.getByText('지출 정보 정리', { exact: true })).toBeVisible();
  await expect(page.getByText('일부 정보는 사진과 함께 확인해 주세요.')).toHaveCount(0);

  await page.getByRole('button', { name: '완료' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('이미지 액션 라우터');
  // The onboarding photo was processed, but it is not a general job: the home is the empty one,
  // with no recent item and no review section. The home goes by general jobs, not by any job.
  const recent = page.getByRole('region', { name: '최근 처리' });
  await expect(recent).toContainText('새로 추가한 사진의 처리 기록이 아직 없습니다.');
  await expect(recent.getByText('12,000원')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '확인이 필요한 처리' })).toHaveCount(0);

  // The server now has the onboarding finished, so it does not open again.
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/$/);
});

test('a foreign-language photo shows what was read and suggests a translation it has not done', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'first-image', 'foreign_text');
  await page.goto('/onboarding/first-image');

  await processFirstPhoto(page);

  await expectResult(page, { term: '문장', value: 'Exit only' });
  await expect(page.getByText('텍스트 / 외국어 사진')).toBeVisible();
  await expect(page.getByText('번역', { exact: true })).toBeVisible();
  await expect(page.getByText('일부 정보는 사진과 함께 확인해 주세요.')).toBeVisible();
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
