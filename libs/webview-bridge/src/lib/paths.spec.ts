import { describe, expect, it } from 'vitest';

import { isJobDetailPath, jobDetailPath } from './paths';

const ID = '4f1c2a9e-0000-4000-8000-000000000000';

describe('job detail path', () => {
  it('builds and accepts the path of one lowercase uuid job', () => {
    expect(jobDetailPath(ID)).toBe(`/history/${ID}`);
    expect(isJobDetailPath(`/history/${ID}`)).toBe(true);
  });

  it.each([
    '/history',
    '/history/',
    '/history/job-1',
    `/history/${ID.toUpperCase()}`,
    `/history/${ID}/`,
    `/history/${ID}?x=1`,
    `/history/${ID}#top`,
    `/history/${ID}/receipt`,
    `//history/${ID}`,
    `/history/${ID}\n`,
    '/history/../settings/processing',
  ])('refuses %j', (path) => {
    expect(isJobDetailPath(path)).toBe(false);
  });

  it('makes no path for an id outside the rule', () => {
    expect(jobDetailPath('job-1')).toBeNull();
    expect(jobDetailPath(`${ID}/receipt`)).toBeNull();
  });
});
