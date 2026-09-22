import type { Scenario } from '../../domain/model';

import { step } from './step';

export const authFailureRecovery: Scenario = {
  id: 'auth-failure-recovery',
  title: '로그인 실패 복구',
  goal: '로그인이 실패하거나 취소돼도 이유를 알고 다시 시도 가능',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'product-principles', heading: 'AI보다 Action 결과를 우선한다' }],
  gaps: [{ kind: 'runtime-unverified', note: '앱 쪽 오류 화면은 단위 테스트까지' }],
  steps: [
    step({
      id: 'server-unavailable',
      intent: '(원인) 인증이 설정되지 않았거나 Go에 닿지 못함',
      behavior:
        'Go는 인증 설정이 없으면 /v1/auth/*에 503 provider_unavailable 반환. 응답이 없으면 클라이언트가 network로 변환',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/httpserver/middleware.go', symbol: 'requireConfigured' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'AuthApiError' },
      ],
      contracts: ['auth-error-code'],
      tests: ['go-auth-not-configured', 'web-api-network'],
      next: ['web-login-page', 'app-sign-in'],
    }),
    step({
      id: 'web-login-page',
      intent: '브라우저 로그인 화면 열기',
      behavior: 'Go 오류가 나도 page가 깨지지 않고 오류 문구를 보이고 Google 버튼을 끔',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/login/page.tsx', symbol: 'orAuthError' },
        { path: 'apps/web/src/components/auth/auth-copy.ts', symbol: 'authErrorMessage' },
      ],
      tests: ['web-api-network', 'e2e-login-screen'],
      next: ['web-start-failure'],
    }),
    step({
      id: 'web-start-failure',
      intent: '"Google로 계속하기" 실패',
      behavior: 'Server Action이 오류 코드만 돌려주고 버튼 아래 alert로 알림. 다시 누를 수 있음',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/auth/google-login-form.tsx', symbol: 'GoogleLoginForm' },
        { path: 'apps/web/src/lib/auth/actions.ts', symbol: 'startGoogleLogin' },
      ],
      tests: ['web-start-refused', 'e2e-start-failure'],
      next: ['web-callback-error'],
    }),
    step({
      id: 'web-callback-error',
      intent: 'Google에서 돌아왔지만 로그인이 끝나지 않음',
      behavior:
        '오류 코드를 붙여 /login으로 보내 한 번 alert로 읽힘. 사용자가 취소했으면 오류 없이 복귀',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'completeLogin' },
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'loginPage' },
      ],
      contracts: ['auth-error-code'],
      tests: [
        'web-callback-cancelled',
        'web-callback-failed-exchange',
        'e2e-login-callback-error',
        'e2e-callback-alert',
        'e2e-cancel-no-error',
        'e2e-google-closed',
      ],
    }),
    step({
      id: 'app-sign-in',
      intent: '앱 로그인 실패',
      behavior:
        '오류 코드별 문구 표시. 로그인 수단 조회 실패에는 "다시 시도", 기기 저장소 실패에는 잠금 해제 안내 제공. 취소는 오류 없이 복귀',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/screens/AuthScreen.tsx', symbol: 'AuthScreen' },
        { path: 'apps/mobile/src/components/auth/authCopy.ts', symbol: 'authErrorMessage' },
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'reloadCapabilities' },
      ],
      contracts: ['auth-error-code'],
      tests: [
        'mobile-copy-errors',
        'mobile-availability',
        'mobile-sign-in-save-fails',
        'mobile-google-server-error',
      ],
    }),
  ],
};
