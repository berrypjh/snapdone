import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi, AuthApiError } from './api';

const BASE_URL = 'http://192.168.0.10:8080';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const errorCode = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: unknown) => (error instanceof AuthApiError ? error.code : String(error)),
  );

beforeEach(() => vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', BASE_URL));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('capabilities', () => {
  it('keeps only known providers in product order', async () => {
    stubFetch(() => json({ providers: ['kakao', 'email', 'google'] }));

    await expect(authApi.capabilities()).resolves.toEqual(['google', 'kakao']);
  });

  it('narrows a 503 to provider_unavailable', async () => {
    stubFetch(() => json({ error: 'provider_unavailable' }, 503));

    await expect(errorCode(authApi.capabilities())).resolves.toBe('provider_unavailable');
  });

  it('reports network when the request never completes', async () => {
    stubFetch(() => Promise.reject(new TypeError('Network request failed')));

    await expect(errorCode(authApi.capabilities())).resolves.toBe('network');
  });
});

describe('session', () => {
  it('sends the credential as a Bearer header and parses the session', async () => {
    const session = {
      user: { id: 'u1' },
      onboardingStep: 'intro',
      expiresAt: '2026-10-01T00:00:00Z',
    };
    const fetchMock = stubFetch(() => json(session));

    await expect(authApi.session('opaque')).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/auth/session`, {
      headers: { Authorization: 'Bearer opaque' },
    });
  });

  it('returns null when the server rejects the credential', async () => {
    stubFetch(() => json({ error: 'session_expired' }, 401));

    await expect(authApi.session('opaque')).resolves.toBeNull();
  });

  it('rejects an unexpected body instead of trusting it', async () => {
    stubFetch(() => json({ user: { id: 'u1' }, onboardingStep: 'admin', expiresAt: 'x' }));

    await expect(errorCode(authApi.session('opaque'))).resolves.toBe('provider_unavailable');
  });

  it('hides server error text that is not a known code', async () => {
    stubFetch(() => json({ error: 'pq: relation does not exist' }, 500));

    await expect(errorCode(authApi.session('opaque'))).resolves.toBe('provider_unavailable');
  });
});

describe('logout', () => {
  it('posts the credential and accepts 204', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

    await authApi.logout('opaque');
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: 'Bearer opaque' },
    });
  });
});
