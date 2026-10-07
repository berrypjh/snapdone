import type { Scenario } from '../../domain/model';

import { step } from './step';

const SESSION = 'apps/web/src/lib/auth/session.ts';

export const onboardingIntro: Scenario = {
  id: 'onboarding-intro',
  title: '온보딩 소개',
  goal: '처음 온 사용자가 서비스 소개를 보고 온보딩을 마친 뒤 홈 도착',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'local-development', heading: '앱 안 WebView 화면 보기' }],
  gaps: [],
  steps: [
    step({
      id: 'new-user',
      intent: '(자동) 처음 로그인한 사람의 계정 생성',
      behavior:
        'profiles 행이 onboarding_step 기본값 intro로 생성. 세션 응답에 onboardingStep 포함',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/auth/store.go', symbol: 'Store.CreateUser' },
        { path: 'apps/api/internal/database/migrations/0001_auth.sql' },
        { path: 'libs/auth-contracts/src/lib/auth.ts', symbol: 'OnboardingStep' },
      ],
      contracts: ['auth-session'],
      tests: ['go-user-starts-at-intro', 'auth-contracts-session'],
      next: ['route-app', 'route-web-protected', 'route-web-after-login'],
    }),
    step({
      id: 'route-app',
      intent: '앱에서 로그인 완료',
      behavior:
        'onboardingStep이 complete가 아니면 앱은 홈 대신 온보딩 흐름 등록. 서버에 저장된 진행 단계(web에서 하던 진행 포함)부터 이어서 엶',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/model.ts', symbol: 'destinationFor' },
        { path: 'apps/mobile/src/app/OnboardingFlow.tsx', symbol: 'OnboardingFlow' },
        { path: 'apps/mobile/src/onboarding/progressApi.ts', symbol: 'progressApi' },
      ],
      apis: ['get-onboarding', 'put-onboarding'],
      tests: ['mobile-destination-onboarding', 'go-onboarding-progress', 'go-onboarding-store'],
      next: ['intro-app'],
    }),
    step({
      id: 'route-web-protected',
      intent: '브라우저에서 보호된 화면(/history) 열기',
      behavior: 'requireSession이 온보딩 전 사용자를 /onboarding으로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: SESSION, symbol: 'requireSession' }],
      tests: ['web-require-session-onboarding', 'e2e-onboarding-redirect'],
      next: ['intro-web'],
    }),
    step({
      id: 'route-web-after-login',
      intent: '브라우저에서 로그인 직후',
      behavior:
        'completeLogin은 온보딩을 마치지 않은 사용자를 /onboarding으로, 마친 사용자를 복귀 경로로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'completeLogin' },
        { path: 'apps/web/src/app/(product)/page.tsx', symbol: 'HomePage' },
      ],
      tests: ['web-callback-onboarding', 'e2e-new-user-onboarding'],
      next: ['intro-web'],
    }),
    step({
      id: 'intro-app',
      intent: '앱에서 서비스 소개 보기',
      behavior:
        '예시 3장(입력 → 끝난 일) · "시작하기" · 로그아웃 표시. 시작하기는 목적 선택 → 첫 사진 → 사진 확인으로 이어짐',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/screens/OnboardingIntroScreen.tsx',
          symbol: 'OnboardingIntroScreen',
        },
      ],
      gaps: [
        {
          kind: 'no-test',
          note: '화면 컴포넌트 테스트 없음(mobile 런타임 검증 수단 없음)',
        },
      ],
      next: ['finish'],
      via: ['onboarding-first-photo'],
    }),
    step({
      id: 'intro-web',
      intent: '브라우저에서 서비스 소개를 보고 온보딩 진행',
      behavior:
        '앱과 같은 예시와 "시작하기" 표시. 시작하기는 목적 선택 → 첫 사진(파일 선택) → 사진 확인 → 처리로 이어짐. 진행은 서버에 저장돼 다시 열면 그 단계부터 시작. 앱 WebView 안에서는 로그아웃 버튼 숨김',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/onboarding/page.tsx', symbol: 'OnboardingPage' },
        { path: 'apps/web/src/lib/onboarding/actions.ts', symbol: 'startOnboarding' },
        {
          path: 'apps/web/src/components/onboarding/first-image-flow.tsx',
          symbol: 'FirstImageFlow',
        },
        { path: SESSION, symbol: 'requireSignedIn' },
      ],
      apis: ['get-onboarding', 'put-onboarding', 'post-processing-jobs', 'get-processing-job'],
      tests: [
        'e2e-login-from-onboarding',
        'e2e-onboarding-decorations',
        'e2e-web-onboarding-flow',
        'e2e-web-onboarding-resume',
      ],
      gaps: [
        {
          kind: 'code-not-found',
          note: '예시는 고정 문구, 해당 기능 코드 없음 — finish-task-from-image 참고',
        },
      ],
      next: ['finish'],
      via: ['onboarding-first-photo'],
    }),
    step({
      id: 'finish',
      intent: '온보딩을 끝내고 홈으로 이동',
      behavior:
        'POST /v1/onboarding/complete가 first-image에서 complete로 확정(이미 마쳤으면 그대로 성공, 목적 유지, 그 전 단계는 409). web은 결과 화면의 완료 버튼이 Server Action으로 부르고 홈(/)으로 보냄. 앱은 완료 뒤 세션을 다시 받아 onboardingStep이 complete가 되면 root stack이 홈으로 바뀜',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/onboarding/onboarding.go', symbol: 'Store.Complete' },
        {
          path: 'apps/api/internal/httpserver/onboarding.go',
          symbol: 'handlers.completeOnboarding',
        },
        { path: 'apps/web/src/lib/onboarding/actions.ts', symbol: 'completeOnboarding' },
        { path: 'apps/mobile/src/onboarding/completion.ts', symbol: 'completeOnboarding' },
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'createAuthController' },
        { path: 'apps/mobile/src/auth/model.ts', symbol: 'destinationFor' },
        { path: 'apps/mobile/src/app/App.tsx', symbol: 'AppNavigator' },
      ],
      apis: ['post-onboarding-complete'],
      tests: [
        'go-onboarding-complete',
        'go-onboarding-complete-rejects',
        'go-onboarding-store-complete',
        'go-onboarding-store-complete-concurrently',
        'web-onboarding-complete',
        'web-onboarding-complete-reconcile',
        'mobile-onboarding-complete',
        'mobile-session-refresh-home',
        'e2e-web-onboarding-flow',
        'e2e-web-first-result-keyboard',
      ],
      docs: [{ document: 'local-development', heading: '앱 안 WebView 화면 보기' }],
      gaps: [
        {
          kind: 'runtime-unverified',
          note: '앱은 런타임 검증 수단이 없어 실기기 확인이 남음',
        },
      ],
    }),
  ],
};
