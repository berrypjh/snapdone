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

const { completeOnboarding } = await import('./actions');

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

describe('completeOnboarding', () => {
  it('finishes onboarding and goes home', async () => {
    const fetchMock = stubApi({
      'POST /v1/onboarding/complete': () => json({ step: 'complete' }),
    });

    await expect(completeOnboarding()).rejects.toThrow(/^REDIRECT \/$/);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer c' });
  });

  it('goes to login without a session cookie, without calling Go', async () => {
    request.credential = null;
    const fetchMock = stubApi({});

    await expect(completeOnboarding()).rejects.toThrow('REDIRECT /login?next=%2Fonboarding');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes to login when Go no longer accepts the session', async () => {
    stubApi({ 'POST /v1/onboarding/complete': () => json({ error: 'session_expired' }, 401) });

    await expect(completeOnboarding()).rejects.toThrow('REDIRECT /login?next=%2Fonboarding');
  });

  it('follows the saved step when the onboarding is not at the first photo', async () => {
    stubApi({
      'POST /v1/onboarding/complete': () => json({ error: 'onboarding_out_of_order' }, 409),
      'GET /v1/onboarding': () => json({ step: 'intro' }),
    });

    await expect(completeOnboarding()).rejects.toThrow(/^REDIRECT \/onboarding$/);
  });

  it.each([
    ['a server error', () => json({ error: 'provider_unavailable' }, 500)],
    ['an unreadable response', () => json({ step: 'first-image' })],
    ['an unreachable server', () => Promise.reject(new TypeError('fetch failed'))],
  ])('returns an error to retry on %s', async (_name, response) => {
    stubApi({ 'POST /v1/onboarding/complete': response });

    await expect(completeOnboarding()).resolves.toEqual({ type: 'error' });
  });

  it('returns an error when the saved step cannot be read after a conflict', async () => {
    stubApi({
      'POST /v1/onboarding/complete': () => json({ error: 'onboarding_out_of_order' }, 409),
      'GET /v1/onboarding': () => json({ error: 'provider_unavailable' }, 500),
    });

    await expect(completeOnboarding()).resolves.toEqual({ type: 'error' });
  });

  it('refuses a request from another origin before calling Go', async () => {
    request.origin = 'https://evil.example';
    const fetchMock = stubApi({});

    await expect(completeOnboarding()).rejects.toThrow('허용되지 않은 origin');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
