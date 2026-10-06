import { expect, type Page, test } from '@playwright/test';

import { linkTabKey, overflowsSideways, signIn } from './support/fixture';
import { enterMain } from './support/keyboard';

/**
 * The per-image-type default processing page against the fake API, which keeps the preferences
 * per user like Go. Each area saves only its own image type.
 */

const PATH = '/settings/processing';
const TITLE = '사진 종류별 기본 처리';

test.use({ viewport: { width: 390, height: 844 } });

/** One area: its form (named by the legend) and the radio group inside it. */
const area = (page: Page, legend: '텍스트 / 외국어' | '영수증') => {
  const form = page.getByRole('form', { name: legend });
  return {
    form,
    /** Radio names start with the label and go on with the description. */
    option: (label: string) =>
      form
        .getByRole('group', { name: legend })
        .getByRole('radio', { name: new RegExp(`^${label}`) }),
    save: form.getByRole('button', { name: '저장' }),
    status: form.getByRole('status'),
    alert: form.getByRole('alert'),
    current: (label: string) => form.getByText(`현재 설정: ${label}`, { exact: true }),
  };
};

test('shows the server defaults with the recommended choices named in text', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '');
  await page.goto(PATH);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  await expect(page.getByText('사진을 올렸을 때 기본으로 무엇을 할지 선택하세요.')).toBeVisible();

  const text = area(page, '텍스트 / 외국어');
  await expect(text.option('추출 및 번역')).toBeChecked();
  await expect(text.current('추출 및 번역')).toBeVisible();
  await expect(text.form.getByText('추천', { exact: true })).toBeVisible();
  await expect(text.save).toBeDisabled();

  const receipt = area(page, '영수증');
  await expect(receipt.option('지출 정보로 정리')).toBeChecked();
  await expect(receipt.current('지출 정보로 정리')).toBeVisible();
  await expect(receipt.form.getByText('추천', { exact: true })).toBeVisible();
});

test('saves each image type on its own and keeps both after a reload', async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? '');
  await page.goto(PATH);
  const text = area(page, '텍스트 / 외국어');
  const receipt = area(page, '영수증');

  await text.option('요약').check();
  // Choosing is not saving: the current setting stays until the server confirms.
  await expect(text.current('추출 및 번역')).toBeVisible();
  await expect(text.status).toHaveText('');
  await text.save.click();
  await expect(text.status).toHaveText('저장했습니다.');
  await expect(text.current('요약')).toBeVisible();

  await page.reload();
  await expect(text.option('요약')).toBeChecked();
  await expect(receipt.option('지출 정보로 정리')).toBeChecked();

  await receipt.option('텍스트만 추출').check();
  await receipt.save.click();
  await expect(receipt.status).toHaveText('저장했습니다.');

  await page.reload();
  await expect(text.option('요약')).toBeChecked();
  await expect(receipt.option('텍스트만 추출')).toBeChecked();
});

test("keeps another user's preferences apart", async ({ page, context, baseURL, browser }) => {
  await signIn(context, baseURL ?? '');
  await page.goto(PATH);
  const text = area(page, '텍스트 / 외국어');
  await text.option('추출 및 요약').check();
  await text.save.click();
  await expect(text.status).toHaveText('저장했습니다.');

  const other = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  await signIn(other, baseURL ?? '');
  const otherPage = await other.newPage();
  await otherPage.goto(PATH);
  await expect(area(otherPage, '텍스트 / 외국어').option('추출 및 번역')).toBeChecked();
  await expect(area(otherPage, '영수증').option('지출 정보로 정리')).toBeChecked();
  await other.close();
});

test('does not report a failed save as saved', async ({ page, context, baseURL }) => {
  await signIn(context, baseURL ?? '', 'complete', 'receipt', { preferenceSaveFails: true });
  await page.goto(PATH);
  const text = area(page, '텍스트 / 외국어');

  await text.option('텍스트만 추출').check();
  await text.save.click();

  await expect(text.alert).toHaveText('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  await expect(text.status).toHaveText('');
  await expect(text.current('추출 및 번역')).toBeVisible();
  await expect(text.save).toBeEnabled();

  await page.reload();
  await expect(text.option('추출 및 번역')).toBeChecked();
});

test('chooses and saves with the keyboard alone', async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  await signIn(context, baseURL ?? '');
  await page.goto(PATH);
  const tab = linkTabKey(browserName);
  const text = area(page, '텍스트 / 외국어');

  await enterMain(page, browserName);
  await page.keyboard.press(tab);
  await expect(text.option('추출 및 번역')).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(text.option('텍스트만 추출')).toBeChecked();
  await page.keyboard.press(tab);
  await expect(text.save).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(text.status).toHaveText('저장했습니다.');
  await expect(text.current('텍스트만 추출')).toBeVisible();
});

test('does not scroll sideways at 320px', async ({ page, context, baseURL }) => {
  await signIn(context, baseURL ?? '');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(PATH);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  expect(await overflowsSideways(page)).toBe(false);
});

test('sends a signed-out visitor to login with this page as the return path', async ({ page }) => {
  await page.goto(PATH);

  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprocessing$/);
});
