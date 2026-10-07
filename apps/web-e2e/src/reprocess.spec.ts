import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import {
  listJobs,
  PHOTO,
  processedJob,
  readPreferences,
  type SeededJob,
  signIn,
  type UserOptions,
} from './support/fixture';

/**
 * Reprocessing the photo on the result with another action, and keeping that action for later photos.
 * The two are separate requests: reprocessing never changes the stored preferences; only the checked box does.
 */

test.use({ viewport: { width: 390, height: 844 } });

const DEFAULTS = { text: 'extract_and_translate', receipt: 'record_expense' };

const textFirst = processedJob('text', 'extract_and_translate', {
  original: 'Exit only',
  translation: { needed: true, text: '출구 전용' },
});
const textSummary = processedJob('text', 'summarize', { summary: '출구 안내입니다.' });

/** Processes one photo whose uploads come back as these jobs, in order, and waits for the first result. */
const processPhoto = async (
  page: Page,
  context: BrowserContext,
  baseURL: string,
  uploads: SeededJob[],
  options: UserOptions = {},
) => {
  const credential = await signIn(context, baseURL, 'complete', 'receipt', { uploads, ...options });
  await page.goto('/process');
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: '처리하기' }).click();
  await expect(page.getByRole('heading', { level: 2, name: '다른 방식으로 처리' })).toBeVisible();
  return credential;
};

const panel = (page: Page) => page.getByRole('region', { name: '다른 방식으로 처리' });
const remember = (page: Page) =>
  panel(page).getByRole('checkbox', { name: '앞으로 텍스트 / 외국어 사진도 이 방식으로 처리' });

test('offers only the actions of this image type, with the applied one marked', async ({
  page,
  context,
  baseURL,
}) => {
  await processPhoto(page, context, baseURL ?? '', [textFirst]);

  const radios = panel(page).getByRole('radio');
  await expect(radios).toHaveCount(4);
  await expect(panel(page).getByRole('radio', { name: '추출 및 번역(현재 적용)' })).toBeChecked();
  await expect(panel(page).getByText('현재 적용: 추출 및 번역')).toBeVisible();
  // Nothing to do until another action is chosen; the box only appears then.
  await expect(panel(page).getByRole('button', { name: '이 방식으로 다시 처리' })).toBeDisabled();
  await expect(remember(page)).toHaveCount(0);
});

test('offers the three receipt actions for a receipt', async ({ page, context, baseURL }) => {
  await processPhoto(page, context, baseURL ?? '', [
    processedJob('receipt', 'summarize', { summary: '카페 봄 결제' }),
  ]);

  await expect(panel(page).getByRole('radio')).toHaveCount(3);
  for (const name of ['지출 정보로 정리', '텍스트만 추출', '요약(현재 적용)']) {
    await expect(panel(page).getByRole('radio', { name, exact: true })).toBeVisible();
  }
  await expect(panel(page).getByRole('radio', { name: '추출 및 번역' })).toHaveCount(0);
  await panel(page).getByRole('radio', { name: '텍스트만 추출' }).check();
  await expect(
    panel(page).getByRole('checkbox', { name: '앞으로 영수증 사진도 이 방식으로 처리' }),
  ).not.toBeChecked();
});

test('reprocesses this photo once without changing the stored preferences', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await processPhoto(page, context, baseURL ?? '', [textFirst, textSummary]);

  await panel(page).getByRole('radio', { name: '요약', exact: true }).check();
  await expect(remember(page)).not.toBeChecked();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '내용을 요약했습니다' })).toBeVisible();
  await expect(page.getByText('텍스트 / 외국어 · 요약')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: '다른 방식으로 다시 처리했습니다.' }),
  ).toBeVisible();
  const [reprocess, source] = await listJobs(page.request, credential);
  expect(reprocess?.sourceJobId).toBe(source?.jobId);
  expect(await readPreferences(page.request, credential)).toEqual(DEFAULTS);
});

test('keeps the new action as the default only when the box is checked, for this type only', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await processPhoto(page, context, baseURL ?? '', [textFirst, textSummary]);

  await panel(page).getByRole('radio', { name: '요약', exact: true }).check();
  await remember(page).check();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '내용을 요약했습니다' })).toBeVisible();
  await expect(
    page.getByText('앞으로 텍스트 / 외국어 사진은 이 방식(요약)으로 처리합니다.'),
  ).toBeVisible();
  expect(await readPreferences(page.request, credential)).toEqual({
    ...DEFAULTS,
    text: 'summarize',
  });

  // The settings page and the home read the stored value again.
  await page.goto('/settings/processing');
  await expect(page.getByText('현재 설정: 요약')).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: '기본 처리 설정' }).getByText('요약', { exact: true }),
  ).toBeVisible();
});

test('keeps the previous result when reprocessing fails', async ({ page, context, baseURL }) => {
  await processPhoto(page, context, baseURL ?? '', [textFirst, textSummary]);
  await page.route('**/process', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  );

  await panel(page).getByRole('radio', { name: '요약', exact: true }).check();
  await remember(page).check();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();

  await expect(panel(page).getByRole('alert')).toHaveText(
    '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 이전 결과는 그대로입니다.',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '텍스트를 추출하고 번역했습니다' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: '번역' })).toContainText('출구 전용');
});

test('keeps the new result when only saving the default fails, and retries only the save', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await processPhoto(page, context, baseURL ?? '', [textFirst, textSummary], {
    preferenceSaveFails: true,
  });

  await panel(page).getByRole('radio', { name: '요약', exact: true }).check();
  await remember(page).check();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();

  await expect(page.getByRole('heading', { level: 1, name: '내용을 요약했습니다' })).toBeVisible();
  await expect(panel(page).getByRole('alert')).toHaveText(
    '결과는 그대로이지만 기본 처리 방식을 저장하지 못했습니다.',
  );
  await expect(panel(page).getByText(/앞으로 .* 사진은 이 방식/)).toHaveCount(0);

  await panel(page).getByRole('button', { name: '기본 처리 방식 다시 저장' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText(
    '결과는 그대로이지만 기본 처리 방식을 저장하지 못했습니다.',
  );
  // Retrying the save does not process the photo again.
  expect(await listJobs(page.request, credential)).toHaveLength(2);
  expect(await readPreferences(page.request, credential)).toEqual(DEFAULTS);
});

test('chooses, checks and reprocesses by keyboard', async ({ page, context, baseURL }) => {
  const credential = await processPhoto(page, context, baseURL ?? '', [textFirst, textSummary]);

  await panel(page).getByRole('radio', { name: '추출 및 번역(현재 적용)' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(panel(page).getByRole('radio', { name: '요약', exact: true })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(remember(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(remember(page)).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(panel(page).getByRole('button', { name: '이 방식으로 다시 처리' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: '내용을 요약했습니다' })).toBeFocused();
  await expect
    .poll(() => readPreferences(page.request, credential))
    .toEqual({ ...DEFAULTS, text: 'summarize' });
});

test('applies a saved default to the next photo, and an unsaved choice to none', async ({
  page,
  context,
  baseURL,
}) => {
  // Typed uploads: the fake API picks the action like Go — the reprocess action, or else the stored preference.
  const textPhoto = {
    imageType: 'text' as const,
    outputs: {
      extract_and_translate: {
        original: 'Exit only',
        translation: { needed: true, text: '출구 전용' },
      },
      extract_text: { original: 'Exit only' },
      summarize: { summary: '출구 안내입니다.' },
    },
  };
  const credential = await signIn(context, baseURL ?? '', 'complete', 'receipt', {
    uploads: [textPhoto],
  });
  const processNewPhoto = async () => {
    await page.goto('/process');
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await page.getByRole('button', { name: '처리하기' }).click();
    await expect(panel(page)).toBeVisible();
  };

  // First photo: the server default. A one-off reprocess does not change the next photo.
  await processNewPhoto();
  await expect(page.getByText('텍스트 / 외국어 · 추출 및 번역')).toBeVisible();
  await panel(page).getByRole('radio', { name: '텍스트만 추출' }).check();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '텍스트를 추출했습니다' }),
  ).toBeVisible();

  await processNewPhoto();
  await expect(page.getByText('텍스트 / 외국어 · 추출 및 번역')).toBeVisible();

  // Saving the reprocessed action as the default applies it to the next new photo.
  await panel(page).getByRole('radio', { name: '요약', exact: true }).check();
  await remember(page).check();
  await panel(page).getByRole('button', { name: '이 방식으로 다시 처리' }).click();
  await expect(
    page.getByText('앞으로 텍스트 / 외국어 사진은 이 방식(요약)으로 처리합니다.'),
  ).toBeVisible();
  expect(await readPreferences(page.request, credential)).toEqual({
    ...DEFAULTS,
    text: 'summarize',
  });

  await processNewPhoto();
  await expect(page.getByRole('heading', { level: 1, name: '내용을 요약했습니다' })).toBeVisible();
  await expect(page.getByText('텍스트 / 외국어 · 요약')).toBeVisible();
});
