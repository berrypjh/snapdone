import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthApiError,
  exchangeResultCode,
  fetchCapabilities,
  fetchSession,
  revokeSession,
  startGoogleOAuth,
} from './api';

const BASE_URL = 'http://localhost:8080';

const session = {
  user: { id: 'user-1' },
  onboardingStep: 'intro',
  expiresAt: '2026-10-01T00:00:00Z',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof AuthApiError ? error.code : error),
  );

beforeEach(() => vi.stubEnv('API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('request errors', () => {
  it('reports network when Go does not answer', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(codeOf(fetchCapabilities())).resolves.toBe('network');
  });

  it('keeps a known server code', async () => {
    stubFetch(() => json({ error: 'invalid_callback' }, 400));

    await expect(
      codeOf(exchangeResultCode({ code: 'c', verifier: 'v', state: 's' })),
    ).resolves.toBe('invalid_callback');
  });

  it('hides unknown server text behind provider_unavailable', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 502 }));

    await expect(codeOf(fetchCapabilities())).resolves.toBe('provider_unavailable');
  });

  it('never lets the fetch cache auth responses', async () => {
    const fetchMock = stubFetch(() => json({ providers: [] }));

    await fetchCapabilities();

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });
});

describe('fetchCapabilities', () => {
  it('keeps only providers this client knows', async () => {
    stubFetch(() => json({ providers: ['kakao', 'google'] }));

    await expect(fetchCapabilities()).resolves.toEqual(['google']);
  });
});

describe('fetchSession', () => {
  it('sends the credential as a Bearer header', async () => {
    const fetchMock = stubFetch(() => json(session));

    await expect(fetchSession('cred')).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/auth/session`, {
      headers: { Authorization: 'Bearer cred' },
      cache: 'no-store',
    });
  });

  it('returns null when Go rejects the credential', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(fetchSession('cred')).resolves.toBeNull();
  });

  it('rejects a body that is not a session', async () => {
    stubFetch(() => json({ user: 'user-1' }));

    await expect(codeOf(fetchSession('cred'))).resolves.toBe('provider_unavailable');
  });
});

describe('revokeSession', () => {
  it('posts to logout with the credential', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

    await revokeSession('cred');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: 'Bearer cred' },
      cache: 'no-store',
    });
  });
});

describe('startGoogleOAuth', () => {
  it('starts a web Google login with the proof', async () => {
    const fetchMock = stubFetch(() =>
      json({ authorizeUrl: 'https://accounts.google.com/o/oauth2' }),
    );

    await expect(startGoogleOAuth({ challenge: 'ch', state: 'st' })).resolves.toBe(
      'https://accounts.google.com/o/oauth2',
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      provider: 'google',
      platform: 'web',
      challenge: 'ch',
      state: 'st',
    });
  });

  it.each(['http://accounts.google.com', 'data:text/html,hi', 'not a url', 42])(
    'refuses a non-https authorize URL %j',
    async (authorizeUrl) => {
      stubFetch(() => json({ authorizeUrl }));

      await expect(codeOf(startGoogleOAuth({ challenge: 'ch', state: 'st' }))).resolves.toBe(
        'provider_unavailable',
      );
    },
  );
});

describe('exchangeResultCode', () => {
  it('returns the session and credential', async () => {
    stubFetch(() => json({ session, credential: 'cred' }));

    await expect(exchangeResultCode({ code: 'c', verifier: 'v', state: 's' })).resolves.toEqual({
      session,
      credential: 'cred',
    });
  });

  it.each([{ session }, { session, credential: '' }, { session: {}, credential: 'cred' }])(
    'rejects an incomplete login body %j',
    async (body) => {
      stubFetch(() => json(body));

      await expect(
        codeOf(exchangeResultCode({ code: 'c', verifier: 'v', state: 's' })),
      ).resolves.toBe('provider_unavailable');
    },
  );
});
