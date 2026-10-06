import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchRecentJobs } from './api';

const BASE_URL = 'http://localhost:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.stubEnv('API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchRecentJobs', () => {
  it('reads the recent jobs with the bearer credential', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobs: [{ jobId: 'job-1', status: 'running', createdAt: '2026-10-06T09:00:00Z' }] }),
    );

    await expect(fetchRecentJobs('c')).resolves.toEqual([
      { jobId: 'job-1', status: 'running', createdAt: '2026-10-06T09:00:00Z', finishedAt: null },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(fetchRecentJobs('c')).resolves.toBeNull();
  });

  it('fails on a server error', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));

    await expect(fetchRecentJobs('c')).rejects.toThrow('500');
  });

  it('fails on a response outside the contract', async () => {
    stubFetch(() => json({ jobs: [{ jobId: 'job-1' }] }));

    await expect(fetchRecentJobs('c')).rejects.toThrow('형식');
  });
});
