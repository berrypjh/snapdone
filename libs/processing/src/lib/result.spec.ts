import { describe, expect, it } from 'vitest';

import type { ProcessedOutcome, ProcessingOutcome, ProcessingSelection } from './outcome';
import type { JobDetail } from './recent-jobs';
import { isProcessed, needsReview, preferenceToSave, presentJob, type TextBlock } from './result';

const result = {
  category: 'receipt' as const,
  facts: [{ label: '금액', value: '12,000원' }],
  suggestedAction: 'record_expense' as const,
  confidence: 'medium' as const,
};

const field = (value: string | null, candidates: string[] = [], resolved = value !== null) => ({
  value,
  candidates,
  resolved,
});

const expense = {
  merchant: field('카페 봄'),
  date: field('2026-10-07'),
  total: field('12000', ['12000', '13000'], false),
  currency: field('KRW'),
  paymentMethod: field(null),
};

const selectionOf = (outcome: ProcessedOutcome): ProcessingSelection =>
  outcome.imageType === 'text'
    ? { imageType: 'text', appliedAction: outcome.appliedAction }
    : { imageType: 'receipt', appliedAction: outcome.appliedAction };

/** 완료된 작업. 처리를 마쳤으면 selection은 outcome과 같은 유형 · 처리 방식이다. */
const processed = (outcome: ProcessingOutcome | null): JobDetail => ({
  jobId: 'job-1',
  status: 'completed',
  result,
  selection: outcome?.kind === 'processed' ? selectionOf(outcome) : null,
  outcome,
  sourceJobId: null,
});

/** 처리 방식마다 서버 결과와, 화면에 보일 글. */
const TEXT_CASES: { outcome: ProcessedOutcome; texts: TextBlock[] }[] = [
  {
    outcome: {
      kind: 'processed',
      imageType: 'text',
      appliedAction: 'extract_and_translate',
      output: { original: 'Exit only', translation: { needed: true, text: '출구 전용' } },
    },
    texts: [
      { kind: 'original', text: 'Exit only' },
      { kind: 'translation', text: '출구 전용' },
    ],
  },
  {
    outcome: {
      kind: 'processed',
      imageType: 'text',
      appliedAction: 'extract_text',
      output: { original: 'Exit only' },
    },
    texts: [{ kind: 'original', text: 'Exit only' }],
  },
  {
    outcome: {
      kind: 'processed',
      imageType: 'text',
      appliedAction: 'summarize',
      output: { summary: '출구 안내' },
    },
    texts: [{ kind: 'summary', text: '출구 안내' }],
  },
  {
    outcome: {
      kind: 'processed',
      imageType: 'text',
      appliedAction: 'extract_and_summarize',
      output: { original: 'Exit only', summary: '출구 안내' },
    },
    texts: [
      { kind: 'original', text: 'Exit only' },
      { kind: 'summary', text: '출구 안내' },
    ],
  },
  {
    outcome: {
      kind: 'processed',
      imageType: 'receipt',
      appliedAction: 'extract_text',
      output: { original: '카페 봄' },
    },
    texts: [{ kind: 'original', text: '카페 봄' }],
  },
  {
    outcome: {
      kind: 'processed',
      imageType: 'receipt',
      appliedAction: 'summarize',
      output: { summary: '카페 봄 결제' },
    },
    texts: [{ kind: 'summary', text: '카페 봄 결제' }],
  },
];

describe('presentJob', () => {
  it.each(TEXT_CASES)(
    'shows only the server text of $outcome.imageType $outcome.appliedAction',
    ({ outcome, texts }) => {
      expect(presentJob(processed(outcome))).toEqual({
        kind: 'processed',
        applied: selectionOf(outcome),
        texts,
        translationSkipped: false,
        expense: null,
      });
    },
  );

  it('says the translation was skipped instead of making one', () => {
    const screen = presentJob(
      processed({
        kind: 'processed',
        imageType: 'text',
        appliedAction: 'extract_and_translate',
        output: { original: '출구 전용', translation: { needed: false, text: null } },
      }),
    );
    expect(screen).toMatchObject({
      translationSkipped: true,
      texts: [{ kind: 'original', text: '출구 전용' }],
    });
  });

  it('shows the expense fields with their state, formatting only what the server sent', () => {
    const screen = presentJob(
      processed({
        kind: 'processed',
        imageType: 'receipt',
        appliedAction: 'record_expense',
        output: { expense },
      }),
    );
    expect(screen).toMatchObject({ kind: 'processed', texts: [] });
    expect(screen.kind === 'processed' && screen.expense).toEqual([
      { name: 'merchant', state: 'resolved', value: '카페 봄', candidates: [] },
      { name: 'date', state: 'resolved', value: '2026. 10. 7.', candidates: [] },
      {
        name: 'total',
        state: 'uncertain',
        value: '12,000원',
        candidates: [
          { value: '12000', label: '12,000원' },
          { value: '13000', label: '13,000원' },
        ],
      },
      { name: 'currency', state: 'resolved', value: 'KRW', candidates: [] },
      { name: 'paymentMethod', state: 'unresolved', value: null, candidates: [] },
    ]);
    expect(needsReview(screen)).toBe(true);
  });

  it('adds no currency to the amount while the currency is not resolved', () => {
    const screen = presentJob(
      processed({
        kind: 'processed',
        imageType: 'receipt',
        appliedAction: 'record_expense',
        output: {
          expense: { ...expense, total: field('12000'), currency: field('KRW', ['KRW'], false) },
        },
      }),
    );
    const total = screen.kind === 'processed' ? screen.expense?.[2] : undefined;
    expect(total).toMatchObject({ value: '12,000', state: 'resolved' });
  });

  it('needs no review once every field is resolved', () => {
    const resolved = { ...expense, total: field('12000'), paymentMethod: field('신한카드') };
    const screen = presentJob(
      processed({
        kind: 'processed',
        imageType: 'receipt',
        appliedAction: 'record_expense',
        output: { expense: resolved },
      }),
    );
    expect(needsReview(screen)).toBe(false);
  });

  it('keeps unsupported, ambiguous, running and failed apart from a finished result', () => {
    expect(presentJob(processed({ kind: 'unsupported' }))).toEqual({ kind: 'unsupported' });
    expect(presentJob(processed({ kind: 'ambiguous', candidates: ['text', 'receipt'] }))).toEqual({
      kind: 'ambiguous',
      candidates: ['text', 'receipt'],
    });
    const base = { jobId: 'job-1', selection: null, outcome: null, sourceJobId: null };
    expect(presentJob({ ...base, status: 'running' })).toEqual({ kind: 'running' });
    expect(presentJob({ ...base, status: 'failed' })).toEqual({ kind: 'failed' });
  });

  it('shows only the found facts of an earlier job without a result', () => {
    expect(presentJob(processed(null))).toEqual({
      kind: 'without-outcome',
      facts: [{ label: '금액', value: '12,000원' }],
    });
  });
});

describe('preferenceToSave', () => {
  const summarized = processed({
    kind: 'processed',
    imageType: 'receipt',
    appliedAction: 'summarize',
    output: { summary: '카페 봄 결제' },
  });

  it('saves nothing unless the user chose to remember the action', () => {
    expect(preferenceToSave(false, summarized)).toBeNull();
  });

  it('saves the type and action the server applied, only that type', () => {
    expect(preferenceToSave(true, summarized)).toEqual({
      imageType: 'receipt',
      appliedAction: 'summarize',
    });
  });

  it('saves nothing when the new job did not finish processing', () => {
    const unsupported = processed({ kind: 'unsupported' });
    const running: JobDetail = {
      jobId: 'job-2',
      status: 'running',
      selection: null,
      outcome: null,
      sourceJobId: 'job-1',
    };
    for (const job of [unsupported, running]) {
      expect(isProcessed(job)).toBe(false);
      expect(preferenceToSave(true, job)).toBeNull();
    }
  });
});
