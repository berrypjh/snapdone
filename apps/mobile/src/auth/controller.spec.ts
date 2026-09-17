import { describe, expect, it, vi } from 'vitest';

import { type AuthApi, AuthApiError } from './api';
import { type AuthControllerDeps, createAuthController, type SignInResult } from './controller';
import type { AuthProvider, Session } from './model';
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
  capabilities: vi.fn(async (): Promise<AuthProvider[]> => ['google', 'apple', 'naver', 'kakao']),
  session: vi.fn(async () => session),
  logout: vi.fn(async () => undefined),
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

  it('treats an unreadable secure store as an error, not as signed out', async () => {
    const { controller } = await setup({ storage: fakeStorage({ status: 'unavailable' }) });

    expect(controller.getSnapshot().auth).toEqual({
      status: 'recoverable-error',
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
      status: 'recoverable-error',
      error: 'network',
    });
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

    expect(controller.availability('kakao')).toBe('unavailable');
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
      signIn: { naver: vi.fn(async () => authenticated('n-cred')) },
    });

    await controller.signIn('naver');

    expect(storage.saveCredential).toHaveBeenCalledWith('n-cred');
    expect(controller.getSnapshot().auth).toEqual({
      status: 'authenticated',
      generation: 0,
      session,
    });
  });

  it('marks only the requested provider as submitting and ignores a second press', async () => {
    const pending = deferred<SignInResult>();
    const kakao = vi.fn(() => pending.promise);
    const google = vi.fn(async () => authenticated());
    const { controller } = await setup({ signIn: { kakao, google } });

    const first = controller.signIn('kakao');
    void controller.signIn('google');
    void controller.signIn('kakao');

    expect(controller.getSnapshot().auth).toMatchObject({
      status: 'submitting',
      provider: 'kakao',
    });
    expect(kakao).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();

    pending.resolve(authenticated());
    await first;
    expect(controller.getSnapshot().auth.status).toBe('authenticated');
  });

  it('returns to sign-in when the user cancels in the provider', async () => {
    const { controller } = await setup({
      signIn: {
        apple: vi.fn(async (): Promise<SignInResult> => ({ type: 'failed', error: 'cancelled' })),
      },
    });

    await controller.signIn('apple');

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
      signIn: { kakao: vi.fn(async () => authenticated('k')) },
    });

    await controller.signIn('kakao');

    expect(api.logout).toHaveBeenCalledWith('k');
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

    await expect(controller.logout()).resolves.toEqual({ ok: true });

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

    await expect(controller.logout()).resolves.toEqual({ ok: true });
    expect(storage.deleteCredential).toHaveBeenCalled();
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
