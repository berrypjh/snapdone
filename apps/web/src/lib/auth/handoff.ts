import { type NextRequest, NextResponse } from 'next/server';

import type { AuthErrorCode } from '@snapdone/auth-contracts';

import { AuthApiError, exchangeHandoffCode } from './api';
import { type CallbackOutcome, noStore, redirectWithOutcome, single } from './callback';
import { getWebOrigin } from './config';
import {
  authCookies,
  decodeHandoffVerifier,
  HANDOFF_MAX_AGE_SECONDS,
  secondsUntil,
} from './cookies';
import { challengeS256, createLoginProof } from './proof';
import { loginPage, safeReturnPath } from './redirect';

/**
 * `GET /auth/handoff/start?next=`. 이 WebView만 가진 verifier를 HttpOnly cookie에 두고
 * challenge를 앱에 알리는 ready page로 보낸다. verifier는 브라우저 JS · 앱으로 나가지 않는다.
 */
export const handleHandoffStart = (request: NextRequest): NextResponse => {
  const next = safeReturnPath(single(request.nextUrl.searchParams, 'next'));
  const cookies = authCookies();
  const ready = new URL(`/auth/handoff/ready?${new URLSearchParams({ next })}`, getWebOrigin());
  const response = NextResponse.redirect(ready, 303);
  response.cookies.set(cookies.handoff, createLoginProof().verifier, {
    ...cookies.options,
    maxAge: HANDOFF_MAX_AGE_SECONDS,
  });
  return noStore(response);
};

/** ready page가 앱에 보낼 challenge. verifier cookie가 없으면 `null`이다. */
export const handoffChallenge = (cookieValue: string | undefined): string | null => {
  const verifier = decodeHandoffVerifier(cookieValue);
  return verifier ? challengeS256(verifier) : null;
};

/**
 * 앱이 연 `/auth/handoff?code=&next=`로 할 일을 정한다. 이 브라우저의 verifier가 있고
 * `next`가 allowlist와 정확히 같을 때만 교환한다.
 */
export const completeHandoff = async (
  query: URLSearchParams,
  verifier: string | null,
  now = Date.now(),
): Promise<CallbackOutcome> => {
  const next = single(query, 'next');
  const code = single(query, 'code');
  const returnTo = safeReturnPath(next);
  const reject = (error: AuthErrorCode = 'invalid_callback'): CallbackOutcome => ({
    type: 'rejected',
    location: loginPage(returnTo, error),
  });
  if (!verifier || !code || next !== returnTo) return reject();

  try {
    const { session, credential } = await exchangeHandoffCode({ code, verifier, next: returnTo });
    const maxAge = secondsUntil(session.expiresAt, now);
    if (maxAge <= 0) return reject('session_expired');
    return { type: 'signed-in', location: returnTo, credential, maxAge };
  } catch (caught) {
    if (caught instanceof AuthApiError) return reject(caught.code);
    throw caught;
  }
};

/**
 * `GET /auth/handoff`. verifier cookie는 항상 지우고, 성공하면 이 WebView의 기존 session cookie를
 * 새 child 세션으로 덮어쓴 뒤 code 없는 경로로 redirect한다.
 */
export const handleHandoff = async (request: NextRequest): Promise<NextResponse> => {
  const cookies = authCookies();
  const verifier = decodeHandoffVerifier(request.cookies.get(cookies.handoff)?.value);
  const outcome = await completeHandoff(request.nextUrl.searchParams, verifier);

  return redirectWithOutcome(outcome, cookies.handoff);
};
