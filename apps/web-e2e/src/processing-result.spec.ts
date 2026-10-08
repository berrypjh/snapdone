import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import {
  IN_APP_USER_AGENT,
  type JobResult,
  overflowsSideways,
  processedJob,
  type ReceiptField,
  receiptJob,
  type SeededJob,
  signInWithJobs,
} from './support/fixture';
import { enterMain } from './support/keyboard';

/**
 * The result of one processing job (`/history/{jobId}`) against the fake API. The screen shows only what the
 * server returned for the applied action. Photos are not stored, so this page never shows one.
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

/** A receipt whose total needs a check between two readings and whose payment method was not found. */
const expenseJob = processedJob('receipt', 'record_expense', {
  expense: {
    merchant: field('카페 봄'),
    date: field('2026-10-07'),
    total: field('12000', ['12000', '13000'], false),
    currency: field('KRW'),
    paymentMethod: field(null),
  },
});

const openJob = async (
  page: Page,
  context: BrowserContext,
  baseURL: string,
  job: SeededJob | JobResult,
) => {
  const [jobId] = await signInWithJobs(context, baseURL, [job]);
  await page.goto(`/history/${jobId}`);
};

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const sections = (page: Page) => page.getByRole('heading', { level: 2 });

test.describe('a finished text job', () => {
  for (const tc of [
    {
      action: 'extract_and_translate',
      output: { original: 'Exit only', translation: { needed: true, text: '출구 전용' } },
      title: '텍스트를 추출하고 번역했습니다',
      applied: '추출 및 번역',
      // What the user asked for comes first, the original last.
      sections: ['번역', '원문'],
      texts: ['출구 전용', 'Exit only'],
    },
    {
      action: 'extract_text',
      output: { original: 'Exit only' },
      title: '텍스트를 추출했습니다',
      applied: '텍스트만 추출',
      sections: ['원문'],
      texts: ['Exit only'],
    },
    {
      action: 'summarize',
      output: { summary: '출구 안내입니다.' },
      title: '내용을 요약했습니다',
      applied: '요약',
      sections: ['요약'],
      texts: ['출구 안내입니다.'],
    },
    {
      action: 'extract_and_summarize',
      output: { original: 'Exit only', summary: '출구 안내입니다.' },
      title: '텍스트를 추출하고 요약했습니다',
      applied: '추출 및 요약',
      sections: ['요약', '원문'],
      texts: ['출구 안내입니다.', 'Exit only'],
    },
  ]) {
    test(`shows only the server text of ${tc.action}`, async ({ page, context, baseURL }) => {
      await openJob(page, context, baseURL ?? '', processedJob('text', tc.action, tc.output));

      await expect(heading(page)).toHaveText(tc.title);
      await expect(page.getByText(`텍스트 / 외국어 · ${tc.applied}`)).toBeVisible();
      await expect(sections(page)).toHaveText(tc.sections);
      for (const [index, name] of tc.sections.entries()) {
        await expect(page.getByRole('region', { name })).toContainText(tc.texts[index] ?? '');
      }
      // No photo is stored, so none is shown — not even a placeholder image.
      await expect(page.getByRole('img')).toHaveCount(0);
      await expect(
        page.getByText('사진은 저장하지 않아 이 화면에는 보이지 않습니다.'),
      ).toBeVisible();
    });
  }

  test('folds a long original under the summary and opens it in place', async ({
    page,
    context,
    baseURL,
  }) => {
    const lines = Array.from({ length: 12 }, (_, index) => `메뉴 ${index + 1}`).join('\n');
    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('text', 'extract_and_summarize', {
        original: lines,
        summary: '메뉴 12개입니다.',
      }),
    );

    const original = page.getByRole('region', { name: '원문' });
    const toggle = original.getByRole('button', { name: '원문 전체 보기' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(original.getByRole('button', { name: '원문 접기' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // The summary has nothing to fold.
    await expect(
      page.getByRole('region', { name: '요약' }).getByRole('button', { name: /전체 보기/ }),
    ).toHaveCount(0);
  });

  test('copies one result text with its own button', async ({ page, context, baseURL }) => {
    // The clipboard records what the page wrote, the same way in every browser.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => sessionStorage.setItem('copied', text) },
      });
    });
    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('text', 'extract_and_summarize', {
        original: 'Exit only',
        summary: '출구 안내입니다.',
      }),
    );

    const summary = page.getByRole('region', { name: '요약' });
    await summary.getByRole('button', { name: '요약 복사' }).click();
    await expect(summary.getByRole('status')).toHaveText('복사했습니다');
    expect(await page.evaluate(() => sessionStorage.getItem('copied'))).toBe('출구 안내입니다.');
  });

  test('says the text was already Korean instead of showing a translation', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('text', 'extract_and_translate', {
        original: '출구 전용',
        translation: { needed: false, text: null },
      }),
    );

    await expect(heading(page)).toHaveText('텍스트를 추출했습니다');
    await expect(page.getByText('텍스트 / 외국어 · 추출 및 번역')).toBeVisible();
    await expect(sections(page)).toHaveText(['원문']);
    await expect(page.getByText('이미 한국어로 쓰여 있어 번역하지 않았습니다.')).toBeVisible();
  });

  test('keeps a long unbroken text inside a 320px screen', async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const long = `https://example.com/${'a'.repeat(300)} ${'긴문장'.repeat(80)}`;
    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('text', 'extract_text', { original: long }),
    );

    await expect(page.getByRole('region', { name: '원문' })).toContainText('긴문장');
    expect(await overflowsSideways(page)).toBe(false);
  });
});

test.describe('a finished receipt job', () => {
  test('shows the extracted text and the summary of a receipt', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('receipt', 'extract_text', { original: '카페 봄\n12,000원' }),
    );
    await expect(heading(page)).toHaveText('영수증의 텍스트를 추출했습니다');
    await expect(page.getByText('영수증 · 텍스트만 추출')).toBeVisible();
    await expect(sections(page)).toHaveText(['원문']);

    await openJob(
      page,
      context,
      baseURL ?? '',
      processedJob('receipt', 'summarize', { summary: '카페 봄에서 결제했습니다.' }),
    );
    await expect(heading(page)).toHaveText('영수증 내용을 요약했습니다');
    await expect(sections(page)).toHaveText(['요약']);
    await expect(page.getByRole('region', { name: '요약' })).toContainText(
      '카페 봄에서 결제했습니다.',
    );
  });

  test('shows only the fields the server read, and which ones need a check', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(page, context, baseURL ?? '', expenseJob);

    await expect(heading(page)).toHaveText('지출 정보를 정리했습니다');
    await expect(page.getByText('영수증 · 지출 정보로 정리')).toBeVisible();
    const expense = page.getByRole('region', { name: '지출 정보' });
    await expect(expense.getByRole('term')).toHaveText([
      '가게',
      '날짜',
      '금액',
      '통화',
      '결제 수단',
    ]);
    // The payment method was not found: it says so instead of showing a value.
    await expect(expense.getByRole('definition')).toHaveText([
      '카페 봄',
      '2026. 10. 7.',
      '12,000원(확인 필요)',
      'KRW',
      '사진에서 찾지 못했습니다',
    ]);
    await expect(expense.getByRole('group', { name: '금액 확인' })).toBeVisible();
    await expect(expense.getByRole('group', { name: '결제 수단 확인' })).toBeVisible();
    await expect(expense.getByRole('group')).toHaveCount(2);
  });

  test('confirms one field from a candidate and keeps the others', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(page, context, baseURL ?? '', expenseJob);
    const expense = page.getByRole('region', { name: '지출 정보' });

    await expense
      .getByRole('group', { name: '금액 확인' })
      .getByRole('button', { name: '13,000원' })
      .click();

    await expect(expense.getByRole('definition')).toHaveText([
      '카페 봄',
      '2026. 10. 7.',
      '13,000원',
      'KRW',
      '사진에서 찾지 못했습니다',
    ]);
    await expect(expense.getByRole('group', { name: '금액 확인' })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('금액 값을 확인했습니다.');
    await expect(expense.getByRole('heading', { name: '지출 정보' })).toBeFocused();

    // The server keeps it: a reload shows the confirmed value.
    await page.reload();
    await expect(expense.getByRole('definition').nth(2)).toHaveText('13,000원');
  });

  test('refuses a typed value the server cannot accept, then takes a valid one', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(page, context, baseURL ?? '', expenseJob);
    const total = page.getByRole('group', { name: '금액 확인' });

    await total.getByRole('textbox', { name: '직접 입력' }).fill('12,000원');
    await total.getByRole('button', { name: '입력한 값으로 확인' }).click();
    await expect(total.getByRole('alert')).toHaveText(
      '형식이 맞지 않습니다. 안내한 형식으로 다시 입력해 주세요.',
    );

    const payment = page.getByRole('group', { name: '결제 수단 확인' });
    await payment.getByRole('textbox', { name: '직접 입력' }).fill('신한카드');
    await payment.getByRole('textbox', { name: '직접 입력' }).press('Enter');
    await expect(
      page.getByRole('region', { name: '지출 정보' }).getByRole('definition').nth(4),
    ).toHaveText('신한카드');
    await expect(total).toBeVisible();
  });

  test('reaches the candidates and the typed input by keyboard', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    await openJob(page, context, baseURL ?? '', expenseJob);
    const total = page.getByRole('group', { name: '금액 확인' });
    await expect(total).toBeVisible();

    await enterMain(page, browserName);
    await page.keyboard.press('Tab');
    await expect(total.getByRole('button', { name: '12,000원' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(total.getByRole('button', { name: '13,000원' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(total.getByRole('textbox', { name: '직접 입력' })).toBeFocused();
  });
});

test.describe('a job that is not a finished result', () => {
  test('does not call an unsupported photo processed', async ({ page, context, baseURL }) => {
    await openJob(page, context, baseURL ?? '', {
      result: receiptJob(),
      outcome: { kind: 'unsupported' },
    });
    await expect(heading(page)).toHaveText('처리할 수 없는 사진입니다');
    await expect(page.getByText('글자가 있는 사진이나 영수증 사진을 올려 주세요.')).toBeVisible();
    await expect(sections(page)).toHaveCount(0);
  });

  test('asks for the type of an ambiguous photo without offering a choice it cannot make here', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(page, context, baseURL ?? '', {
      result: receiptJob(),
      outcome: { kind: 'ambiguous', candidates: ['text', 'receipt'] },
    });
    await expect(heading(page)).toHaveText('어떤 사진인지 골라 주세요');
    await expect(
      page.getByText('텍스트 사진인지 영수증 사진인지 정하지 못했습니다.'),
    ).toBeVisible();
    // Choosing reprocesses the same photo, which this page does not hold.
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(
      page.getByText(
        '이 화면에는 사진이 없어 종류를 고를 수 없습니다. 사진을 다시 올려 처리해 주세요.',
      ),
    ).toBeVisible();
  });

  test('says a job is still running or failed', async ({ page, context, baseURL }) => {
    await openJob(page, context, baseURL ?? '', { result: receiptJob(), status: 'running' });
    await expect(heading(page)).toHaveText('사진을 처리하고 있습니다');
    await expect(page.getByRole('status')).toHaveText('사진을 처리하고 있습니다');

    await openJob(page, context, baseURL ?? '', { result: receiptJob(), status: 'failed' });
    await expect(heading(page)).toHaveText('사진을 처리하지 못했습니다');
    await expect(page.getByText('사진을 다시 올려 처리해 주세요.')).toBeVisible();
  });

  test('shows only the found facts of an earlier job without a result', async ({
    page,
    context,
    baseURL,
  }) => {
    await openJob(page, context, baseURL ?? '', receiptJob(['금액', '12,000원']));
    await expect(heading(page)).toHaveText('사진을 확인했습니다');
    await expect(page.getByText('이 기록에는 처리 결과가 없습니다.')).toBeVisible();
    await expect(page.getByRole('definition')).toHaveText(['12,000원']);
  });

  test('says another user’s or an unknown job cannot be found', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInWithJobs(context, baseURL ?? '', []);
    await page.goto('/history/job-unknown');
    await expect(heading(page)).toHaveText('처리 결과');
    await expect(page.getByRole('alert')).toHaveText('처리 기록을 찾을 수 없습니다.');
  });

  test('sends a signed-out browser to the login page, back to this result after it', async ({
    page,
  }) => {
    const jobId = '4f1c2a9e-0000-4000-8000-000000000000';
    await page.goto(`/history/${jobId}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fhistory%2F${jobId}$`));
    // A path outside the job id rule returns to the history instead.
    await page.goto('/history/job-1');
    await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
  });
});

test.describe('inside the app WebView', () => {
  test.use({ userAgent: IN_APP_USER_AGENT });

  test('renders the result without the web shell and tells the app the title', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.addInitScript(() => {
      const messages: string[] = [];
      Object.assign(window, {
        __appMessages: messages,
        ReactNativeWebView: { postMessage: (message: string) => messages.push(message) },
      });
    });
    await openJob(page, context, baseURL ?? '', expenseJob);

    await expect(heading(page)).toHaveText('지출 정보를 정리했습니다');
    await expect(page.getByRole('banner')).toHaveCount(0);
    // The app's native header goes back; the web adds no second way back.
    await expect(page.getByRole('link', { name: '기록', exact: true })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, '__appMessages')))
      .toContainEqual(JSON.stringify({ type: 'ready', title: '처리 결과' }));
  });
});
