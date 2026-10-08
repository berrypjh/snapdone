import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { progressApi } from './progressApi';

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

describe('complete', () => {
  it('posts to the completion endpoint with the bearer credential and no body', async () => {
    const fetchMock = stubFetch(() => json({ step: 'complete' }));

    await expect(progressApi.complete('c')).resolves.toEqual({ step: 'complete' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/onboarding/complete`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
    expect(init?.body).toBeUndefined();
  });

  it('returns null when the server no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(progressApi.complete('c')).resolves.toBeNull();
  });

  it.each([{ step: 'first-image' }, { step: 'purpose' }, { error: 'provider_unavailable' }])(
    'rejects a response that is not a finished onboarding: %j',
    async (body) => {
      stubFetch(() => json(body));

      await expect(progressApi.complete('c')).rejects.toThrow();
    },
  );

  it('fails when the onboarding is not at the first photo yet', async () => {
    stubFetch(() => json({ error: 'onboarding_out_of_order' }, 409));

    await expect(progressApi.complete('c')).rejects.toThrow();
  });
});

describe('find and save', () => {
  it('keep their path and method', async () => {
    const fetchMock = stubFetch(() => json({ step: 'first-image' }));

    await progressApi.find('c');
    await progressApi.save('c', { step: 'first-image' });
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`${BASE_URL}/v1/onboarding`, undefined],
      [`${BASE_URL}/v1/onboarding`, 'PUT'],
    ]);
  });
});
