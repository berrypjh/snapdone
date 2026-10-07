import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { homeApi } from './homeApi';

const BASE_URL = 'http://192.168.0.10:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('homeApi.recentJobs', () => {
  it('reads the recent jobs with the bearer credential', async () => {
    const fetchMock = stubFetch(() =>
      json({ jobs: [{ jobId: 'job-1', status: 'failed', createdAt: '2026-10-06T09:00:00Z' }] }),
    );

    await expect(homeApi.recentJobs('c')).resolves.toEqual([
      {
        jobId: 'job-1',
        status: 'failed',
        createdAt: '2026-10-06T09:00:00Z',
        finishedAt: null,
        selection: null,
        outcome: null,
        sourceJobId: null,
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-jobs`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('reads an empty list', async () => {
    stubFetch(() => json({ jobs: [] }));

    await expect(homeApi.recentJobs('c')).resolves.toEqual([]);
  });
});

describe('homeApi.preferences', () => {
  it('reads the saved preferences with the bearer credential', async () => {
    const fetchMock = stubFetch(() => json({ text: 'summarize', receipt: 'record_expense' }));

    await expect(homeApi.preferences('c')).resolves.toEqual({
      text: 'summarize',
      receipt: 'record_expense',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/v1/processing-preferences`);
  });
});

describe.each([
  ['recentJobs', homeApi.recentJobs],
  ['preferences', homeApi.preferences],
] as const)('homeApi.%s', (_name, read) => {
  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(read('c')).resolves.toBeNull();
  });

  it('fails on a server error', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));

    await expect(read('c')).rejects.toThrow('500');
  });

  it('fails on a response outside the contract', async () => {
    stubFetch(() => json({ jobs: 'x', text: 'translate' }));

    await expect(read('c')).rejects.toThrow('형식');
  });
});
