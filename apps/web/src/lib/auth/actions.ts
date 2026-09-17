'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { AuthErrorCode } from '@snapdone/auth-contracts';

import { AuthApiError, revokeSession, startGoogleOAuth } from './api';
import { getLegalLinks, isAllowedOrigin, isSignUpAllowed } from './config';
import { authCookies, encodePreauth, PREAUTH_MAX_AGE_SECONDS } from './cookies';
import { createLoginProof } from './proof';
import { safeReturnPath } from './redirect';
import { readCredential } from './session';

export type LoginFormState = { error: AuthErrorCode | null };

const fromAllowedOrigin = async () => isAllowedOrigin((await headers()).get('origin'));

export async function startGoogleLogin(
  _previous: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  if (!(await fromAllowedOrigin()) || !isSignUpAllowed(getLegalLinks())) {
    return { error: 'provider_unavailable' };
  }

  const { verifier, state, challenge } = createLoginProof();
  let authorizeUrl: string;
  try {
    authorizeUrl = await startGoogleOAuth({ challenge, state });
  } catch (error) {
    if (error instanceof AuthApiError) return { error: error.code };
    throw error;
  }

  const next = form.get('next');
  const { preauth, options } = authCookies();
  (await cookies()).set(
    preauth,
    encodePreauth({
      state,
      verifier,
      returnTo: safeReturnPath(typeof next === 'string' ? next : null),
    }),
    { ...options, maxAge: PREAUTH_MAX_AGE_SECONDS },
  );
  redirect(authorizeUrl);
}

/**
 * 이 브라우저를 로그아웃한다. Go logout이 실패해도 cookie는 지운다 — 서버 세션은
 * idle 만료로 끝난다.
 */
export async function logout(): Promise<void> {
  if (!(await fromAllowedOrigin())) throw new Error('허용되지 않은 origin의 로그아웃 요청입니다.');

  const credential = await readCredential();
  if (credential) {
    await revokeSession(credential).catch((error: unknown) => {
      if (!(error instanceof AuthApiError)) throw error;
    });
  }

  const { session, options } = authCookies();
  (await cookies()).set(session, '', { ...options, maxAge: 0 });
  redirect('/login');
}
