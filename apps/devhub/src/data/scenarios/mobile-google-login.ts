import type { Scenario } from '../../domain/model';

import { step } from './step';

const GOOGLE = 'apps/mobile/src/auth/google.ts';
const CONTROLLER = 'apps/mobile/src/auth/controller.ts';
const OAUTH_HTTP = 'apps/api/internal/httpserver/oauth.go';

export const mobileGoogleLogin: Scenario = {
  id: 'mobile-google-login',
  title: '앱 Google 로그인',
  goal: '앱에서 Google로 로그인하고 온보딩 또는 홈으로 이동',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'data-access', heading: 'Mobile은 항상 직접 호출한다' }],
  gaps: [
    { kind: 'runtime-unverified', note: 'mobile 런타임 검증 수단이 없어 실기기 인수 남음' },
    { kind: 'external-unverified', note: '실제 Google 계정으로 인수하지 않음' },
    {
      kind: 'config-required',
      note: 'EXPO_PUBLIC_AUTH_REDIRECT_URI가 비면 Google 로그인 비활성. apps/mobile/.env.example 기본값은 빈 값',
    },
  ],
  steps: [
    step({
      id: 'open-sign-in',
      intent: '로그인 화면 보기',
      behavior:
        '로그인 수단 조회가 끝날 때까지 버튼을 잠그고, 서버가 Google을 주지 않거나 약관이 없으면 사용할 수 없다고 알림',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/screens/AuthScreen.tsx', symbol: 'AuthScreen' },
        { path: 'apps/mobile/src/components/auth/ProviderButton.tsx', symbol: 'ProviderButton' },
        { path: CONTROLLER, symbol: 'availability' },
      ],
      apis: ['get-auth-capabilities'],
      contracts: ['auth-provider'],
      tests: ['mobile-availability'],
      next: ['start'],
    }),
    step({
      id: 'start',
      intent: '"Google로 계속하기" 누르기',
      behavior:
        'PKCE proof를 만들어 SecureStore에 보관하고 Go에 platform=mobile로 시작 요청. https authorize URL만 받음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: CONTROLLER, symbol: 'createAuthController' },
        { path: GOOGLE, symbol: 'createGoogleSignIn' },
        { path: 'apps/mobile/src/auth/proof.ts', symbol: 'createProof' },
        { path: 'apps/mobile/src/auth/device.ts', symbol: 'expoProofCrypto' },
        { path: 'apps/mobile/src/auth/api.ts', symbol: 'authApi' },
        { path: OAUTH_HTTP, symbol: 'handlers.oauthStart' },
      ],
      apis: ['post-auth-oauth-start'],
      tests: ['mobile-google-flow'],
      next: ['consent'],
    }),
    step({
      id: 'consent',
      intent: '시스템 인증 브라우저에서 Google 계정을 고르고 동의',
      behavior: '제품 WebView가 아니라 openAuthSessionAsync로 연 OS 인증 세션에서 동의 화면 열림',
      runtime: 'system-auth-browser',
      owner: 'google-oidc',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/auth/device.ts', symbol: 'systemAuthBrowser' },
        { path: 'apps/api/internal/google/google.go', symbol: 'Client.AuthorizeURL' },
      ],
      next: ['callback', 'cancel'],
    }),
    step({
      id: 'cancel',
      intent: '인증 브라우저 닫기',
      behavior: '보관한 proof를 지우고 Go에 시작 취소를 알린 뒤 오류 없이 로그인 화면으로 복귀',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: GOOGLE, symbol: 'discardPending' },
        { path: OAUTH_HTTP, symbol: 'handlers.oauthCancel' },
      ],
      apis: ['post-auth-oauth-cancel'],
      tests: ['mobile-google-cancel', 'mobile-sign-in-cancel', 'go-oauth-cancel'],
    }),
    step({
      id: 'callback',
      intent: '(자동) Google이 API callback으로 돌려보냄',
      behavior:
        'Go가 사용자를 찾거나 만든 뒤 60초 result code만 붙여 앱 복귀 URI(서버 설정)로 redirect',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: OAUTH_HTTP, symbol: 'handlers.oauthCallback' },
        { path: 'apps/api/internal/auth/oauth.go', symbol: 'OAuth.Callback' },
      ],
      apis: ['get-auth-oauth-callback'],
      tests: ['go-oauth-mobile-login', 'go-oauth-callback-errors'],
      next: ['exchange'],
    }),
    step({
      id: 'exchange',
      intent: '(자동) 앱이 돌아온 주소로 로그인 완료',
      behavior:
        '복귀 URL을 검사하고 보관한 proof의 state와 비교한 뒤 verifier로 교환. credential을 SecureStore에 저장한 다음에야 로그인 상태로 전환. 앱이 꺼졌다 켜진 경우는 launch URL로 이어서 완료',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: GOOGLE, symbol: 'finishGoogleSignIn' },
        { path: 'apps/mobile/src/auth/callback.ts', symbol: 'parseOAuthCallback' },
        { path: 'apps/mobile/src/app/App.tsx', symbol: 'resumeFromLaunchUrl' },
        { path: OAUTH_HTTP, symbol: 'handlers.exchange' },
      ],
      apis: ['post-auth-exchange'],
      contracts: ['auth-session'],
      tests: [
        'mobile-callback-parse',
        'mobile-google-state-mismatch',
        'mobile-sign-in-save',
        'mobile-resume-cold-start',
        'go-oauth-exchange-once',
      ],
      next: ['choose-screen'],
    }),
    step({
      id: 'choose-screen',
      intent: '로그인 뒤 첫 화면 보기',
      behavior: 'onboardingStep이 complete면 홈, 아니면 온보딩 소개로 이동',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [{ path: 'apps/mobile/src/auth/model.ts', symbol: 'destinationFor' }],
      tests: ['mobile-destination-onboarding', 'mobile-destination-home'],
    }),
  ],
};
