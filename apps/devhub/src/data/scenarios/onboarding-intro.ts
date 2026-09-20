import type { Scenario } from '../../domain/model';

import { step } from './step';

const SESSION = 'apps/web/src/lib/auth/session.ts';

export const onboardingIntro: Scenario = {
  id: 'onboarding-intro',
  title: '온보딩 소개',
  goal: '처음 온 사용자가 서비스 소개를 보고 온보딩을 마친 뒤 홈에 닿는다',
  track: 'current',
  status: 'partial',
  docs: [
    { document: 'local-development', heading: '앱 안 WebView 화면 보기' },
    { document: 'devhub', heading: '12. Known documentation/code discrepancies' },
  ],
  gaps: [
    {
      kind: 'code-not-found',
      note: '온보딩을 끝내는 API가 없다. 앱과 web 모두 소개 → 목적 선택 → 첫 사진 → 처리까지 가지만 첫 결과 화면이 없어 그 뒤로 가지 못한다. 실제 사용자는 홈에 닿지 못하고, 로컬에서는 profiles.onboarding_step을 직접 바꿔야 한다',
    },
    {
      kind: 'runtime-unverified',
      note: '신규 사용자가 로그인 직후 /onboarding에 닿는 E2E는 이 환경에서 실행하지 못했다',
      tests: ['e2e-new-user-onboarding'],
    },
  ],
  steps: [
    step({
      id: 'new-user',
      intent: '(자동) 처음 로그인한 사람의 계정이 만들어진다',
      behavior:
        'profiles 행이 onboarding_step 기본값 intro로 생긴다. 세션 응답에 onboardingStep이 실린다',
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
      intent: '앱에서 로그인을 마친다',
      behavior:
        'onboardingStep이 complete가 아니면 앱은 홈 대신 온보딩 흐름을 등록한다. 서버에 저장된 진행 단계(web에서 하던 진행 포함)에서 이어서 연다',
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
      intent: '브라우저에서 보호된 화면(/history)을 연다',
      behavior: 'requireSession이 온보딩 전 사용자를 /onboarding으로 보낸다',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: SESSION, symbol: 'requireSession' }],
      tests: ['web-require-session-onboarding', 'e2e-onboarding-redirect'],
      next: ['intro-web'],
    }),
    step({
      id: 'route-web-after-login',
      intent: '브라우저에서 로그인을 막 마친다',
      behavior:
        'completeLogin은 온보딩을 마치지 않은 사용자를 /onboarding으로, 마친 사용자를 복귀 경로로 보낸다',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'completeLogin' },
        { path: 'apps/web/src/app/(product)/page.tsx', symbol: 'Index' },
      ],
      tests: ['web-callback-onboarding', 'e2e-new-user-onboarding'],
      gaps: [
        {
          kind: 'runtime-unverified',
          note: '같은 기대의 E2E는 이 환경에서 실행하지 못했다',
          tests: ['e2e-new-user-onboarding'],
        },
      ],
      next: ['intro-web'],
    }),
    step({
      id: 'intro-app',
      intent: '앱에서 서비스 소개를 본다',
      behavior:
        '예시 3장(입력 → 끝난 일) · "시작하기" · 로그아웃을 보인다. 시작하기는 목적 선택 → 첫 사진 → 사진 확인으로 이어진다',
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
          note: '화면 컴포넌트 테스트가 없다(mobile 런타임 검증 수단 없음)',
        },
        {
          kind: 'code-not-found',
          note: '예시(영수증 · 공연 포스터 · 맛집 캡처)는 EXAMPLES 고정 문구다. 지출 기록 · 캘린더 등록 · 맛집 저장 코드는 없다 — finish-task-from-image 참고',
        },
      ],
      next: ['finish'],
      via: ['onboarding-first-photo'],
    }),
    step({
      id: 'intro-web',
      intent: '브라우저에서 서비스 소개를 보고 온보딩을 진행한다',
      behavior:
        '앱과 같은 예시와 "시작하기"를 보인다. 시작하기는 목적 선택 → 첫 사진(파일 선택) → 사진 확인 → 처리로 이어지고, 진행은 서버에 저장돼 다시 열면 그 단계로 간다. 앱 WebView 안에서는 로그아웃 버튼을 숨긴다',
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
          note: '예시는 고정 문구이며 해당 기능 코드는 없다 — finish-task-from-image 참고',
        },
      ],
      next: ['finish'],
      via: ['onboarding-first-photo'],
    }),
    step({
      id: 'finish',
      intent: '온보딩을 끝내고 홈으로 간다',
      behavior:
        '앱과 web 모두 첫 사진 처리 뒤 "다음 단계는 준비 중입니다."에서 멈춘다. 진행 저장(PUT /v1/onboarding)은 intro · purpose · first-image만 받고, onboarding_step을 complete로 바꾸는 코드 · endpoint가 없다',
      runtime: 'go-api',
      owner: 'api',
      status: 'not-found',
      docs: [{ document: 'local-development', heading: '앱 안 WebView 화면 보기' }],
      absence: [
        {
          terms: ["onboarding_step = 'complete'"],
          scope: ['apps/api/internal'],
          meaning: 'API 코드 어디에도 onboarding_step을 complete로 바꾸는 SQL이 없다',
        },
      ],
    }),
  ],
};
