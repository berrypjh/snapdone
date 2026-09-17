import { useSyncExternalStore } from 'react';

import { type AuthApi, AuthApiError } from './api';
import {
  type AuthErrorCode,
  type AuthEvent,
  type AuthProvider,
  authReducer,
  type AuthState,
  initialAuthState,
  type Session,
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

  const revoke = (credential: string) => api.logout(credential).catch(() => undefined);

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

  const logout = async (): Promise<{ ok: true } | { ok: false; error: AuthErrorCode }> => {
    const stored = await storage.readCredential();
    if (stored.status === 'unavailable') return { ok: false, error: 'storage_unavailable' };
    if (stored.status === 'found') await revoke(stored.credential);
    try {
      await storage.deleteCredential();
    } catch {
      return { ok: false, error: 'storage_unavailable' };
    }
    dispatch({ type: 'logout' });
    return { ok: true };
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
