import { describe, expect, it } from 'vitest';

import type { ProcessingOutcome, ProcessingSelection } from './outcome';
import type { RecentJob } from './recent-jobs';
import { needsCheck, summarizeJob } from './summary';

const result = {
  category: 'receipt' as const,
  facts: [{ label: '금액', value: '12,000원' }],
  suggestedAction: 'record_expense' as const,
  confidence: 'high' as const,
};

const at = {
  createdAt: '2026-10-07T09:00:00Z',
  finishedAt: '2026-10-07T09:00:07Z',
  sourceJobId: null,
};

const job = (
  selection: ProcessingSelection | null,
  outcome: ProcessingOutcome | null,
): RecentJob => ({
  jobId: 'job-1',
  status: 'completed',
  result,
  selection,
  outcome,
  ...at,
});

const field = (value: string | null, candidates: string[] = [], resolved = value !== null) => ({
  value,
  candidates,
  resolved,
});

describe('summarizeJob', () => {
  it('names the applied type and action and shows the summary first', () => {
    expect(
      summarizeJob(
        job(
          { imageType: 'text', appliedAction: 'extract_and_summarize' },
          {
            kind: 'processed',
            imageType: 'text',
            appliedAction: 'extract_and_summarize',
            output: { original: 'Exit only', summary: '출구 안내' },
          },
        ),
      ),
    ).toEqual({
      headline: '텍스트 / 외국어 · 추출 및 요약',
      status: '처리 완료',
      preview: '출구 안내',
      facts: [],
      needsCheck: false,
      done: true,
    });
  });

  it('shows the readable expense values and flags a receipt that needs a check', () => {
    const receipt = job(
      { imageType: 'receipt', appliedAction: 'record_expense' },
      {
        kind: 'processed',
        imageType: 'receipt',
        appliedAction: 'record_expense',
        output: {
          expense: {
            merchant: field('카페 봄'),
            date: field(null),
            total: field('12000', ['12000', '13000'], false),
            currency: field('KRW'),
            paymentMethod: field(null),
          },
        },
      },
    );
    expect(summarizeJob(receipt)).toMatchObject({
      headline: '영수증 · 지출 정보로 정리',
      preview: '카페 봄 · 12,000원',
      needsCheck: true,
    });
    expect(needsCheck(receipt)).toBe(true);
  });

  it('does not call an unsupported or ambiguous photo processed', () => {
    expect(summarizeJob(job(null, { kind: 'unsupported' }))).toMatchObject({
      headline: '지원하지 않는 사진',
      status: '처리하지 않음',
      needsCheck: false,
    });
    expect(
      summarizeJob(job(null, { kind: 'ambiguous', candidates: ['text', 'receipt'] })),
    ).toMatchObject({ headline: '유형을 정하지 못한 사진', status: '처리하지 않음' });
  });

  it('keeps the found facts of an earlier job without a result', () => {
    expect(summarizeJob(job(null, null))).toEqual({
      headline: '영수증',
      status: '처리 완료',
      preview: null,
      facts: result.facts,
      needsCheck: false,
      done: true,
    });
  });

  it('says a job is running or failed without a headline it cannot know', () => {
    const base = { jobId: 'job-2', selection: null, outcome: null, ...at, finishedAt: null };
    expect(summarizeJob({ ...base, status: 'running' })).toMatchObject({
      headline: null,
      status: '처리 중',
      done: false,
    });
    expect(summarizeJob({ ...base, status: 'failed' })).toMatchObject({
      headline: null,
      status: '처리하지 못함',
      done: false,
    });
  });
});
