import type { Scenario } from '../../domain/model';

import { step } from './step';

const WEB_HANDOFF = 'apps/web/src/lib/auth/handoff.ts';
const APP_HANDOFF = 'apps/mobile/src/auth/webHandoff.ts';
const HTTP_HANDOFF = 'apps/api/internal/httpserver/handoff.go';
const AUTH_HANDOFF = 'apps/api/internal/auth/handoff.go';

export const webViewAuthHandoff: Scenario = {
  id: 'webview-auth-handoff',
  title: 'WebView 로그인 핸드오프',
  goal: '앱에 로그인한 채로 연 web 화면이 따로 로그인하지 않아도 같은 사용자로 열린다',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'data-access', heading: 'WebView 로그인 핸드오프' }],
  gaps: [{ kind: 'runtime-unverified', note: '앱 쪽 단계는 단위 테스트까지다' }],
  steps: [
    step({
      id: 'start',
      intent: '(자동) WebView가 핸드오프 시작 주소를 연다',
      behavior:
        'web 서버가 이 WebView만 가진 verifier를 2분짜리 HttpOnly cookie에 두고 ready page로 303 redirect한다. next는 허용 경로로 바꾼다',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/auth/handoff/start/route.ts', symbol: 'GET' },
        { path: WEB_HANDOFF, symbol: 'handleHandoffStart' },
        { path: 'apps/web/src/lib/auth/cookies.ts', symbol: 'HANDOFF_MAX_AGE_SECONDS' },
      ],
      tests: ['web-handoff-start', 'e2e-inapp-challenge'],
      next: ['ready'],
    }),
    step({
      id: 'ready',
      intent: '(자동) web이 앱에 challenge를 알린다',
      behavior:
        'ready page가 verifier의 S256 challenge만 handoff-ready로 보낸다. verifier cookie가 없으면 auth-required를 보낸다',
      runtime: 'mobile-webview',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/auth/handoff/ready/page.tsx', symbol: 'HandoffReadyPage' },
        { path: WEB_HANDOFF, symbol: 'handoffChallenge' },
        { path: 'apps/web/src/components/in-app-message.tsx', symbol: 'InAppMessage' },
      ],
      contracts: ['bridge-handoff-ready', 'bridge-auth-required'],
      tests: [
        'web-handoff-challenge',
        'e2e-inapp-challenge',
        'e2e-inapp-no-verifier',
        'bridge-auth-messages',
      ],
      next: ['request-code'],
    }),
    step({
      id: 'request-code',
      intent: '(자동) 앱이 코드를 요청한다',
      behavior:
        '자기가 연 ready page에서 온 메시지만 받는다. 저장된 credential과 challenge로 Go에 코드를 요청하고, 받은 코드로 교환 주소를 연다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: APP_HANDOFF, symbol: 'receiveMessage' },
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'startHandoff' },
        { path: 'apps/mobile/src/auth/api.ts', symbol: 'authApi' },
        { path: APP_HANDOFF, symbol: 'openExchange' },
      ],
      apis: ['post-auth-handoff-start'],
      contracts: ['bridge-handoff-ready'],
      tests: [
        'mobile-webcontent-handoff-once',
        'mobile-webcontent-foreign-origin',
        'mobile-start-handoff',
        'mobile-webcontent-exchange-url',
      ],
      next: ['issue-code'],
    }),
    step({
      id: 'issue-code',
      intent: '(자동) API가 일회용 코드를 발급한다',
      behavior:
        'root mobile 세션만 받아 30초 일회용 코드를 만든다. 코드와 challenge는 해시로만 저장한다',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: HTTP_HANDOFF, symbol: 'handlers.handoffStart' },
        { path: AUTH_HANDOFF, symbol: 'Handoff.Start' },
      ],
      apis: ['post-auth-handoff-start'],
      tests: ['go-handoff-root-mobile-only'],
      next: ['exchange'],
    }),
    step({
      id: 'exchange',
      intent: '(자동) web이 코드를 이 WebView의 세션으로 바꾼다',
      behavior:
        'web 서버가 verifier cookie와 코드로 Go와 교환해 앱 세션 아래 child 세션을 받는다. 기존 session cookie를 덮어쓰고 code 없는 주소로 303 redirect한다. verifier가 없는 브라우저는 세션을 받지 못한다',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(auth)/auth/handoff/route.ts', symbol: 'GET' },
        { path: WEB_HANDOFF, symbol: 'handleHandoff' },
        { path: WEB_HANDOFF, symbol: 'completeHandoff' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'exchangeHandoffCode' },
        { path: HTTP_HANDOFF, symbol: 'handlers.handoffExchange' },
        { path: AUTH_HANDOFF, symbol: 'Handoff.Exchange' },
      ],
      apis: ['post-auth-handoff-exchange'],
      contracts: ['auth-session'],
      tests: [
        'web-handoff-exchange',
        'web-handoff-cookie',
        'web-handoff-no-verifier',
        'go-handoff-child-session',
        'go-handoff-proof',
        'e2e-handoff-replace',
        'e2e-handoff-once',
        'e2e-inapp-other-browser',
      ],
      next: ['open-page'],
    }),
    step({
      id: 'open-page',
      intent: '요청했던 화면을 로그인된 상태로 본다',
      behavior: '보호 page가 새 child 세션으로 열린다',
      runtime: 'mobile-webview',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(product)/history/page.tsx', symbol: 'HistoryPage' },
        { path: 'apps/web/src/lib/auth/session.ts', symbol: 'requireSession' },
      ],
      tests: ['e2e-inapp-protected'],
    }),
  ],
};
