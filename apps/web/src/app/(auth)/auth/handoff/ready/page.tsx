import { cookies } from 'next/headers';

import { InAppMessage } from '@/components/in-app-message';
import { authCookies } from '@/lib/auth/cookies';
import { handoffChallenge } from '@/lib/auth/handoff';
import { safeReturnPath } from '@/lib/auth/redirect';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 앱에 핸드오프 challenge를 알린다. verifier cookie가 없으면 로그인이 필요하다고 알린다. */
export default async function HandoffReadyPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(Array.isArray(next) ? null : next);
  const challenge = handoffChallenge((await cookies()).get(authCookies().handoff)?.value);

  return (
    <>
      <p role="status" className="text-center typo-paragraph-default text-text-light">
        로그인 정보를 확인하는 중입니다.
      </p>
      <InAppMessage
        message={
          challenge
            ? { type: 'handoff-ready', challenge, next: returnTo }
            : { type: 'auth-required' }
        }
      />
    </>
  );
}
