import { expect, type Page, test } from '@playwright/test';

import {
  PHOTO,
  processedJob,
  type ReceiptField,
  receiptJob,
  signIn,
  signInWithJobs,
} from './support/fixture';

/**
 * The whole general flow against the fake API: the home is empty until a photo is processed after the
 * onboarding, then lists it from the server, links it to its result, and flags it when a receipt value needs a check.
 */

test.use({ viewport: { width: 390, height: 844 } });

const field = (
  value: string | null,
  candidates: string[] = [],
  resolved = value !== null,
): ReceiptField => ({
  value,
  candidates,
  resolved,
});

const uncertainReceipt = processedJob('receipt', 'record_expense', {
  expense: {
    merchant: field('카페 봄'),
    date: field('2026-10-07'),
    total: field('12000', ['12000', '13000'], false),
    currency: field('KRW'),
    paymentMethod: field('신한카드'),
  },
});

const section = (page: Page, name: string) => page.getByRole('region', { name });

test('turns the empty home active with the processed photo, flags its check, and opens its result', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'complete', 'receipt', { uploads: [uncertainReceipt] });
  await page.goto('/');
  await expect(section(page, '최근 처리')).toContainText(
    '새로 추가한 사진의 처리 기록이 아직 없습니다.',
  );
  await expect(section(page, '확인이 필요한 처리')).toHaveCount(0);

  await page.getByRole('link', { name: '사진 추가하기' }).click();
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: '처리하기' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '지출 정보를 정리했습니다' }),
  ).toBeVisible();

  await page.goto('/');
  const recent = section(page, '최근 처리');
  const item = recent.getByRole('link', { name: '영수증 · 지출 정보로 정리 · 처리 완료' });
  await expect(item).toBeVisible();
  await expect(recent).toContainText('카페 봄 · 12,000원');
  await expect(recent).toContainText('확인이 필요한 정보가 있습니다');
  // The review section comes from the same server result, not from a placeholder.
  await expect(section(page, '확인이 필요한 처리').getByRole('link')).toHaveCount(1);

  await item.click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('지출 정보를 정리했습니다');
  // The record has no photo, so it offers no reprocessing of it.
  await expect(page.getByRole('region', { name: '다른 방식으로 처리' })).toHaveCount(0);
});

test('keeps the review empty for results that need no check, and says a failed job failed', async ({
  page,
  context,
  baseURL,
}) => {
  await signInWithJobs(context, baseURL ?? '', [
    processedJob('text', 'summarize', { summary: '출구 안내입니다.' }),
    { result: receiptJob(), status: 'failed' },
  ]);
  await page.goto('/');

  const recent = section(page, '최근 처리');
  await expect(recent.getByRole('link', { name: '처리하지 못함' })).toBeVisible();
  await expect(
    recent.getByRole('link', { name: '텍스트 / 외국어 · 요약 · 처리 완료' }),
  ).toBeVisible();
  await expect(section(page, '확인이 필요한 처리')).toContainText(
    '현재 확인이 필요한 처리가 없습니다.',
  );
});

test('lists the general jobs in the history and opens one', async ({ page, context, baseURL }) => {
  await signInWithJobs(context, baseURL ?? '', [
    receiptJob(['금액', '12,000원']),
    processedJob('text', 'extract_text', { original: 'Exit only' }),
  ]);
  await page.goto('/history');

  const items = page.getByRole('main').getByRole('listitem');
  await expect(items).toHaveCount(2);
  // An earlier job without a product result keeps its found facts.
  await expect(items.nth(1)).toContainText('12,000원');
  await page.getByRole('link', { name: '텍스트 / 외국어 · 텍스트만 추출 · 처리 완료' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('텍스트를 추출했습니다');
});

test('does not open another user’s job from the history path', async ({
  page,
  context,
  baseURL,
}) => {
  const [othersJob] = await signInWithJobs(context, baseURL ?? '', [receiptJob()]);
  await context.clearCookies();
  await signInWithJobs(context, baseURL ?? '', []);

  await page.goto(`/history/${othersJob}`);
  await expect(page.getByRole('alert')).toHaveText('처리 기록을 찾을 수 없습니다.');
});

test('says the history could not be read instead of showing it empty', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '', 'complete', 'receipt', { recentJobsFail: true });
  await page.goto('/history');

  await expect(page.getByRole('alert')).toHaveText(
    '처리 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  );
  await expect(page.getByText('아직 기록이 없습니다.')).toHaveCount(0);
});
