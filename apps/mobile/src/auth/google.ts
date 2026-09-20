import { type AuthApi, errorCodeOf } from './api';
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
  /** 서버 `AUTH_MOBILE_REDIRECT_URI`와 정확히 같아야 한다. */
  redirectUri: string;
  now: () => number;
};

const failed = (error: AuthErrorCode): SignInResult => ({ type: 'failed', error });

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

/** Google 로그인 port: proof → 서버 시작 → 시스템 브라우저 → 서버 복귀 → 교환. */
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
