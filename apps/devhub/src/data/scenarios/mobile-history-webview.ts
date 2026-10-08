import type { Scenario } from '../../domain/model';

import { step } from './step';

const SCREEN = 'apps/mobile/src/screens/WebContentScreen.tsx';
const JOB_PAGE = 'apps/web/src/app/(product)/history/[jobId]/page.tsx';

export const mobileHistoryWebView: Scenario = {
  id: 'mobile-history-webview',
  title: '앱 → 처리 결과 WebView',
  goal: '앱 홈의 최근 처리 항목을 누르면 그 처리 결과의 web 화면이 앱 안에서 셸 없이 열림',
  track: 'current',
  status: 'implemented',
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
  ],
  steps: [
    step({
      id: 'tap-recent',
      intent: '홈의 최근 처리 또는 확인이 필요한 처리 항목 누르기(전체는 전체 보기)',
      behavior:
        '항목마다 적용한 유형과 처리 방식 · 요약을 보이고, 누르면 그 작업의 결과 경로(/history/{소문자 uuid})로 WebContent를 엶. 규칙에 맞지 않는 id는 링크를 만들지 않음. 홈에는 최근 3개만 있고 전체 보기는 기록 탭으로 감. 기록 탭은 web 기록 목록(/history)을 WebView로 열고, 그 안의 결과 링크는 탭 위 새 화면으로 엶',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/screens/HomeScreen.tsx', symbol: 'HomeScreen' },
        { path: 'apps/mobile/src/app/MainTabs.tsx', symbol: 'MainTabs' },
        { path: 'apps/mobile/src/lib/web.ts', symbol: 'jobDetailPathOf' },
        { path: 'apps/mobile/src/components/home/RecentJobList.tsx', symbol: 'RecentJobList' },
        { path: 'libs/processing/src/lib/summary.ts', symbol: 'summarizeJob' },
        { path: 'libs/webview-bridge/src/lib/paths.ts', symbol: 'jobDetailPath' },
      ],
      contracts: ['processing-recent-job'],
      tests: ['processing-summarize', 'processing-summarize-check', 'bridge-job-path'],
      next: ['open-webview'],
    }),
    step({
      id: 'open-webview',
      intent: '(자동) 앱이 web 화면을 엶',
      behavior:
        'User-Agent 뒤에 SnapdoneApp/1을 붙여 WebView를 엶. 이 로그인을 아직 넘기지 않았으면 핸드오프부터 시작하고, Go는 돌아갈 경로가 허용 경로이거나 처리 결과 하나일 때만 받음. web origin의 허용 경로만 안에서 엶',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: SCREEN, symbol: 'WebContentScreen' },
        { path: 'apps/mobile/src/auth/webHandoff.ts', symbol: 'initialWebContent' },
        { path: 'apps/mobile/src/lib/web.ts', symbol: 'webViewNavigation' },
        { path: 'libs/webview-bridge/src/lib/paths.ts', symbol: 'isJobDetailPath' },
        { path: 'apps/api/internal/auth/handoff.go', symbol: 'allowedNext' },
        { path: 'libs/webview-bridge/src/lib/bridge.ts', symbol: 'inAppUserAgentName' },
      ],
      contracts: ['bridge-user-agent'],
      tests: [
        'mobile-webcontent-initial',
        'mobile-webview-navigation',
        'bridge-user-agent',
        'bridge-job-path-rejects',
        'go-handoff-allowed-next',
        'e2e-inapp-job-handoff',
      ],
      next: ['render'],
      via: ['webview-auth-handoff'],
    }),
    step({
      id: 'render',
      intent: '앱 안에서 처리 결과 보기',
      behavior:
        'web 서버가 User-Agent로 앱 안임을 판별해 헤더 · 사이드바 없이 본문만 렌더. 세션을 확인하고 서버의 작업을 읽어 결과를 보임. 사진은 저장하지 않아 이 화면에는 원본과 다시 처리가 없음. 다른 사용자 · 없는 작업은 찾을 수 없다고 함',
      runtime: 'mobile-webview',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/in-app.ts', symbol: 'isInAppRequest' },
        { path: 'apps/web/src/app/(product)/layout.tsx', symbol: 'ProductLayout' },
        { path: JOB_PAGE, symbol: 'JobResultPage' },
        { path: 'apps/web/src/lib/processing-jobs/api.ts', symbol: 'fetchJob' },
        {
          path: 'apps/web/src/components/processing/processing-result.tsx',
          symbol: 'ProcessingResult',
        },
        { path: 'apps/api/internal/httpserver/processing.go', symbol: 'handlers.processingJob' },
      ],
      apis: ['get-processing-job'],
      contracts: ['bridge-user-agent', 'processing-job-detail'],
      tests: [
        'web-job-fetch',
        'processing-present-legacy',
        'e2e-result-in-app',
        'e2e-result-not-found',
        'e2e-inapp-shell',
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
