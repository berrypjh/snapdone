import { NextRequest, NextResponse } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { completeLogin, handleOAuthCallback } from './callback';
import { encodePreauth } from './cookies';

const STATE = 's'.repeat(43);
const VERIFIER = 'v'.repeat(43);
const NOW = Date.parse('2026-09-18T00:00:00Z');
const preauth = { state: STATE, verifier: VERIFIER, returnTo: '/history' };
const session = {
  user: { id: 'user-1' },
  onboardingStep: 'intro',
  expiresAt: '2026-09-18T12:00:00Z',
};

const query = (params: string) => new URLSearchParams(params);

const stubExchange = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://localhost:8080');
  vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('completeLogin', () => {
  it('does not exchange without a preauth cookie', async () => {
    const fetchMock = stubExchange({});

    await expect(completeLogin(query(`code=c&state=${STATE}`), null, NOW)).resolves.toEqual({
      type: 'rejected',
      location: '/login?next=%2F&error=invalid_callback',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    `code=c&state=${'x'.repeat(43)}`,
    'code=c',
    `code=c&state=${STATE}&state=${STATE}`,
    `code=c&code=d&state=${STATE}`,
    `code=c&error=cancelled&state=${STATE}`,
    `state=${STATE}`,
  ])('rejects %s without exchanging', async (params) => {
    const fetchMock = stubExchange({});

    await expect(completeLogin(query(params), preauth, NOW)).resolves.toEqual({
      type: 'rejected',
      location: '/login?next=%2Fhistory&error=invalid_callback',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns quietly to login when the user cancelled', async () => {
    await expect(
      completeLogin(query(`error=cancelled&state=${STATE}`), preauth, NOW),
    ).resolves.toEqual({
      type: 'rejected',
      location: '/login?next=%2Fhistory',
    });
  });

  it.each([
    ['provider_unavailable', 'provider_unavailable'],
    ['invalid_callback', 'invalid_callback'],
    ['something_new', 'provider_unavailable'],
  ])('shows %s from Go as %s', async (error, shown) => {
    await expect(
      completeLogin(query(`error=${error}&state=${STATE}`), preauth, NOW),
    ).resolves.toEqual({
      type: 'rejected',
      location: `/login?next=%2Fhistory&error=${shown}`,
    });
  });

  it('exchanges the code with the stored verifier and state', async () => {
    const fetchMock = stubExchange({ session, credential: 'cred' });

    await expect(completeLogin(query(`code=c&state=${STATE}`), preauth, NOW)).resolves.toEqual({
      type: 'signed-in',
      location: '/history',
      credential: 'cred',
      maxAge: 12 * 60 * 60,
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      code: 'c',
      verifier: VERIFIER,
      state: STATE,
    });
  });

  it('reports a failed exchange', async () => {
    stubExchange({ error: 'invalid_callback' }, 400);

    await expect(completeLogin(query(`code=c&state=${STATE}`), preauth, NOW)).resolves.toEqual({
      type: 'rejected',
      location: '/login?next=%2Fhistory&error=invalid_callback',
    });
  });

  it('does not keep a session that already expired', async () => {
    stubExchange({
      session: { ...session, expiresAt: '2026-09-17T00:00:00Z' },
      credential: 'cred',
    });

    await expect(
      completeLogin(query(`code=c&state=${STATE}`), preauth, NOW),
    ).resolves.toMatchObject({
      type: 'rejected',
    });
  });

  it('never returns to a page outside the allowlist', async () => {
    stubExchange({
      session: { ...session, expiresAt: '2099-01-01T00:00:00Z' },
      credential: 'cred',
    });

    await expect(
      completeLogin(
        query(`code=c&state=${STATE}`),
        { ...preauth, returnTo: '//evil.example' },
        NOW,
      ),
    ).resolves.toMatchObject({ type: 'signed-in', location: '/' });
  });
});

describe('handleOAuthCallback', () => {
  const callbackRequest = (params: string, cookie?: string) =>
    new NextRequest(`http://localhost:3000/auth/callback?${params}`, {
      headers: cookie ? { cookie } : {},
    });

  /** Next가 preauth cookie를 쓴 뒤 브라우저가 돌려보내는 Cookie 헤더. */
  const preauthCookie = (() => {
    const written = NextResponse.next();
    written.cookies.set('snapdone-preauth-dev', encodePreauth(preauth));
    return written.headers.get('set-cookie')?.split(';')[0] ?? '';
  })();

  it('sets the session cookie and drops the code from the URL', async () => {
    stubExchange({
      session: { ...session, expiresAt: '2099-01-01T00:00:00Z' },
      credential: 'cred',
    });

    const response = await handleOAuthCallback(
      callbackRequest(`code=c&state=${STATE}`, preauthCookie),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/history');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');

    const sessionCookie = response.cookies.get('snapdone-session-dev');
    expect(sessionCookie).toMatchObject({
      value: 'cred',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(sessionCookie?.maxAge).toBeGreaterThan(0);
    expect(response.cookies.get('snapdone-preauth-dev')).toMatchObject({ value: '', maxAge: 0 });
  });

  it('sets no session when the preauth cookie is missing', async () => {
    const fetchMock = stubExchange({});

    const response = await handleOAuthCallback(callbackRequest(`code=c&state=${STATE}`));

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2F&error=invalid_callback',
    );
    expect(response.cookies.get('snapdone-session-dev')).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
