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
  const item = recent.getByRole('link', { name: '영수증 · 지출 정보로 정리' });
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
  await expect(recent.getByRole('link', { name: '텍스트 / 외국어 · 요약' })).toBeVisible();
  await expect(section(page, '확인이 필요한 처리')).toContainText(
    '현재 확인이 필요한 처리가 없습니다.',
  );
});

test('shows only the three newest jobs on the home and leads to the whole history', async ({
  page,
  context,
  baseURL,
}) => {
  await signInWithJobs(context, baseURL ?? '', [
    processedJob('text', 'extract_text', { original: 'First' }),
    processedJob('text', 'extract_text', { original: 'Second' }),
    processedJob('text', 'extract_text', { original: 'Third' }),
    processedJob('text', 'extract_text', { original: 'Fourth' }),
  ]);
  await page.goto('/');

  const recent = section(page, '최근 처리');
  await expect(recent.getByRole('listitem')).toHaveCount(3);
  // Newest first: the oldest one waits in the history.
  await expect(recent).not.toContainText('First');
  await recent.getByRole('link', { name: '전체 보기' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(4);
});

test('deletes a job from its result after a confirmation and returns to the history', async ({
  page,
  context,
  baseURL,
}) => {
  const [, textJob] = await signInWithJobs(context, baseURL ?? '', [
    receiptJob(['금액', '12,000원']),
    processedJob('text', 'extract_text', { original: 'Exit only' }),
  ]);
  await page.goto('/history');
  await page.getByRole('link', { name: '텍스트 / 외국어 · 텍스트만 추출' }).click();

  // Deleting cannot be undone, so the first press only asks.
  const remove = page.getByRole('button', { name: '기록 삭제' });
  await remove.click();
  await expect(page.getByText('이 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.')).toBeFocused();
  await page.getByRole('button', { name: '취소' }).click();
  await expect(remove).toBeFocused();

  await remove.click();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const items = page.getByRole('main').getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('12,000원');
  // The deleted job is gone for good, not just hidden from the list.
  await page.goto(`/history/${textJob}`);
  await expect(page.getByRole('alert')).toContainText('찾을 수 없');
});

test('deletes several chosen jobs at once after a confirmation', async ({
  page,
  context,
  baseURL,
}) => {
  await signInWithJobs(context, baseURL ?? '', [
    processedJob('text', 'extract_text', { original: 'First' }),
    processedJob('text', 'extract_text', { original: 'Second' }),
    processedJob('text', 'extract_text', { original: 'Third' }),
  ]);
  await page.goto('/history');
  const main = page.getByRole('main');

  await main.getByRole('button', { name: '선택' }).click();
  const boxes = main.getByRole('checkbox');
  // One "select all" for the day and one box per job.
  await expect(boxes).toHaveCount(4);
  const remove = main.getByRole('button', { name: /^선택한 \d+개 삭제$/ });
  await expect(remove).toBeDisabled();
  await boxes.nth(1).check();
  await boxes.nth(2).check();
  await expect(main.getByText('2개 선택됨')).toBeVisible();

  // Deleting cannot be undone, so the button only asks first.
  await remove.click();
  await expect(
    main.getByText('선택한 2개 기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.'),
  ).toBeFocused();
  await main.getByRole('button', { name: '삭제', exact: true }).click();

  await expect(main.getByRole('status')).toHaveText('2개를 삭제했습니다.');
  await expect(main.getByRole('listitem')).toHaveCount(1);
  await expect(main.getByRole('listitem')).toContainText('First');
  await expect(main.getByRole('checkbox')).toHaveCount(0);
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
  await page.getByRole('link', { name: '텍스트 / 외국어 · 텍스트만 추출' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('텍스트를 추출했습니다');

  // The result leads back to the history, even when opened directly: at phone width through the header.
  await expect(page.getByRole('banner')).toContainText('처리 결과');
  await page.getByRole('banner').getByRole('link', { name: '기록으로 돌아가기' }).click();
  await expect(page).toHaveURL(/\/history$/);
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
