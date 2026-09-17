import { useSyncExternalStore } from 'react';

import type { AuthProvider, Session } from '@snapdone/auth-contracts';

import { type AuthApi, AuthApiError } from './api';
import {
  type AuthErrorCode,
  type AuthEvent,
  authReducer,
  type AuthState,
  initialAuthState,
} from './model';
import type { AuthStorage } from './storage';

export type SignInResult =
  | { type: 'authenticated'; session: Session; credential: string }
  | { type: 'failed'; error: AuthErrorCode };

export type SignInPort = () => Promise<SignInResult>;

export type Capabilities =
  | { status: 'loading' }
  | { status: 'ready'; providers: AuthProvider[] }
  | { status: 'failed'; error: AuthErrorCode };

export type AuthSnapshot = { auth: AuthState; capabilities: Capabilities };

export type ProviderAvailability = 'available' | 'unavailable' | 'checking';

/** `revoked: false`는 이 기기에서는 로그아웃했지만 서버 세션 취소를 확인하지 못했다는 뜻이다. */
export type LogoutResult = { ok: true; revoked: boolean } | { ok: false; error: AuthErrorCode };

export type HandoffResult = { ok: true; code: string } | { ok: false; error: AuthErrorCode };

export type AuthControllerDeps = {
  api: AuthApi;
  storage: AuthStorage;
  signIn: Partial<Record<AuthProvider, SignInPort>>;
  signUpAllowed: boolean;
  newRequestId: () => string;
};

const errorCodeOf = (error: unknown): AuthErrorCode =>
  error instanceof AuthApiError ? error.code : 'provider_unavailable';

export const createAuthController = (deps: AuthControllerDeps) => {
  const { api, storage } = deps;
  let snapshot: AuthSnapshot = { auth: initialAuthState, capabilities: { status: 'loading' } };
  const listeners = new Set<() => void>();

  const publish = (next: AuthSnapshot) => {
    if (next.auth === snapshot.auth && next.capabilities === snapshot.capabilities) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const dispatch = (event: AuthEvent) =>
    publish({ ...snapshot, auth: authReducer(snapshot.auth, event) });

  const revoke = (credential: string) =>
    api.logout(credential).then(
      () => true,
      () => false,
    );

  const isPending = (requestId: string, generation: number) => {
    const { auth } = snapshot;
    return (
      auth.status === 'submitting' && auth.requestId === requestId && auth.generation === generation
    );
  };

  const availability = (provider: AuthProvider): ProviderAvailability => {
    const { capabilities } = snapshot;
    if (capabilities.status === 'loading') return 'checking';
    const offered = capabilities.status === 'ready' && capabilities.providers.includes(provider);
    return offered && deps.signIn[provider] && deps.signUpAllowed ? 'available' : 'unavailable';
  };

  const loadCapabilities = async () => {
    try {
      // Await before spreading: `snapshot` must be read after restore may have changed it.
      const providers = await api.capabilities();
      publish({ ...snapshot, capabilities: { status: 'ready', providers } });
    } catch (error) {
      publish({ ...snapshot, capabilities: { status: 'failed', error: errorCodeOf(error) } });
    }
  };

  const restore = async () => {
    const { generation } = snapshot.auth;
    const stored = await storage.readCredential();
    if (stored.status === 'unavailable') {
      dispatch({ type: 'restore-failed', generation, error: 'storage_unavailable' });
      return;
    }
    if (stored.status === 'empty') {
      dispatch({ type: 'restored', generation, session: null });
      return;
    }
    try {
      const session = await api.session(stored.credential);
      if (!session) await storage.deleteCredential();
      dispatch({ type: 'restored', generation, session });
    } catch (error) {
      dispatch({ type: 'restore-failed', generation, error: errorCodeOf(error) });
    }
  };

  const retryRestore = async () => {
    if (snapshot.auth.status !== 'restore-failed') return;
    dispatch({ type: 'retry-restore' });
    await restore();
  };

  const isCurrentSession = (generation: number) =>
    snapshot.auth.status === 'authenticated' && snapshot.auth.generation === generation;

  /** 서버가 세션을 거부했다. 같은 로그인이 아직 화면에 있을 때만 credential을 지우고 로그인으로 보낸다. */
  const expire = async (generation: number) => {
    if (!isCurrentSession(generation)) return;
    await storage.deleteCredential().catch(() => undefined);
    dispatch({ type: 'session-expired', generation });
  };

  const checkSession = async () => {
    if (snapshot.auth.status !== 'authenticated') return;
    const { generation } = snapshot.auth;
    const stored = await storage.readCredential();
    if (stored.status === 'unavailable') return;
    if (stored.status === 'empty') {
      await expire(generation);
      return;
    }
    try {
      if (!(await api.session(stored.credential))) await expire(generation);
    } catch {
      // 서버에 닿지 못했다. 오프라인은 로그인 상태를 유지한다.
    }
  };

  let revalidating: Promise<void> | null = null;

  /** 로그인 상태면 서버에 세션을 다시 확인한다. 진행 중인 확인이 있으면 그 결과를 함께 기다린다. */
  const revalidate = () => {
    revalidating ??= checkSession().finally(() => {
      revalidating = null;
    });
    return revalidating;
  };

  /** web ready page가 준 challenge로 WebView 핸드오프 코드를 받는다. credential은 밖으로 나가지 않는다. */
  const startHandoff = async (challenge: string, next: string): Promise<HandoffResult> => {
    if (snapshot.auth.status !== 'authenticated') return { ok: false, error: 'session_expired' };
    const { generation } = snapshot.auth;
    const stored = await storage.readCredential();
    if (stored.status === 'unavailable') return { ok: false, error: 'storage_unavailable' };
    if (stored.status === 'empty') {
      await expire(generation);
      return { ok: false, error: 'session_expired' };
    }
    try {
      const code = await api.handoffStart(stored.credential, { challenge, next });
      if (!code) {
        await expire(generation);
        return { ok: false, error: 'session_expired' };
      }
      return isCurrentSession(generation)
        ? { ok: true, code }
        : { ok: false, error: 'session_expired' };
    } catch (error) {
      return { ok: false, error: errorCodeOf(error) };
    }
  };

  const run = async (provider: AuthProvider, port: SignInPort) => {
    const requestId = deps.newRequestId();
    dispatch({ type: 'submit', provider, requestId });
    if (snapshot.auth.status !== 'submitting' || snapshot.auth.requestId !== requestId) return;
    const { generation } = snapshot.auth;
    const resolve = (outcome: Extract<AuthEvent, { type: 'resolved' }>['outcome']) =>
      dispatch({ type: 'resolved', generation, requestId, outcome });

    const result = await port().catch((): SignInResult => ({
      type: 'failed',
      error: 'provider_unavailable',
    }));
    if (result.type === 'failed') {
      resolve(result);
      return;
    }
    if (!isPending(requestId, generation)) {
      await revoke(result.credential);
      return;
    }

    try {
      await storage.saveCredential(result.credential);
    } catch {
      await revoke(result.credential);
      resolve({ type: 'failed', error: 'storage_unavailable' });
      return;
    }
    if (!isPending(requestId, generation)) {
      await storage.deleteCredential().catch(() => undefined);
      await revoke(result.credential);
      return;
    }
    resolve({ type: 'authenticated', session: result.session });
  };

  const signIn = async (provider: AuthProvider) => {
    const port = deps.signIn[provider];
    if (!port || availability(provider) !== 'available') return;
    await run(provider, port);
  };

  const resume = (provider: AuthProvider, finish: () => Promise<SignInResult | null>) =>
    run(provider, async () => (await finish()) ?? { type: 'failed', error: 'cancelled' });

  const logout = async (): Promise<LogoutResult> => {
    const stored = await storage.readCredential();
    if (stored.status === 'unavailable') return { ok: false, error: 'storage_unavailable' };
    const revoked = stored.status === 'found' ? await revoke(stored.credential) : true;
    try {
      await storage.deleteCredential();
    } catch {
      return { ok: false, error: 'storage_unavailable' };
    }
    dispatch({ type: 'logout' });
    return { ok: true, revoked };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => Promise.all([restore(), loadCapabilities()]).then(() => undefined),
    reloadCapabilities: async () => {
      publish({ ...snapshot, capabilities: { status: 'loading' } });
      await loadCapabilities();
    },
    retryRestore,
    revalidate,
    startHandoff,
    availability,
    signIn,
    resume,
    cancel: () => dispatch({ type: 'cancel' }),
    dismiss: () => dispatch({ type: 'dismiss' }),
    logout,
  };
};

export type AuthController = ReturnType<typeof createAuthController>;

export const useAuthSnapshot = (controller: AuthController): AuthSnapshot =>
  useSyncExternalStore(controller.subscribe, controller.getSnapshot);
