import { type NextRequest, NextResponse } from 'next/server';

import { type AuthErrorCode, toAuthErrorCode } from '@snapdone/auth-contracts';

import { AuthApiError, exchangeResultCode } from './api';
import { getWebOrigin } from './config';
import { authCookies, decodePreauth, type Preauth, secondsUntil } from './cookies';
import { sameState } from './proof';
import { loginPage, safeReturnPath } from './redirect';

export type CallbackOutcome =
  | { type: 'signed-in'; location: string; credential: string; maxAge: number }
  | { type: 'rejected'; location: string };

/** 최대 한 번 나오는 query 값. 반복된 key는 `undefined`이다. */
export const single = (query: URLSearchParams, key: string) => {
  const values = query.getAll(key);
  return values.length > 1 ? undefined : (values[0] ?? null);
};

/**
 * Go redirect query와 preauth cookie로 web callback이 할 일을 정한다.
 * preauth cookie가 있고 state가 query와 같을 때만 교환한다.
 */
export const completeLogin = async (
  query: URLSearchParams,
  preauth: Preauth | null,
  now = Date.now(),
): Promise<CallbackOutcome> => {
  const returnTo = safeReturnPath(preauth?.returnTo);
  const reject = (error?: AuthErrorCode): CallbackOutcome => ({
    type: 'rejected',
    location: loginPage(returnTo, error),
  });

  const state = single(query, 'state');
  const code = single(query, 'code');
  const error = single(query, 'error');
  if (!preauth || !state || !sameState(preauth.state, state)) return reject('invalid_callback');

  if (error && code === null) {
    const reason = toAuthErrorCode(error);
    return reject(reason === 'cancelled' ? undefined : reason);
  }
  if (!code || error !== null) return reject('invalid_callback');

  try {
    const { session, credential } = await exchangeResultCode({
      code,
      verifier: preauth.verifier,
      state,
    });
    const maxAge = secondsUntil(session.expiresAt, now);
    if (maxAge <= 0) return reject('provider_unavailable');
    // 온보딩을 마치지 않은 사용자는 돌아갈 경로보다 온보딩이 먼저다.
    const location = session.onboardingStep === 'complete' ? returnTo : '/onboarding';
    return { type: 'signed-in', location, credential, maxAge };
  } catch (caught) {
    if (caught instanceof AuthApiError) return reject(caught.code);
    throw caught;
  }
};

/**
 * `GET /auth/callback`. 일회용 preauth cookie는 항상 지우고 성공할 때만 session cookie를 설정한다.
 * 고정 page로 redirect해 result code가 주소창에 남지 않게 한다.
 */
export const handleOAuthCallback = async (request: NextRequest): Promise<NextResponse> => {
  const cookies = authCookies();
  const preauth = decodePreauth(request.cookies.get(cookies.preauth)?.value);
  const outcome = await completeLogin(request.nextUrl.searchParams, preauth);

  return redirectWithOutcome(outcome, cookies.preauth);
};

/** 코드 · 링크가 남지 않게 한다. 일회용 값이 오가는 응답에 붙인다. */
export const noStore = (response: NextResponse) => {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};

/**
 * 결과 page로 303 redirect한다. 일회용 cookie는 항상 지우고, 로그인에 성공했을 때만
 * session cookie를 설정한다. 로그인 callback과 WebView 핸드오프가 함께 쓴다.
 */
export const redirectWithOutcome = (outcome: CallbackOutcome, oneTimeCookie: string) => {
  const cookies = authCookies();
  const response = NextResponse.redirect(new URL(outcome.location, getWebOrigin()), 303);
  response.cookies.set(oneTimeCookie, '', { ...cookies.options, maxAge: 0 });
  if (outcome.type === 'signed-in') {
    response.cookies.set(cookies.session, outcome.credential, {
      ...cookies.options,
      maxAge: outcome.maxAge,
    });
  }
  return noStore(response);
};
