import { ProcessingApiError } from '@snapdone/onboarding';
import { describe, expect, it } from 'vitest';

import {
  kindLabel,
  parseJobDetail,
  parseRecentJobs,
  readJobDetail,
  type RecentJob,
  recentState,
} from './recent-jobs';

const completed = {
  jobId: 'job-1',
  status: 'completed',
  createdAt: '2026-10-06T09:00:00Z',
  finishedAt: '2026-10-06T09:00:07Z',
  result: {
    category: 'receipt',
    facts: [{ label: '금액', value: '12,000원' }],
    suggestedAction: 'record_expense',
    confidence: 'high',
  },
};

/** 제품 결과 계약 전에 만든 작업은 outcome · 원래 작업이 없다. */
const legacy = { selection: null, outcome: null, sourceJobId: null };

const outcome = {
  kind: 'processed',
  imageType: 'text',
  appliedAction: 'extract_text',
  output: { original: 'Open daily' },
};

const selection = { imageType: 'text', appliedAction: 'extract_text' };

const withCategory = (category: string): RecentJob => {
  const [job] =
    parseRecentJobs({ jobs: [{ ...completed, result: { ...completed.result, category } }] }) ?? [];
  if (!job) throw new Error(`category ${category} did not parse`);
  return job;
};

describe('parseRecentJobs', () => {
  it('reads completed, running and failed jobs in the server order', () => {
    expect(
      parseRecentJobs({
        jobs: [
          completed,
          { jobId: 'job-2', status: 'running', createdAt: '2026-10-06T08:00:00Z' },
          { jobId: 'job-3', status: 'failed', createdAt: '2026-10-06T07:00:00Z' },
        ],
      }),
    ).toEqual([
      { ...completed, ...legacy },
      {
        jobId: 'job-2',
        status: 'running',
        createdAt: '2026-10-06T08:00:00Z',
        finishedAt: null,
        ...legacy,
      },
      {
        jobId: 'job-3',
        status: 'failed',
        createdAt: '2026-10-06T07:00:00Z',
        finishedAt: null,
        ...legacy,
      },
    ]);
  });

  it('reads an empty list', () => {
    expect(parseRecentJobs({ jobs: [] })).toEqual([]);
  });

  it('keeps only the contract fields', () => {
    const [job] =
      parseRecentJobs({
        jobs: [{ ...completed, origin: 'general', userId: 'user-2', thumbnail: 'x.png' }],
      }) ?? [];
    expect(job).toEqual({ ...completed, ...legacy });
  });

  it('reads the selection, the outcome and the source job of a reprocessed job', () => {
    const value = { ...completed, selection, outcome, sourceJobId: 'job-0' };
    const [job] = parseRecentJobs({ jobs: [value] }) ?? [];
    expect(job).toEqual(value);
  });

  it('reads a selection without an outcome yet', () => {
    const [job] = parseRecentJobs({ jobs: [{ ...completed, selection }] }) ?? [];
    expect(job).toEqual({ ...completed, ...legacy, selection });
  });

  it('reads an unsupported or ambiguous outcome as is', () => {
    for (const value of [{ kind: 'unsupported' }, { kind: 'ambiguous', candidates: ['receipt'] }]) {
      const [job] = parseRecentJobs({ jobs: [{ ...completed, outcome: value }] }) ?? [];
      expect(job?.outcome).toEqual(value);
    }
  });

  it.each([
    ['no jobs field', {}],
    ['jobs not a list', { jobs: {} }],
    ['an error body', { error: 'provider_unavailable' }],
    ['null', null],
    ['a completed job without a result', { jobs: [{ ...completed, result: undefined }] }],
    ['an unknown status', { jobs: [{ ...completed, status: 'queued' }] }],
    ['no createdAt', { jobs: [{ ...completed, createdAt: undefined }] }],
    ['an unreadable createdAt', { jobs: [{ ...completed, createdAt: 'yesterday' }] }],
    ['an unreadable finishedAt', { jobs: [{ ...completed, finishedAt: 7 }] }],
    ['one bad job among good ones', { jobs: [completed, { jobId: '', status: 'failed' }] }],
    [
      'an outcome outside the contract',
      { jobs: [{ ...completed, outcome: { ...outcome, appliedAction: 'record_expense' } }] },
    ],
    ['a null outcome', { jobs: [{ ...completed, outcome: null }] }],
    [
      'an outcome on a running job',
      { jobs: [{ jobId: 'job-2', status: 'running', createdAt: completed.createdAt, outcome }] },
    ],
    ['an empty sourceJobId', { jobs: [{ ...completed, sourceJobId: '' }] }],
    ['a processed outcome without a selection', { jobs: [{ ...completed, outcome }] }],
    [
      'a processed outcome with another action',
      {
        jobs: [{ ...completed, outcome, selection: { ...selection, appliedAction: 'summarize' } }],
      },
    ],
    [
      'an unsupported outcome with a selection',
      { jobs: [{ ...completed, selection, outcome: { kind: 'unsupported' } }] },
    ],
    [
      'a selection of the other type',
      {
        jobs: [
          {
            ...completed,
            selection: { imageType: 'receipt', appliedAction: 'extract_and_translate' },
          },
        ],
      },
    ],
  ])('rejects %s', (_name, value) => {
    expect(parseRecentJobs(value)).toBeNull();
  });
});

describe('recentState', () => {
  it('is empty without general jobs and active with one or more', () => {
    expect(recentState({ ok: true, value: [] })).toBe('empty');
    expect(recentState({ ok: true, value: [withCategory('receipt')] })).toBe('active');
  });

  it('does not guess empty when the jobs could not be read', () => {
    expect(recentState({ ok: false })).toBe('unknown');
  });
});

describe('kindLabel', () => {
  it('names only the image types the product handles', () => {
    expect(kindLabel(withCategory('receipt'))).toBe('영수증');
    expect(kindLabel(withCategory('foreign_text'))).toBe('텍스트 / 외국어');
  });

  it.each(['place', 'event', 'shopping', 'work', 'other'])(
    'leaves the older %s category unnamed',
    (category) => {
      expect(kindLabel(withCategory(category))).toBeNull();
    },
  );

  it('names nothing before a result exists', () => {
    const [running] =
      parseRecentJobs({
        jobs: [{ jobId: 'job-2', status: 'running', createdAt: completed.createdAt }],
      }) ?? [];
    expect(running && kindLabel(running)).toBeNull();
  });
});

describe('parseJobDetail', () => {
  const { createdAt: _created, finishedAt: _finished, ...single } = completed;

  it('reads a single job with its selection and outcome, without timestamps', () => {
    const value = { ...single, selection, outcome };
    expect(parseJobDetail(value)).toEqual({ ...value, sourceJobId: null });
  });

  it('reads a legacy or onboarding job without an outcome', () => {
    expect(parseJobDetail(single)).toEqual({ ...single, ...legacy });
    expect(parseJobDetail({ jobId: 'job-2', status: 'running' })).toEqual({
      jobId: 'job-2',
      status: 'running',
      ...legacy,
    });
  });

  it.each([
    ['an outcome outside the contract', { ...single, selection, outcome: { kind: 'done' } }],
    ['a processed outcome without a selection', { ...single, outcome }],
    ['an error body', { error: 'job_not_found' }],
  ])('rejects %s', (_name, value) => {
    expect(parseJobDetail(value)).toBeNull();
  });
});

describe('readJobDetail', () => {
  const ok = { ok: true, status: 200 };

  it('reads the job, and is null once the session is refused', () => {
    expect(readJobDetail(ok, { jobId: 'job-1', status: 'running' })).toEqual({
      jobId: 'job-1',
      status: 'running',
      ...legacy,
    });
    expect(readJobDetail({ ok: false, status: 401 }, { error: 'session_expired' })).toBeNull();
  });

  it('throws the server code, or unknown for a body outside the contract', () => {
    expect(() => readJobDetail({ ok: false, status: 409 }, { error: 'image_mismatch' })).toThrow(
      new ProcessingApiError('image_mismatch'),
    );
    expect(() => readJobDetail({ ok: false, status: 502 }, null)).toThrow(
      new ProcessingApiError('unknown'),
    );
    expect(() => readJobDetail(ok, { jobId: 'job-1', status: 'queued' })).toThrow(
      new ProcessingApiError('unknown'),
    );
  });
});

describe('the Go wire contract', () => {
  // The exact body apps/api/internal/httpserver/processing_test.go TestProcessingJobsOutcome pins for
  // GET /v1/processing-jobs. Change both together.
  const at = '"createdAt":"2026-10-07T09:00:00Z","finishedAt":"2026-10-07T09:00:00Z"';
  const goBody =
    '{"jobs":[' +
    `{"jobId":"job-3","status":"completed",${at},` +
    '"result":{"category":"foreign_text","facts":[],"suggestedAction":"translate","confidence":"high"},' +
    '"selection":{"imageType":"text","appliedAction":"extract_and_translate"},' +
    '"outcome":{"kind":"processed","imageType":"text","appliedAction":"extract_and_translate","output":{"original":"Open daily","translation":{"needed":true,"text":"매일 영업"}}},' +
    '"sourceJobId":"job-1"},' +
    `{"jobId":"job-2","status":"completed",${at},` +
    '"result":{"category":"other","facts":[],"suggestedAction":"none","confidence":"low"},' +
    '"outcome":{"kind":"ambiguous","candidates":["text","receipt"]}},' +
    `{"jobId":"job-1","status":"completed",${at},` +
    '"result":{"category":"receipt","facts":[],"suggestedAction":"record_expense","confidence":"medium"},' +
    '"selection":{"imageType":"receipt","appliedAction":"record_expense"},' +
    '"outcome":{"kind":"processed","imageType":"receipt","appliedAction":"record_expense","output":{"expense":{' +
    '"merchant":{"value":"카페 봄","candidates":[],"resolved":true},' +
    '"date":{"value":null,"candidates":[],"resolved":false},' +
    '"total":{"value":"12000","candidates":["12000","13000"],"resolved":false},' +
    '"currency":{"value":"KRW","candidates":[],"resolved":true},' +
    '"paymentMethod":{"value":null,"candidates":[],"resolved":false}}}}}]}';

  it('reads every job the Go API sends, with its selection, outcome and source', () => {
    const jobs = parseRecentJobs(JSON.parse(goBody));
    expect(
      jobs?.map(({ jobId, selection, outcome, sourceJobId }) => ({
        jobId,
        selection: selection?.appliedAction ?? null,
        outcome: outcome?.kind ?? null,
        sourceJobId,
      })),
    ).toEqual([
      {
        jobId: 'job-3',
        selection: 'extract_and_translate',
        outcome: 'processed',
        sourceJobId: 'job-1',
      },
      { jobId: 'job-2', selection: null, outcome: 'ambiguous', sourceJobId: null },
      { jobId: 'job-1', selection: 'record_expense', outcome: 'processed', sourceJobId: null },
    ]);
  });
});
