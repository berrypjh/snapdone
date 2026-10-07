import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { savePreference } from './preferenceApi';

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

describe('savePreference', () => {
  it('saves one image type only and returns what the server stored', async () => {
    const fetchMock = stubFetch(() =>
      json({ text: 'extract_and_translate', receipt: 'summarize' }),
    );

    await expect(savePreference('c', 'receipt', 'summarize')).resolves.toEqual({
      text: 'extract_and_translate',
      receipt: 'summarize',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-preferences/receipt`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"action":"summarize"}');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer c',
      'Content-Type': 'application/json',
    });
  });

  it('is null when the server no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));
    await expect(savePreference('c', 'text', 'summarize')).resolves.toBeNull();
  });

  it('fails on a server error or a body outside the contract', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));
    await expect(savePreference('c', 'text', 'summarize')).rejects.toThrow();
    stubFetch(() => json({ text: 'translate', receipt: 'summarize' }));
    await expect(savePreference('c', 'text', 'summarize')).rejects.toThrow();
  });
});
