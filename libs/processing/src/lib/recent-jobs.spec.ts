import { describe, expect, it } from 'vitest';

import { kindLabel, parseRecentJobs, type RecentJob, recentState } from './recent-jobs';

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
      { ...completed },
      { jobId: 'job-2', status: 'running', createdAt: '2026-10-06T08:00:00Z', finishedAt: null },
      { jobId: 'job-3', status: 'failed', createdAt: '2026-10-06T07:00:00Z', finishedAt: null },
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
    expect(job).toEqual(completed);
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
