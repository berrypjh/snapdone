import type { Session } from '@snapdone/auth-contracts';
import type { CompletedProgress } from '@snapdone/onboarding';

/** 온보딩 완료에 쓰는 것. 둘 다 로그인 세션으로 부르고, 세션이 끝났으면 `null`이다. */
export type CompletionDeps = {
  complete: () => Promise<CompletedProgress | null>;
  refreshSession: () => Promise<Session | null>;
};

/**
 * 서버에서 온보딩을 끝내고 세션을 다시 받는다. 받은 세션이 complete면 앱이 홈으로 바뀐다.
 * 완료 요청은 다시 보내도 안전해서(이미 마친 것도 성공) 실패하면 처음부터 다시 부르면 된다.
 * 세션이 끝났으면 로그인 화면으로 바뀌므로 그대로 돌아간다. 그 밖의 실패는 던진다.
 */
export const completeOnboarding = async ({
  complete,
  refreshSession,
}: CompletionDeps): Promise<void> => {
  if (!(await complete())) return;
  const session = await refreshSession();
  if (session && session.onboardingStep !== 'complete') {
    throw new Error('온보딩 완료가 세션에 아직 반영되지 않았습니다.');
  }
};
