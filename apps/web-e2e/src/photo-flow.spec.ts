import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import {
  IN_APP_USER_AGENT,
  isHydrated,
  linkTabKey,
  listJobs,
  overflowsSideways,
  PHOTO,
  processedJob,
  type ReceiptField,
  receiptJob,
  revokeSession,
  signIn,
  type UserOptions,
} from './support/fixture';
import { enterMain } from './support/keyboard';

/**
 * Adding one photo from the home and processing it (`/process`) against the fake API, which keeps each
 * user's uploads like Go: a new job is running, then finishes on its first lookup.
 */

test.use({ viewport: { width: 390, height: 844 } });

const CHOOSE_TITLE = '처리할 사진을 골라 주세요';
const PREVIEW_TITLE = '사진을 처리할까요?';
const DROP_HINT = '사진을 이곳에 끌어다 놓아도 됩니다.';

const field = (
  value: string | null,
  candidates: string[] = [],
  resolved = value !== null,
): ReceiptField => ({
  value,
  candidates,
  resolved,
});

const textJob = processedJob('text', 'extract_text', { original: 'Exit only' });

/** Signs a complete user in with these upload results and opens the photo flow. */
const openFlow = async (
  page: Page,
  context: BrowserContext,
  baseURL: string,
  options: UserOptions = {},
) => {
  const credential = await signIn(context, baseURL, 'complete', 'receipt', options);
  await page.goto('/process');
  await expect(page.getByRole('heading', { level: 1, name: CHOOSE_TITLE })).toBeVisible();
  // The picker buttons and the file input only work once React has hydrated the page.
  await expect.poll(() => isHydrated(page)).toBe(true);
  return credential;
};

/** The file input is the one non-role locator: the browser's file chooser has no accessible name. */
const pick = (page: Page, files: Parameters<Page['setInputFiles']>[1]) =>
  page.locator('input[type="file"]').setInputFiles(files);

const preview = async (page: Page) => {
  await pick(page, PHOTO);
  await expect(page.getByRole('heading', { level: 1, name: PREVIEW_TITLE })).toBeFocused();
};

const process = (page: Page) => page.getByRole('button', { name: '처리하기' }).click();

/** Drops these files on the drop area the way a browser would. */
const drop = async (page: Page, names: string[]) => {
  const dataTransfer = await page.evaluateHandle(
    ({ names: fileNames, base64 }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      for (const name of fileNames)
        transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      return transfer;
    },
    { names, base64: PHOTO.buffer.toString('base64') },
  );
  await page.getByText(DROP_HINT).dispatchEvent('drop', { dataTransfer });
};

test('opens the photo flow from the home', async ({ page, context, baseURL }) => {
  await signIn(context, baseURL ?? '');
  await page.goto('/');
  await page.getByRole('link', { name: '사진 추가하기' }).click();

  await expect(page).toHaveURL(/\/process$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(CHOOSE_TITLE);
  await expect(page.getByRole('button', { name: '사진 선택' })).toBeVisible();
  // At phone width the way back is the header's arrow, titled with this screen.
  const header = page.getByRole('banner');
  await expect(header).toContainText('사진 처리');
  await expect(header.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
});

test('previews one chosen photo without guessing its type or action', async ({
  page,
  context,
  baseURL,
}) => {
  await openFlow(page, context, baseURL ?? '');
  await preview(page);

  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  await expect(
    page.getByText('사진 속 내용을 확인하고 설정한 방식에 맞게 처리해드려요.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '처리하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '다른 사진 선택' })).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/영수증|텍스트 \/ 외국어|추출|요약/);
});

test('swaps the photo and frees the previous one', async ({ page, context, baseURL }) => {
  await openFlow(page, context, baseURL ?? '');
  await preview(page);
  const image = page.getByRole('img', { name: '선택한 사진' });
  const first = await image.getAttribute('src');

  await pick(page, { ...PHOTO, name: 'other.png' });
  await expect(image).not.toHaveAttribute('src', first ?? '');
  const firstStillLoads = await page.evaluate(
    (url) =>
      fetch(url ?? '').then(
        () => true,
        () => false,
      ),
    first,
  );
  expect(firstStillLoads).toBe(false);
});

test('treats a cancelled picker as nothing chosen', async ({ page, context, baseURL }) => {
  await openFlow(page, context, baseURL ?? '');
  await pick(page, []);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(CHOOSE_TITLE);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('takes one dropped photo and refuses several', async ({ page, context, baseURL }) => {
  await openFlow(page, context, baseURL ?? '');
  await drop(page, ['a.png', 'b.png']);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '사진은 한 장만 올릴 수 있습니다. 한 장을 골라 주세요.',
  );

  await drop(page, ['photo.png']);
  await expect(page.getByRole('heading', { level: 1, name: PREVIEW_TITLE })).toBeVisible();
});

test('refuses another format or a photo over 7.5MB before uploading, keeping the current photo', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await openFlow(page, context, baseURL ?? '');
  await pick(page, { name: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') });
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'JPEG · PNG · GIF · WebP 사진만 올릴 수 있습니다.',
  );

  await preview(page);
  await pick(page, { ...PHOTO, buffer: Buffer.alloc(7_500_001) });
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '7.5MB보다 큰 사진은 올릴 수 없습니다. 다른 사진을 골라 주세요.',
  );
  await expect(page.getByRole('heading', { level: 1, name: PREVIEW_TITLE })).toBeVisible();
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  expect(await listJobs(page.request, credential)).toHaveLength(0);
});

test('processes a text photo once and shows the server result with the photo', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await openFlow(page, context, baseURL ?? '', { uploads: [textJob] });
  await preview(page);
  await process(page);

  const heading = page.getByRole('heading', { level: 1, name: '텍스트를 추출했습니다' });
  await expect(heading).toBeFocused();
  await expect(page.getByText('텍스트 / 외국어 · 텍스트만 추출')).toBeVisible();
  await expect(page.getByRole('region', { name: '원문' })).toContainText('Exit only');
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  // One upload, even with the development double effect.
  expect(await listJobs(page.request, credential)).toHaveLength(1);

  // The processed photo is kept, so the result leads on to the home and the history.
  const next = page.getByRole('navigation', { name: '다음으로 갈 곳' });
  await expect(next.getByRole('link', { name: '홈으로' })).toHaveAttribute('href', '/');
  await next.getByRole('link', { name: '처리 기록 보기' }).click();
  await expect(page).toHaveURL(/\/history$/);
});

test('processes a receipt and confirms a field on the result', async ({
  page,
  context,
  baseURL,
}) => {
  await openFlow(page, context, baseURL ?? '', {
    uploads: [
      processedJob('receipt', 'record_expense', {
        expense: {
          merchant: field('카페 봄'),
          date: field(null),
          total: field('12000', ['12000', '13000'], false),
          currency: field('KRW'),
          paymentMethod: field('신한카드'),
        },
      }),
    ],
  });
  await preview(page);
  await process(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('지출 정보를 정리했습니다');
  await page
    .getByRole('group', { name: '금액 확인' })
    .getByRole('button', { name: '13,000원' })
    .click();
  await expect(
    page.getByRole('region', { name: '지출 정보' }).getByRole('definition').nth(2),
  ).toHaveText('13,000원');
});

test('says an unsupported photo cannot be processed and offers another one', async ({
  page,
  context,
  baseURL,
}) => {
  await openFlow(page, context, baseURL ?? '', {
    uploads: [{ result: receiptJob(), outcome: { kind: 'unsupported' } }],
  });
  await preview(page);
  await process(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('처리할 수 없는 사진입니다');
  await page.getByRole('button', { name: '다른 사진 처리' }).click();
  await pick(page, PHOTO);
  await expect(page.getByRole('heading', { level: 1, name: PREVIEW_TITLE })).toBeVisible();
});

test('continues an ambiguous photo with the chosen type without picking it again', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await openFlow(page, context, baseURL ?? '', {
    uploads: [
      { result: receiptJob(), outcome: { kind: 'ambiguous', candidates: ['text', 'receipt'] } },
      processedJob('receipt', 'summarize', { summary: '카페 봄에서 결제했습니다.' }),
    ],
  });
  await preview(page);
  await process(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('어떤 사진인지 골라 주세요');
  await page.getByRole('button', { name: '영수증 사진으로 처리' }).click();

  const heading = page.getByRole('heading', { level: 1, name: '영수증 내용을 요약했습니다' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  const [reprocess, source] = await listJobs(page.request, credential);
  expect(reprocess?.sourceJobId).toBe(source?.jobId);
});

test('keeps the photo after a failed upload and retries it', async ({ page, context, baseURL }) => {
  await openFlow(page, context, baseURL ?? '', {
    uploads: [textJob],
    uploadError: { status: 500, error: 'provider_unavailable' },
  });
  await preview(page);
  await process(page);

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '사진을 처리하지 못했습니다. 다시 시도하거나 다른 사진을 선택해 주세요.',
  );
  await expect(page.getByRole('img', { name: '선택한 사진' })).toBeVisible();
  // A failed job is not still working: the processing motion stops.
  await expect(page.getByTestId('processing-indicator')).toHaveCount(0);
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('텍스트를 추출했습니다');
});

test('offers only another photo when the server refuses the format', async ({
  page,
  context,
  baseURL,
}) => {
  await openFlow(page, context, baseURL ?? '', {
    uploadError: { status: 415, error: 'unsupported_image' },
  });
  await preview(page);
  await process(page);

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '이 사진 형식은 처리할 수 없습니다. 다른 사진을 선택해 주세요.',
  );
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다른 사진 선택' })).toBeVisible();
});

test('retries after the connection drops', async ({ page, context, baseURL }) => {
  await openFlow(page, context, baseURL ?? '', { uploads: [textJob] });
  await preview(page);
  let dropped = false;
  await page.route('**/process', async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  await process(page);

  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  );
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('텍스트를 추출했습니다');
});

test('sends an expired session to login with the photo flow as the return path', async ({
  page,
  context,
  baseURL,
}) => {
  const credential = await openFlow(page, context, baseURL ?? '', { uploads: [textJob] });
  await preview(page);
  await revokeSession(page.request, credential);
  await process(page);

  await expect(page).toHaveURL(/\/login\?next=%2Fprocess$/);
});

test('runs the whole flow by keyboard', async ({ page, context, baseURL, browserName }) => {
  const tab = linkTabKey(browserName);
  await openFlow(page, context, baseURL ?? '', { uploads: [textJob] });
  await enterMain(page, browserName);
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: '사진 선택' })).toBeFocused();

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(PHOTO);
  await expect(page.getByRole('heading', { level: 1, name: PREVIEW_TITLE })).toBeFocused();

  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: '처리하기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: '텍스트를 추출했습니다' }),
  ).toBeFocused();
});

test('has no sideways scroll at 320px on any step', async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openFlow(page, context, baseURL ?? '', {
    uploads: [
      processedJob('text', 'extract_text', {
        original: `${'긴문장'.repeat(80)} ${'a'.repeat(200)}`,
      }),
    ],
  });
  expect(await overflowsSideways(page)).toBe(false);
  await preview(page);
  expect(await overflowsSideways(page)).toBe(false);
  await process(page);
  await expect(page.getByRole('region', { name: '원문' })).toBeVisible();
  expect(await overflowsSideways(page)).toBe(false);
});

test.describe('inside the app WebView', () => {
  test.use({ userAgent: IN_APP_USER_AGENT });

  test('does not offer the browser file picker in place of the app camera', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? '');
    await page.goto('/process');

    await expect(page.getByText('앱에서는 홈의 사진 추가하기로 사진을 올려 주세요.')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '사진 선택' })).toHaveCount(0);
  });
});
