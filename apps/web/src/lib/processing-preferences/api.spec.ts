import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchPreferences, savePreference } from './api';

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

describe('fetchPreferences', () => {
  it('reads the saved preferences with the bearer credential', async () => {
    const fetchMock = stubFetch(() =>
      json({ text: 'extract_and_translate', receipt: 'record_expense' }),
    );

    await expect(fetchPreferences('c')).resolves.toEqual({
      text: 'extract_and_translate',
      receipt: 'record_expense',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-preferences`);
    expect(init?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(fetchPreferences('c')).resolves.toBeNull();
  });

  it('fails on a server error', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 500));

    await expect(fetchPreferences('c')).rejects.toThrow('500');
  });

  it('fails on a response outside the contract', async () => {
    stubFetch(() => json({ text: 'translate', receipt: 'record_expense' }));

    await expect(fetchPreferences('c')).rejects.toThrow('형식');
  });
});

describe('savePreference', () => {
  it('puts one image type with only the action in the body', async () => {
    const fetchMock = stubFetch(() => json({ text: 'summarize', receipt: 'record_expense' }));

    await expect(savePreference('c', { imageType: 'text', action: 'summarize' })).resolves.toEqual({
      text: 'summarize',
      receipt: 'record_expense',
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE_URL}/v1/processing-preferences/text`);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer c',
    });
    expect(init?.body).toBe('{"action":"summarize"}');
  });

  it('uses the receipt path for a receipt action', async () => {
    const fetchMock = stubFetch(() => json({ text: 'summarize', receipt: 'extract_text' }));

    await savePreference('c', { imageType: 'receipt', action: 'extract_text' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/v1/processing-preferences/receipt`);
  });

  it('returns null when Go no longer accepts the session', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(
      savePreference('c', { imageType: 'text', action: 'summarize' }),
    ).resolves.toBeNull();
  });

  it.each([
    ['a refused action', () => json({ error: 'invalid_preference' }, 400)],
    ['a server error', () => json({ error: 'provider_unavailable' }, 500)],
    ['an unreachable server', () => Promise.reject(new TypeError('fetch failed'))],
  ])('fails on %s', async (_name, response) => {
    stubFetch(response);

    await expect(savePreference('c', { imageType: 'text', action: 'summarize' })).rejects.toThrow();
  });
});
