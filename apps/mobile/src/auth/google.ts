import { type AuthApi, AuthApiError } from './api';
import { parseOAuthCallback } from './callback';
import type { SignInResult } from './controller';
import type { AuthErrorCode } from './model';
import { createProof, type ProofCrypto } from './proof';
import type { AuthStorage } from './storage';

export type AuthBrowser = {
  openAuthSession: (
    url: string,
    redirectUri: string,
  ) => Promise<{ type: 'success'; url: string } | { type: 'cancel' }>;
};

export type GoogleSignInDeps = {
  api: Pick<AuthApi, 'oauthStart' | 'oauthCancel' | 'exchange'>;
  storage: AuthStorage;
  crypto: ProofCrypto;
  browser: AuthBrowser;
  /** Must equal the server's AUTH_MOBILE_REDIRECT_URI. */
  redirectUri: string;
  now: () => number;
};

const failed = (error: AuthErrorCode): SignInResult => ({ type: 'failed', error });

const errorCodeOf = (error: unknown): AuthErrorCode =>
  error instanceof AuthApiError ? error.code : 'provider_unavailable';

export const finishGoogleSignIn = async (
  deps: GoogleSignInDeps,
  url: string,
): Promise<SignInResult | null> => {
  const callback = parseOAuthCallback(url, deps.redirectUri);
  if (!callback) return null;

  const pending = await deps.storage.takeProof(deps.now()).catch(() => null);
  if (!pending) return null;
  if (pending.provider !== 'google' || pending.state !== callback.state) {
    return failed('invalid_callback');
  }
  if (callback.type === 'error') return failed(callback.error);

  try {
    const { session, credential } = await deps.api.exchange({
      code: callback.code,
      verifier: pending.verifier,
      state: pending.state,
    });
    return { type: 'authenticated', session, credential };
  } catch (error) {
    return failed(errorCodeOf(error));
  }
};

const discardPending = async (deps: GoogleSignInDeps, state: string) => {
  await deps.storage.takeProof(deps.now()).catch(() => null);
  await deps.api.oauthCancel(state).catch(() => undefined);
};

/** Google sign-in port: proof → server start → system browser → server return → exchange. */
export const createGoogleSignIn = (deps: GoogleSignInDeps) => async (): Promise<SignInResult> => {
  const proof = await createProof(deps.crypto);
  try {
    await deps.storage.saveProof({ ...proof, provider: 'google', createdAt: deps.now() });
  } catch {
    return failed('storage_unavailable');
  }

  let authorizeUrl: string;
  try {
    authorizeUrl = await deps.api.oauthStart({
      provider: 'google',
      challenge: proof.challenge,
      state: proof.state,
      platform: 'mobile',
    });
  } catch (error) {
    await deps.storage.takeProof(deps.now()).catch(() => null);
    return failed(errorCodeOf(error));
  }

  const result = await deps.browser.openAuthSession(authorizeUrl, deps.redirectUri);
  if (result.type !== 'success') {
    await discardPending(deps, proof.state);
    return failed('cancelled');
  }
  return (await finishGoogleSignIn(deps, result.url)) ?? failed('invalid_callback');
};
