import type { Scenario } from '../../domain/model';

import { step } from './step';

const SCREEN = 'apps/mobile/src/screens/WebContentScreen.tsx';

export const mobileHistoryWebView: Scenario = {
  id: 'mobile-history-webview',
  title: '앱 → 기록 WebView',
  goal: '앱 홈에서 기록 화면을 열면 web 화면이 앱 안에서 셸 없이 열림',
  track: 'current',
  status: 'partial',
  docs: [
    { document: 'target-architecture', heading: '런타임 계약' },
    { document: 'foundation', heading: 'Mobile Shell' },
    { document: 'local-development', heading: '앱 안 WebView 화면 보기' },
  ],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: '앱 쪽은 단위 테스트까지. web 쪽은 E2E가 앱 User-Agent를 흉내 내 검증',
    },
    {
      kind: 'code-not-found',
      note: '홈에 기록 진입점이 없음. 기록이 빈 placeholder라 홈에서 보내지 않음. /history는 WebView 허용 경로에 남아 있고, 홈의 "기본 처리 설정"이 같은 WebView 화면으로 /settings/processing을 엶',
    },
  ],
  steps: [
    step({
      id: 'tap-history',
      intent: '홈에서 기록 열기',
      behavior:
        '(진입점 없음) WebContent route(path · title)는 있지만 홈에 기록으로 가는 버튼이 없음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'not-found',
      absence: [
        {
          terms: ["'/history'"],
          scope: ['apps/mobile/src/screens', 'apps/mobile/src/components', 'apps/mobile/src/app'],
          meaning:
            '앱 화면 · 컴포넌트에 기록(/history)을 여는 코드 없음. WebView 허용 경로(lib/web.ts)에만 남음',
        },
      ],
      gaps: [{ kind: 'code-not-found', note: '홈의 "기록 보기" 버튼을 뺌' }],
      next: ['open-webview'],
    }),
    step({
      id: 'open-webview',
      intent: '(자동) 앱이 web 화면을 엶',
      behavior:
        'User-Agent 뒤에 SnapdoneApp/1을 붙여 WebView를 엶. 이 로그인을 아직 넘기지 않았으면 핸드오프부터 시작, web origin의 허용 경로만 안에서 엶',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: SCREEN, symbol: 'WebContentScreen' },
        { path: 'apps/mobile/src/auth/webHandoff.ts', symbol: 'initialWebContent' },
        { path: 'apps/mobile/src/lib/web.ts', symbol: 'webViewNavigation' },
        { path: 'libs/webview-bridge/src/lib/bridge.ts', symbol: 'inAppUserAgentName' },
      ],
      contracts: ['bridge-user-agent'],
      tests: ['mobile-webcontent-initial', 'mobile-webview-navigation', 'bridge-user-agent'],
      next: ['render'],
      via: ['webview-auth-handoff'],
    }),
    step({
      id: 'render',
      intent: '앱 안에서 기록 화면 보기',
      behavior:
        'web 서버가 User-Agent로 앱 안임을 판별해 헤더 · 사이드바 없이 본문만 렌더. 보호 page라 세션 확인',
      runtime: 'mobile-webview',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/in-app.ts', symbol: 'isInAppRequest' },
        { path: 'apps/web/src/app/(product)/layout.tsx', symbol: 'ProductLayout' },
        { path: 'apps/web/src/components/app-shell.tsx', symbol: 'AppShell' },
        { path: 'apps/web/src/app/(product)/history/page.tsx', symbol: 'HistoryPage' },
      ],
      contracts: ['bridge-user-agent'],
      tests: ['e2e-inapp-shell', 'e2e-inapp-protected'],
      gaps: [
        {
          kind: 'code-not-found',
          note: '기록 내용은 고정 빈 상태 문구("아직 기록이 없습니다."). 기록 데이터 · API 없음',
        },
      ],
      next: ['title'],
    }),
    step({
      id: 'title',
      intent: '(자동) 앱 헤더 제목이 web 화면 제목으로 변경',
      behavior:
        'web이 ready 메시지로 제목을 보내고, 앱은 web origin에서 온 메시지만 받아 헤더 제목 변경',
      runtime: 'mobile-webview',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/in-app-ready.tsx', symbol: 'InAppReady' },
        { path: 'apps/web/src/components/in-app-message.tsx', symbol: 'InAppMessage' },
        { path: 'apps/mobile/src/auth/webHandoff.ts', symbol: 'receiveMessage' },
      ],
      contracts: ['bridge-ready'],
      tests: [
        'e2e-inapp-ready',
        'mobile-webcontent-title',
        'mobile-webcontent-foreign-origin',
        'bridge-ready',
      ],
    }),
  ],
};
