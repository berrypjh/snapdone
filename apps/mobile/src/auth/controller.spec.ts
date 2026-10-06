import type { AuthProvider, Session } from '@snapdone/auth-contracts';
import { describe, expect, it, vi } from 'vitest';

import { type AuthApi, AuthApiError } from './api';
import { type AuthControllerDeps, createAuthController, type SignInResult } from './controller';
import { destinationFor } from './model';
import type { AuthStorage, CredentialRead } from './storage';

const session: Session = {
  user: { id: 'user-1' },
  onboardingStep: 'intro',
  expiresAt: '2026-10-01T00:00:00Z',
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const fakeApi = (overrides: Partial<AuthApi> = {}): AuthApi => ({
  capabilities: vi.fn(async (): Promise<AuthProvider[]> => ['google']),
  session: vi.fn(async () => session),
  logout: vi.fn(async () => undefined),
  oauthStart: vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth'),
  oauthCancel: vi.fn(async () => undefined),
  exchange: vi.fn(async () => ({ session, credential: 'opaque' })),
  handoffStart: vi.fn(async (): Promise<string | null> => 'handoff-code'),
  ...overrides,
});

const fakeStorage = (
  read: CredentialRead = { status: 'empty' },
  overrides: Partial<AuthStorage> = {},
) => ({
  readCredential: vi.fn(async () => read),
  saveCredential: vi.fn(async (_credential: string) => undefined),
  deleteCredential: vi.fn(async () => undefined),
  saveProof: vi.fn(async () => undefined),
  takeProof: vi.fn(async () => null),
  ...overrides,
});

const setup = async (overrides: Partial<AuthControllerDeps> = {}) => {
  let id = 0;
  const deps: AuthControllerDeps = {
    api: fakeApi(),
    storage: fakeStorage(),
    signIn: {},
    signUpAllowed: true,
    newRequestId: () => `r${(id += 1)}`,
    ...overrides,
  };
  const controller = createAuthController(deps);
  await controller.start();
  return { controller, deps };
};

const authenticated = (credential = 'opaque'): SignInResult => ({
  type: 'authenticated',
  session,
  credential,
});

describe('restore', () => {
  it('becomes anonymous with no stored credential', async () => {
    const { controller } = await setup();

    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 0 });
  });

  it('restores a stored credential the server still accepts', async () => {
    const { controller } = await setup({
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 0,
      session,
    });
  });

  it('deletes a credential the server rejected and signs out', async () => {
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const { controller } = await setup({
      storage,
      api: fakeApi({ session: vi.fn(async () => null) }),
    });

    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });

  it('treats an unreadable secure store as a retryable failure, not as signed out', async () => {
    const { controller } = await setup({ storage: fakeStorage({ status: 'unavailable' }) });

    expect(controller.getSnapshot().auth).toEqual({
      status: 'restore-failed',
      generation: 0,
      error: 'storage_unavailable',
    });
  });

  it('keeps the credential when the server cannot be reached', async () => {
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const api = fakeApi({ session: vi.fn(() => Promise.reject(new AuthApiError('network'))) });
    const { controller } = await setup({ storage, api });

    expect(storage.deleteCredential).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toMatchObject({
      status: 'restore-failed',
      error: 'network',
    });
  });

  it('does not treat an unreadable profile (unknown onboarding step) as a new user', async () => {
    const api = fakeApi({
      session: vi.fn(() => Promise.reject(new AuthApiError('provider_unavailable'))),
    });
    const { controller } = await setup({
      api,
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    expect(controller.getSnapshot().auth).toMatchObject({ status: 'restore-failed' });
  });

  it('retries a failed restore with the kept credential', async () => {
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockRejectedValueOnce(new AuthApiError('network'))
      .mockResolvedValueOnce(session);
    const { controller } = await setup({
      api: fakeApi({ session: session$ }),
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    await controller.retryRestore();

    expect(session$).toHaveBeenLastCalledWith('c');
    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 0,
      session,
    });
  });

  it('restores nothing on retry when not in a failed restore', async () => {
    const storage = fakeStorage();
    const { controller } = await setup({ storage });

    await controller.retryRestore();

    expect(storage.readCredential).toHaveBeenCalledTimes(1);
  });
});

describe('revalidate (foreground)', () => {
  const signedIn = (api: AuthApi, storage = fakeStorage({ status: 'found', credential: 'c' })) =>
    setup({ api, storage }).then((result) => ({ ...result, storage }));

  it('keeps a session the server still accepts', async () => {
    const { controller } = await signedIn(fakeApi());

    await controller.revalidate();

    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('deletes the credential and shows session expired on 401', async () => {
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce(session)
      .mockResolvedValue(null);
    const { controller, storage } = await signedIn(fakeApi({ session: session$ }));

    await controller.revalidate();

    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toEqual({
      status: 'recoverable-error',
      generation: 1,
      error: 'session_expired',
    });
  });

  it('stays signed in while offline', async () => {
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce(session)
      .mockRejectedValue(new AuthApiError('network'));
    const { controller, storage } = await signedIn(fakeApi({ session: session$ }));

    await controller.revalidate();

    expect(storage.deleteCredential).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('shares one request between overlapping foreground events', async () => {
    const pending = deferred<Session | null>();
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce(session)
      .mockReturnValue(pending.promise);
    const { controller } = await signedIn(fakeApi({ session: session$ }));

    const first = controller.revalidate();
    const second = controller.revalidate();
    pending.resolve(session);
    await Promise.all([first, second]);

    expect(session$).toHaveBeenCalledTimes(2);
  });

  it('drops a late 401 that arrives after logout and a new sign-in', async () => {
    const pending = deferred<Session | null>();
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce(session)
      .mockReturnValueOnce(pending.promise);
    const storage = fakeStorage({ status: 'found', credential: 'a' });
    const { controller } = await setup({
      api: fakeApi({ session: session$ }),
      storage,
      signIn: { google: vi.fn(async () => authenticated('b')) },
    });

    const late = controller.revalidate();
    await vi.waitFor(() => expect(session$).toHaveBeenCalledTimes(2));
    await controller.logout();
    await controller.signIn('google');
    vi.mocked(storage.deleteCredential).mockClear();
    pending.resolve(null);
    await late;

    expect(storage.deleteCredential).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toMatchObject({ status: 'authenticated', generation: 1 });
  });

  it('does nothing when signed out', async () => {
    const api = fakeApi();
    const { controller } = await setup({ api });

    await controller.revalidate();

    expect(api.session).not.toHaveBeenCalled();
  });
});

describe('refreshSession', () => {
  const finished: Session = { ...session, onboardingStep: 'complete' };

  /** 복원 때 session, 그다음부터 answers를 차례로 돌려주는 로그인 상태. */
  const signedIn = (
    answers: AuthApi['session'][],
    storage = fakeStorage({ status: 'found', credential: 'c' }),
  ) => {
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce({ ...session, onboardingStep: 'first-image' });
    answers.forEach((answer) => session$.mockImplementationOnce(answer));
    return setup({ api: fakeApi({ session: session$ }), storage }).then((result) => ({
      ...result,
      storage,
      session$,
    }));
  };

  it('puts the session the server returns into the snapshot, which sends a finished user home', async () => {
    const { controller } = await signedIn([async () => finished]);

    await expect(controller.refreshSession()).resolves.toEqual(finished);

    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 0,
      session: finished,
    });
    expect(destinationFor(controller.getSnapshot().auth)).toBe('home');
  });

  it('throws on network without deleting the credential or leaving the session', async () => {
    const { controller, storage } = await signedIn([
      () => Promise.reject(new AuthApiError('network')),
    ]);

    await expect(controller.refreshSession()).rejects.toThrow();

    expect(storage.deleteCredential).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toMatchObject({
      status: 'authenticated',
      session: { onboardingStep: 'first-image' },
    });
  });

  it('expires the session on 401 the same way as other requests', async () => {
    const { controller, storage } = await signedIn([async () => null]);

    await expect(controller.refreshSession()).resolves.toBeNull();

    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toEqual({
      status: 'recoverable-error',
      generation: 1,
      error: 'session_expired',
    });
  });

  it('drops a late refresh that arrives after logout', async () => {
    const pending = deferred<Session | null>();
    const { controller } = await signedIn([() => pending.promise]);

    const late = controller.refreshSession();
    await controller.logout();
    pending.resolve(finished);
    await late;

    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 1 });
  });

  it('drops a late refresh that arrives after logout and a new sign-in', async () => {
    const pending = deferred<Session | null>();
    const session$ = vi
      .fn<AuthApi['session']>()
      .mockResolvedValueOnce(session)
      .mockReturnValueOnce(pending.promise);
    const { controller } = await setup({
      api: fakeApi({ session: session$ }),
      storage: fakeStorage({ status: 'found', credential: 'a' }),
      signIn: { google: vi.fn(async () => authenticated('b')) },
    });

    const late = controller.refreshSession();
    await vi.waitFor(() => expect(session$).toHaveBeenCalledTimes(2));
    await controller.logout();
    await controller.signIn('google');
    pending.resolve(finished);
    await late;

    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 1,
      session,
    });
  });

  it('waits for a foreground check in flight so its older answer cannot overwrite the refresh', async () => {
    const older = deferred<Session | null>();
    const { controller, session$ } = await signedIn([() => older.promise, async () => finished]);

    const foreground = controller.revalidate();
    const refresh = controller.refreshSession();
    await vi.waitFor(() => expect(session$).toHaveBeenCalledTimes(2));
    older.resolve({ ...session, onboardingStep: 'first-image' });
    await Promise.all([foreground, refresh]);

    expect(session$).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().auth).toMatchObject({ session: finished });
  });

  it('still shares one foreground check between overlapping foreground events', async () => {
    const { controller, session$ } = await signedIn([async () => finished]);

    await Promise.all([controller.revalidate(), controller.revalidate()]);

    expect(session$).toHaveBeenCalledTimes(2);
  });
});

describe('authorized', () => {
  it('passes the stored credential to the request and returns its result', async () => {
    const { controller } = await setup({
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });
    const request = vi.fn(async (credential: string) => `ok:${credential}`);

    await expect(controller.authorized(request)).resolves.toBe('ok:c');
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('signs out when Go no longer accepts the session', async () => {
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const { controller } = await setup({ storage });

    await expect(controller.authorized(async () => null)).resolves.toBeNull();
    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toMatchObject({ error: 'session_expired' });
  });

  it('lets request errors through without signing out', async () => {
    const { controller } = await setup({
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    await expect(
      controller.authorized(() => Promise.reject(new AuthApiError('network'))),
    ).rejects.toThrow('network');
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('does not call the request when signed out', async () => {
    const { controller } = await setup();
    const request = vi.fn(async () => 'ok');

    await expect(controller.authorized(request)).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('startHandoff', () => {
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('asks Go for a code with the stored credential', async () => {
    const api = fakeApi();
    const { controller } = await setup({
      api,
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    await expect(controller.startHandoff(challenge, '/history')).resolves.toEqual({
      ok: true,
      code: 'handoff-code',
    });
    expect(api.handoffStart).toHaveBeenCalledWith('c', { challenge, next: '/history' });
  });

  it('signs out when Go no longer accepts the session', async () => {
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const { controller } = await setup({
      api: fakeApi({ handoffStart: vi.fn(async () => null) }),
      storage,
    });

    await expect(controller.startHandoff(challenge, '/history')).resolves.toEqual({
      ok: false,
      error: 'session_expired',
    });
    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toMatchObject({ error: 'session_expired' });
  });

  it('reports network without signing out', async () => {
    const { controller } = await setup({
      api: fakeApi({ handoffStart: vi.fn(() => Promise.reject(new AuthApiError('network'))) }),
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    await expect(controller.startHandoff(challenge, '/history')).resolves.toEqual({
      ok: false,
      error: 'network',
    });
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('does not hand off when signed out', async () => {
    const api = fakeApi();
    const { controller } = await setup({ api });

    await expect(controller.startHandoff(challenge, '/history')).resolves.toMatchObject({
      ok: false,
    });
    expect(api.handoffStart).not.toHaveBeenCalled();
  });

  it('discards a code that arrives after logout', async () => {
    const pending = deferred<string | null>();
    const { controller } = await setup({
      api: fakeApi({ handoffStart: () => pending.promise }),
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    const running = controller.startHandoff(challenge, '/history');
    await controller.logout();
    pending.resolve('late-code');

    await expect(running).resolves.toEqual({ ok: false, error: 'session_expired' });
  });
});

describe('provider availability', () => {
  it('is unavailable when the server does not offer the provider', async () => {
    const google = vi.fn(async () => authenticated());
    const { controller } = await setup({
      api: fakeApi({ capabilities: vi.fn(async (): Promise<AuthProvider[]> => []) }),
      signIn: { google },
    });

    expect(controller.availability('google')).toBe('unavailable');
    await controller.signIn('google');
    expect(google).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });

  it('is unavailable when the app has no sign-in port for the provider', async () => {
    const { controller } = await setup();

    expect(controller.availability('google')).toBe('unavailable');
  });

  it('is unavailable when sign-up is not allowed (no legal documents)', async () => {
    const { controller } = await setup({ signIn: { google: vi.fn() }, signUpAllowed: false });

    expect(controller.availability('google')).toBe('unavailable');
  });

  it('is checking until capabilities load, and unavailable if they fail', async () => {
    const pending = deferred<AuthProvider[]>();
    const controller = createAuthController({
      api: fakeApi({ capabilities: () => pending.promise }),
      storage: fakeStorage(),
      signIn: { google: vi.fn() },
      signUpAllowed: true,
      newRequestId: () => 'r1',
    });
    const started = controller.start();
    expect(controller.availability('google')).toBe('checking');

    const failing = await setup({
      api: fakeApi({ capabilities: vi.fn(() => Promise.reject(new AuthApiError('network'))) }),
      signIn: { google: vi.fn() },
    });
    expect(failing.controller.availability('google')).toBe('unavailable');
    expect(failing.controller.getSnapshot().capabilities).toEqual({
      status: 'failed',
      error: 'network',
    });

    pending.resolve(['google']);
    await started;
    expect(controller.availability('google')).toBe('available');
  });
});

describe('sign-in', () => {
  it('saves the credential before showing the session', async () => {
    const storage = fakeStorage();
    const { controller } = await setup({
      storage,
      signIn: { google: vi.fn(async () => authenticated('g-cred')) },
    });

    await controller.signIn('google');

    expect(storage.saveCredential).toHaveBeenCalledWith('g-cred');
    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 0,
      session,
    });
  });

  it('marks the request as submitting and ignores a second press', async () => {
    const pending = deferred<SignInResult>();
    const google = vi.fn(() => pending.promise);
    const { controller } = await setup({ signIn: { google } });

    const first = controller.signIn('google');
    void controller.signIn('google');

    expect(controller.getSnapshot().auth).toMatchObject({
      status: 'submitting',
      provider: 'google',
    });
    expect(google).toHaveBeenCalledTimes(1);

    pending.resolve(authenticated());
    await first;
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('returns to sign-in when the user cancels in the provider', async () => {
    const { controller } = await setup({
      signIn: {
        google: vi.fn(async (): Promise<SignInResult> => ({ type: 'failed', error: 'cancelled' })),
      },
    });

    await controller.signIn('google');

    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 0 });
  });

  it('shows provider_unavailable when the port throws', async () => {
    const { controller } = await setup({
      signIn: { google: vi.fn(() => Promise.reject(new Error('boom'))) },
    });

    await controller.signIn('google');

    expect(controller.getSnapshot().auth).toMatchObject({
      status: 'recoverable-error',
      error: 'provider_unavailable',
    });
  });

  it('revokes a late success after the user cancelled and stays signed out', async () => {
    const pending = deferred<SignInResult>();
    const api = fakeApi();
    const storage = fakeStorage();
    const { controller } = await setup({ api, storage, signIn: { google: () => pending.promise } });

    const running = controller.signIn('google');
    controller.cancel();
    pending.resolve(authenticated('late'));
    await running;

    expect(storage.saveCredential).not.toHaveBeenCalled();
    expect(api.logout).toHaveBeenCalledWith('late');
    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 0 });
  });

  it('revokes a late success after logout', async () => {
    const pending = deferred<SignInResult>();
    const api = fakeApi();
    const { controller } = await setup({ api, signIn: { google: () => pending.promise } });

    const running = controller.signIn('google');
    await controller.logout();
    pending.resolve(authenticated('late'));
    await running;

    expect(api.logout).toHaveBeenCalledWith('late');
    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 1 });
  });

  it('does not authenticate when saving fails; it revokes the new session and shows a retryable error', async () => {
    const api = fakeApi();
    const storage = fakeStorage(undefined, {
      saveCredential: vi.fn(() => Promise.reject(new Error('keychain'))),
    });
    const { controller } = await setup({
      api,
      storage,
      signIn: { google: vi.fn(async () => authenticated('g')) },
    });

    await controller.signIn('google');

    expect(api.logout).toHaveBeenCalledWith('g');
    expect(controller.getSnapshot().auth).toEqual({
      status: 'recoverable-error',
      generation: 0,
      error: 'storage_unavailable',
    });
    controller.dismiss();
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });

  it('removes a credential saved after the user cancelled during the save', async () => {
    const saving = deferred<undefined>();
    const api = fakeApi();
    const storage = fakeStorage(undefined, { saveCredential: vi.fn(() => saving.promise) });
    const { controller } = await setup({
      api,
      storage,
      signIn: { google: vi.fn(async () => authenticated('g')) },
    });

    const running = controller.signIn('google');
    await vi.waitFor(() => expect(storage.saveCredential).toHaveBeenCalled());
    controller.cancel();
    saving.resolve(undefined);
    await running;

    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(api.logout).toHaveBeenCalledWith('g');
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });
});

describe('logout', () => {
  it('revokes, deletes, and signs out', async () => {
    const api = fakeApi();
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const { controller } = await setup({ api, storage });

    await expect(controller.logout()).resolves.toEqual({ ok: true, revoked: true });

    expect(api.logout).toHaveBeenCalledWith('c');
    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 1 });
  });

  it('reports a failed delete and stays signed in', async () => {
    const storage = fakeStorage(
      { status: 'found', credential: 'c' },
      { deleteCredential: vi.fn(() => Promise.reject(new Error('keychain'))) },
    );
    const { controller } = await setup({ storage });

    await expect(controller.logout()).resolves.toEqual({ ok: false, error: 'storage_unavailable' });
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('still deletes locally when the server cannot be reached', async () => {
    const storage = fakeStorage({ status: 'found', credential: 'c' });
    const api = fakeApi({ logout: vi.fn(() => Promise.reject(new AuthApiError('network'))) });
    const { controller } = await setup({ api, storage });

    await expect(controller.logout()).resolves.toEqual({ ok: true, revoked: false });
    expect(storage.deleteCredential).toHaveBeenCalled();
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });
});

describe('subscribe', () => {
  it('notifies listeners on change and stops after unsubscribe', async () => {
    const { controller } = await setup({ signIn: { google: vi.fn(async () => authenticated()) } });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    await controller.signIn('google');
    const calls = listener.mock.calls.length;
    unsubscribe();
    controller.dismiss();
    await controller.logout();

    expect(calls).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});

describe('resume (cold start)', () => {
  it('signs in with a result finished from the launch URL', async () => {
    const storage = fakeStorage();
    const { controller } = await setup({ storage });

    await controller.resume('google', async () => authenticated('cold'));

    expect(storage.saveCredential).toHaveBeenCalledWith('cold');
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('returns to sign-in without an error when there is no pending sign-in', async () => {
    const { controller } = await setup();

    await controller.resume('google', async () => null);

    expect(controller.getSnapshot().auth).toEqual({ status: 'anonymous', generation: 0 });
  });

  it('does not finish anything for a user who is already signed in', async () => {
    const finish = vi.fn(async () => authenticated('other'));
    const { controller } = await setup({
      storage: fakeStorage({ status: 'found', credential: 'c' }),
    });

    await controller.resume('google', finish);

    expect(finish).not.toHaveBeenCalled();
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('revokes a resumed result that arrives after the user cancelled', async () => {
    const pending = deferred<SignInResult | null>();
    const api = fakeApi();
    const { controller } = await setup({ api });

    const running = controller.resume('google', () => pending.promise);
    controller.cancel();
    pending.resolve(authenticated('cold-late'));
    await running;

    expect(api.logout).toHaveBeenCalledWith('cold-late');
    expect(controller.getSnapshot().auth.status).toBe('anonymous');
  });
});
