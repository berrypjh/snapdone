import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  origin: null as string | null,
  cookies: new Map<string, string>(),
  set: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(request.origin ? { origin: request.origin } : {}),
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: request.set,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`REDIRECT ${location}`);
  },
}));

const { logout, startGoogleLogin } = await import('./actions');
const { requireSession, requireSignedIn } = await import('./session');

const ORIGIN = 'http://localhost:3000';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?x=1';

const stubFetch = (response: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const loginForm = (next: string) => {
  const form = new FormData();
  form.set('next', next);
  return form;
};

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://localhost:8080');
  vi.stubEnv('WEB_ORIGIN', ORIGIN);
  request.origin = ORIGIN;
  request.cookies.clear();
  request.set.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('startGoogleLogin', () => {
  it('stores the proof in a short HttpOnly cookie and redirects to Google', async () => {
    const fetchMock = stubFetch(() => Response.json({ authorizeUrl: AUTHORIZE_URL }));

    await expect(startGoogleLogin({ error: null }, loginForm('/history'))).rejects.toThrow(
      `REDIRECT ${AUTHORIZE_URL}`,
    );

    const [name, value, options] = request.set.mock.calls[0] ?? [];
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(name).toBe('snapdone-preauth-dev');
    expect(value).toMatch(new RegExp(`^${sent.state}\\.[A-Za-z0-9_-]{43}\\.%2Fhistory$`));
    expect(value).not.toContain(sent.challenge);
    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  });

  it('does not keep a return path outside the allowlist', async () => {
    stubFetch(() => Response.json({ authorizeUrl: AUTHORIZE_URL }));

    await expect(startGoogleLogin({ error: null }, loginForm('//evil.example'))).rejects.toThrow();

    expect(request.set.mock.calls[0]?.[1]).toMatch(/\.%2F$/);
  });

  it('returns only an error code when Go refuses', async () => {
    stubFetch(() => Response.json({ error: 'provider_unavailable' }, { status: 400 }));

    await expect(startGoogleLogin({ error: null }, loginForm('/'))).resolves.toEqual({
      error: 'provider_unavailable',
    });
    expect(request.set).not.toHaveBeenCalled();
  });

  it.each([null, 'https://evil.example'])(
    'refuses origin %j without calling Go',
    async (origin) => {
      request.origin = origin;
      const fetchMock = stubFetch(() => Response.json({ authorizeUrl: AUTHORIZE_URL }));

      await expect(startGoogleLogin({ error: null }, loginForm('/'))).resolves.toEqual({
        error: 'provider_unavailable',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('refuses sign-up in production without legal documents', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'https://snapdone.example');
    request.origin = 'https://snapdone.example';
    const fetchMock = stubFetch(() => Response.json({ authorizeUrl: AUTHORIZE_URL }));

    await expect(startGoogleLogin({ error: null }, loginForm('/'))).resolves.toEqual({
      error: 'provider_unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  it('revokes the session in Go and expires the cookie', async () => {
    request.cookies.set('snapdone-session-dev', 'cred');
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

    await expect(logout()).rejects.toThrow('REDIRECT /login');

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer cred' });
    expect(request.set).toHaveBeenCalledWith('snapdone-session-dev', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });

  it('still clears the cookie when Go is unreachable', async () => {
    request.cookies.set('snapdone-session-dev', 'cred');
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(logout()).rejects.toThrow('REDIRECT /login');
    expect(request.set).toHaveBeenCalledOnce();
  });

  it('ignores a request from another origin', async () => {
    request.origin = 'https://evil.example';
    request.cookies.set('snapdone-session-dev', 'cred');
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }));

    await expect(logout()).rejects.toThrow(/origin/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(request.set).not.toHaveBeenCalled();
  });
});

describe('requireSession', () => {
  it('sends a visitor without a cookie to login with the return path', async () => {
    const fetchMock = stubFetch(() => Response.json({}));

    await expect(requireSession('/history')).rejects.toThrow('REDIRECT /login?next=%2Fhistory');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a visitor with a rejected cookie to login', async () => {
    request.cookies.set('snapdone-session-dev', 'stale');
    stubFetch(() => Response.json({ error: 'session_expired' }, { status: 401 }));

    await expect(requireSession('/history')).rejects.toThrow('REDIRECT /login?next=%2Fhistory');
  });

  const sessionAt = (onboardingStep: string) => ({
    user: { id: 'u' },
    onboardingStep,
    expiresAt: '2026-10-01T00:00:00Z',
  });

  it('returns the session Go accepts for a user who finished onboarding', async () => {
    request.cookies.set('snapdone-session-dev', 'cred');
    stubFetch(() => Response.json(sessionAt('complete')));

    await expect(requireSession('/history')).resolves.toEqual(sessionAt('complete'));
  });

  it('sends a user who has not finished onboarding to /onboarding', async () => {
    request.cookies.set('snapdone-session-dev', 'cred');
    stubFetch(() => Response.json(sessionAt('intro')));

    await expect(requireSession('/history')).rejects.toThrow('REDIRECT /onboarding');
    await expect(requireSignedIn('/onboarding')).resolves.toEqual(sessionAt('intro'));
  });

  it('does not treat a failed session lookup as a new user', async () => {
    request.cookies.set('snapdone-session-dev', 'cred');
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(requireSession('/history')).rejects.toMatchObject({ code: 'network' });
  });
});
