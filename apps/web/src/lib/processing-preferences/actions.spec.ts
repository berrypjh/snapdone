import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  origin: null as string | null,
  credential: null as string | null,
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(request.origin ? { origin: request.origin } : {}),
  cookies: async () => ({
    get: (name: string) =>
      name === 'snapdone-session-dev' && request.credential !== null
        ? { name, value: request.credential }
        : undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`REDIRECT ${location}`);
  },
}));

const { saveProcessingPreference } = await import('./actions');

const ORIGIN = 'http://localhost:3000';
const BASE_URL = 'http://localhost:8080';

/** "METHOD path"마다 응답을 준다. 없는 요청은 실패시킨다. */
const stubApi = (routes: Record<string, () => Response | Promise<Response>>) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url.slice(BASE_URL.length)}`];
    if (!route) throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const save = (fields: Record<string, string>) => saveProcessingPreference(null, form(fields));

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', BASE_URL);
  vi.stubEnv('WEB_ORIGIN', ORIGIN);
  request.origin = ORIGIN;
  request.credential = 'c';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('saveProcessingPreference', () => {
  it('saves one image type and returns what the server saved', async () => {
    const fetchMock = stubApi({
      'PUT /v1/processing-preferences/receipt': () =>
        json({ text: 'extract_and_translate', receipt: 'summarize' }),
    });

    await expect(save({ imageType: 'receipt', action: 'summarize' })).resolves.toEqual({
      type: 'saved',
      preferences: { text: 'extract_and_translate', receipt: 'summarize' },
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"action":"summarize"}');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer c' });
  });

  it('refuses a request from another origin before calling Go', async () => {
    request.origin = 'https://evil.example';
    const fetchMock = stubApi({});

    await expect(save({ imageType: 'text', action: 'summarize' })).rejects.toThrow(
      '허용되지 않은 origin',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports signed out without a session cookie, without calling Go', async () => {
    request.credential = null;
    const fetchMock = stubApi({});

    await expect(save({ imageType: 'text', action: 'summarize' })).resolves.toEqual({
      type: 'signed-out',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports signed out when Go no longer accepts the session', async () => {
    stubApi({
      'PUT /v1/processing-preferences/text': () => json({ error: 'session_expired' }, 401),
    });

    await expect(save({ imageType: 'text', action: 'summarize' })).resolves.toEqual({
      type: 'signed-out',
    });
  });

  it.each([
    [{ imageType: 'receipt', action: 'extract_and_summarize' }],
    [{ imageType: 'foreign_text', action: 'summarize' }],
    [{ imageType: 'text' }],
  ])('returns an error for %j without calling Go', async (fields) => {
    const fetchMock = stubApi({});

    await expect(save(fields)).resolves.toEqual({ type: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused action', () => json({ error: 'invalid_preference' }, 400)],
    ['a server error', () => json({ error: 'provider_unavailable' }, 500)],
    ['an unreadable response', () => json({ text: 'summarize' })],
    ['an unreachable server', () => Promise.reject(new TypeError('fetch failed'))],
  ])('returns an error to retry on %s', async (_name, response) => {
    stubApi({ 'PUT /v1/processing-preferences/text': response });

    await expect(save({ imageType: 'text', action: 'summarize' })).resolves.toEqual({
      type: 'error',
    });
  });
});
