import { NextRequest, NextResponse } from 'next/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { completeHandoff, handleHandoff, handleHandoffStart, handoffChallenge } from './handoff';
import { challengeS256 } from './proof';

const ORIGIN = 'http://localhost:3000';
const VERIFIER = 'v'.repeat(43);
const NOW = Date.parse('2026-09-18T00:00:00Z');
const session = {
  user: { id: 'user-1' },
  onboardingStep: 'complete',
  expiresAt: '2099-01-01T00:00:00Z',
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
  vi.stubEnv('WEB_ORIGIN', ORIGIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('handleHandoffStart', () => {
  it('keeps the verifier in a short HttpOnly cookie and sends only the path onward', () => {
    const response = handleHandoffStart(
      new NextRequest(`${ORIGIN}/auth/handoff/start?next=%2Fhistory`),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/auth/handoff/ready?next=%2Fhistory`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    const cookie = response.cookies.get('snapdone-handoff-dev');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 120 });
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get('location')).not.toContain(cookie?.value ?? '');
  });

  it('replaces a path outside the allowlist with home', () => {
    const response = handleHandoffStart(
      new NextRequest(`${ORIGIN}/auth/handoff/start?next=%2F%2Fevil.example`),
    );

    expect(response.headers.get('location')).toBe(`${ORIGIN}/auth/handoff/ready?next=%2F`);
  });
});

describe('handoffChallenge', () => {
  it('derives the S256 challenge and never returns the verifier', () => {
    expect(handoffChallenge(VERIFIER)).toBe(challengeS256(VERIFIER));
    expect(handoffChallenge(undefined)).toBeNull();
    expect(handoffChallenge('short')).toBeNull();
  });
});

describe('completeHandoff', () => {
  it.each([
    ['code=c&next=%2Fhistory', null],
    ['next=%2Fhistory', VERIFIER],
    ['code=c&code=d&next=%2Fhistory', VERIFIER],
    ['code=c&next=%2Fsettings', VERIFIER],
    ['code=c&next=%2F%2Fevil.example', VERIFIER],
    ['code=c&next=%2Fhistory&next=%2F', VERIFIER],
  ])('rejects %s without exchanging', async (params, verifier) => {
    const fetchMock = stubExchange({});

    await expect(completeHandoff(query(params), verifier, NOW)).resolves.toMatchObject({
      type: 'rejected',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the code with this browser verifier and returns to next', async () => {
    const fetchMock = stubExchange({ session, credential: 'child' });

    await expect(
      completeHandoff(query('code=c&next=%2Fhistory'), VERIFIER, NOW),
    ).resolves.toMatchObject({ type: 'signed-in', location: '/history', credential: 'child' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/v1/auth/handoff/exchange');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      code: 'c',
      verifier: VERIFIER,
      next: '/history',
    });
  });

  it('sends a refused exchange to login, where the app is asked to hand off again', async () => {
    stubExchange({ error: 'invalid_callback' }, 400);

    await expect(completeHandoff(query('code=c&next=%2Fhistory'), VERIFIER, NOW)).resolves.toEqual({
      type: 'rejected',
      location: '/login?next=%2Fhistory&error=invalid_callback',
    });
  });
});

describe('handleHandoff', () => {
  const handoffCookie = (() => {
    const written = NextResponse.next();
    written.cookies.set('snapdone-handoff-dev', VERIFIER);
    return written.headers.get('set-cookie')?.split(';')[0] ?? '';
  })();

  const request = (params: string, cookie: string) =>
    new NextRequest(`${ORIGIN}/auth/handoff?${params}`, { headers: { cookie } });

  it('replaces the previous session cookie and drops the code from the URL', async () => {
    stubExchange({ session, credential: 'user-b-child' });

    const response = await handleHandoff(
      request('code=c&next=%2Fhistory', `${handoffCookie}; snapdone-session-dev=user-a-child`),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/history`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.cookies.get('snapdone-session-dev')?.value).toBe('user-b-child');
    expect(response.cookies.get('snapdone-handoff-dev')).toMatchObject({ value: '', maxAge: 0 });
  });

  it('sets no session without the verifier cookie (another browser opened the link)', async () => {
    const fetchMock = stubExchange({ session, credential: 'x' });

    const response = await handleHandoff(request('code=c&next=%2Fhistory', ''));

    expect(response.cookies.get('snapdone-session-dev')).toBeUndefined();
    expect(response.cookies.get('snapdone-handoff-dev')).toMatchObject({ maxAge: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
