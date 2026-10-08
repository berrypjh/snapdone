import type { RecentJob } from '@snapdone/processing';
import { describe, expect, it } from 'vitest';

import { groupByDay } from './days';

const job = (jobId: string, createdAt: string): RecentJob => ({
  jobId,
  status: 'failed',
  createdAt,
  finishedAt: null,
  selection: null,
  outcome: null,
  sourceJobId: null,
});

describe('groupByDay', () => {
  it('groups by the Korean day in the server order, naming today and yesterday', () => {
    // 2026-10-08 10:00 in Korea.
    const now = new Date('2026-10-08T01:00:00Z');
    const jobs = [
      job('a', '2026-10-08T00:30:00Z'),
      job('b', '2026-10-07T16:00:00Z'), // 10. 8. 01:00 in Korea, still today
      job('c', '2026-10-07T14:00:00Z'), // 10. 7. 23:00 in Korea
      job('d', '2026-10-05T03:00:00Z'),
    ];

    expect(
      groupByDay(jobs, now).map(({ label, jobs }) => [label, jobs.map((j) => j.jobId)]),
    ).toEqual([
      ['오늘', ['a', 'b']],
      ['어제', ['c']],
      ['2026. 10. 5.', ['d']],
    ]);
  });

  it('has no group without jobs', () => {
    expect(groupByDay([], new Date())).toEqual([]);
  });
});
