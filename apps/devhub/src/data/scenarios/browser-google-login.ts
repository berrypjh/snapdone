import type { Scenario } from '../../domain/model';

import { step } from './step';

const OAUTH_HTTP = 'apps/api/internal/httpserver/oauth.go';

export const browserGoogleLogin: Scenario = {
  id: 'browser-google-login',
  title: '브라우저 Google 로그인',
  goal: '브라우저에서 Google로 로그인하고 원래 가려던 화면으로 복귀',
  track: 'current',
  status: 'implemented',
  docs: [
    { document: 'data-access', heading: 'Web은 서버에서 호출한다' },
    { document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' },
  ],
  gaps: [
    {
      kind: 'external-unverified',
      note: '실제 Google 계정으로 인수 안 함. E2E는 가짜 인증 API로 실행',
    },
  ],
  steps: [
    step({
      id: 'open-login',
      intent: '/login 열기',
      behavior:
        '이미 로그인했으면 복귀 경로로 보냄. 아니면 Go에서 로그인 수단을 받아 Google 버튼을 켜거나 끔(약관 링크가 없으면 production에서 끔)',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/login/page.tsx', symbol: 'LoginPage' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'fetchCapabilities' },
        { path: 'apps/web/src/lib/auth/config.ts', symbol: 'isSignUpAllowed' },
      ],
      apis: ['get-auth-capabilities', 'get-auth-session'],
      contracts: ['auth-provider'],
      tests: ['web-api-capabilities', 'go-capabilities', 'e2e-login-screen'],
      next: ['start'],
    }),
    step({
      id: 'start',
      intent: '"Google로 계속하기" 누르기',
      behavior:
        'Server Action이 Origin을 확인하고 PKCE verifier · state를 만들어 Go에 시작 요청. verifier는 HttpOnly preauth cookie에만 두고 Google 동의 화면으로 redirect',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/auth/google-login-form.tsx', symbol: 'GoogleLoginForm' },
        { path: 'apps/web/src/lib/auth/actions.ts', symbol: 'startGoogleLogin' },
        { path: 'apps/web/src/lib/auth/proof.ts', symbol: 'createLoginProof' },
        { path: 'apps/web/src/lib/auth/cookies.ts', symbol: 'encodePreauth' },
        { path: OAUTH_HTTP, symbol: 'handlers.oauthStart' },
      ],
      apis: ['post-auth-oauth-start'],
      tests: ['web-start-google', 'web-proof'],
      next: ['consent'],
    }),
    step({
      id: 'consent',
      intent: 'Google 화면에서 계정을 고르고 동의',
      behavior: 'Go가 만든 authorize URL로 Google 동의 화면 열림',
      runtime: 'browser',
      owner: 'google-oidc',
      status: 'implemented',
      source: [{ path: 'apps/api/internal/google/google.go', symbol: 'Client.AuthorizeURL' }],
      gaps: [{ kind: 'external-unverified', note: '실제 Google 화면은 자동 테스트가 거치지 않음' }],
      next: ['callback'],
    }),
    step({
      id: 'callback',
      intent: '(자동) Google이 브라우저를 API로 돌려보냄',
      behavior:
        'Go가 state를 확인하고 Google token을 교환해 사용자를 찾거나 만든 뒤, 60초 일회용 result code만 붙여 web /auth/callback으로 redirect. 실패 로그는 원인에 따라 기록 — 사용자 취소는 Info, 맞지 않거나 이미 쓴 state는 Warn, Google · DB 장애는 Error',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: OAUTH_HTTP, symbol: 'handlers.oauthCallback' },
        { path: 'apps/api/internal/auth/oauth.go', symbol: 'OAuth.Callback' },
        { path: 'apps/api/internal/google/google.go', symbol: 'Client.Exchange' },
        { path: 'apps/api/internal/auth/store.go', symbol: 'Store.FindOrCreateUser' },
      ],
      apis: ['get-auth-oauth-callback'],
      tests: ['go-oauth-web-returning', 'go-oauth-callback-errors', 'go-callback-log-level'],
      next: ['exchange'],
    }),
    step({
      id: 'exchange',
      intent: '(자동) web이 result code를 로그인 세션으로 교환',
      behavior:
        'Route Handler가 preauth cookie의 state를 비교하고 verifier로 Go와 교환. HttpOnly session cookie를 두고 preauth를 지운 뒤 code 없는 주소로 303 redirect',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/auth/callback/route.ts', symbol: 'GET' },
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'handleOAuthCallback' },
        { path: 'apps/web/src/lib/auth/callback.ts', symbol: 'completeLogin' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'exchangeResultCode' },
        { path: OAUTH_HTTP, symbol: 'handlers.exchange' },
      ],
      apis: ['post-auth-exchange'],
      contracts: ['auth-session'],
      tests: [
        'web-callback-exchange',
        'web-callback-cookie',
        'go-oauth-exchange-once',
        'e2e-login-no-preauth',
      ],
      next: ['return'],
    }),
    step({
      id: 'return',
      intent: '로그인 전에 가려던 화면으로 복귀',
      behavior:
        '허용 목록(/ · /history · /onboarding)과 정확히 같은 경로만 복귀하고 그 외는 홈으로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: 'apps/web/src/lib/auth/redirect.ts', symbol: 'safeReturnPath' }],
      tests: ['web-return-path', 'e2e-returning-user', 'e2e-login-outside-return'],
    }),
  ],
};
