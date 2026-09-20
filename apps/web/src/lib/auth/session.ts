import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Session } from '@snapdone/auth-contracts';

import { fetchSession } from './api';
import { isAllowedOrigin } from './config';
import { authCookies } from './cookies';
import { loginPage } from './redirect';

/** Server Action 요청이 이 web에서 왔는가(`WEB_ORIGIN` 정확 비교). mutation Action이 먼저 확인한다. */
export const fromAllowedOrigin = async () => isAllowedOrigin((await headers()).get('origin'));

/** 요청 cookie의 세션 credential 원문. 서버 밖으로 내보내지 않는다. */
export const readCredential = async (): Promise<string | null> =>
  (await cookies()).get(authCookies().session)?.value || null;

/**
 * 이 요청의 로그인 세션을 Go로 확인한다. 없으면 `null`이다.
 * idle 만료 연장은 Go가 조회 시 처리하므로 여기서 cookie를 다시 쓰지 않는다.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const credential = await readCredential();
  return credential ? fetchSession(credential) : null;
});

/** 로그인만 확인한다. 온보딩 전 사용자도 들어와야 하는 `/onboarding`에서 쓴다. */
export const requireSignedIn = async (returnTo: string): Promise<Session> => {
  const session = await getSession();
  if (!session) redirect(loginPage(returnTo));
  return session;
};

/**
 * 보호 page를 지킨다. page마다 부른다 — layout · proxy는 요청마다 다시 실행되지 않아
 * 유일한 검사가 될 수 없다. 온보딩을 끝내지 않은 사용자(`complete`가 아닌 모든 단계)는 `/onboarding`으로 보낸다.
 */
export const requireSession = async (returnTo: string): Promise<Session> => {
  const session = await requireSignedIn(returnTo);
  if (session.onboardingStep !== 'complete') redirect('/onboarding');
  return session;
};
