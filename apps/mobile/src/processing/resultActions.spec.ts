import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resultActions } from './resultActions';

const BASE_URL = 'http://192.168.0.10:8080';
const image = { uri: 'file:///cache/photo.jpg' };

const controller = {
  authorized: async <T>(request: (credential: string) => Promise<T | null>) => request('c'),
};

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('resultActions', () => {
  it('reprocesses with the chosen action and never calls the preference API', async () => {
    const fetchMock = stubFetch({ jobId: 'job-2', status: 'running', sourceJobId: 'job-1' }, 202);

    await resultActions(controller).portFor('job-1', 'summarize').start(image);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BASE_URL}/v1/processing-jobs`]);
  });

  it('saves the default of the applied image type only, as its own request', async () => {
    const fetchMock = stubFetch({ text: 'summarize', receipt: 'record_expense' });

    await resultActions(controller).savePreference({
      imageType: 'text',
      appliedAction: 'summarize',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-preferences/text`);
    expect(init?.method).toBe('PUT');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('confirms one receipt field', async () => {
    const fetchMock = stubFetch({ jobId: 'job-1', status: 'running' });

    await resultActions(controller).confirm('job-1', 'total', '13000');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE_URL}/v1/processing-jobs/job-1/receipt-fields/total`,
    );
  });
});
