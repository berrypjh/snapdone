import type { Scenario } from '../../domain/model';

import { step } from './step';

const SESSION = 'apps/web/src/lib/auth/session.ts';
const HISTORY = 'apps/web/src/app/(product)/history/page.tsx';

export const protectedHistoryAccess: Scenario = {
  id: 'protected-history-access',
  title: '보호된 기록 화면 접근',
  goal: '브라우저에서 처리 기록과 결과는 로그인하고 온보딩을 마친 사용자 자신의 것만 볼 수 있음',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'foundation', heading: 'Web Shell' }],
  gaps: [],
  steps: [
    step({
      id: 'visit',
      intent: '/history 열기',
      behavior:
        'page가 요청 cookie의 credential로 Go에 세션 확인. layout이 아니라 page 안에서 확인',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: HISTORY, symbol: 'HistoryPage' },
        { path: SESSION, symbol: 'requireSession' },
        { path: SESSION, symbol: 'getSession' },
        { path: SESSION, symbol: 'readCredential' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'fetchSession' },
        { path: 'apps/api/internal/httpserver/auth.go', symbol: 'handlers.session' },
      ],
      apis: ['get-auth-session'],
      contracts: ['auth-session'],
      tests: ['web-api-session-rejected', 'go-session-public-fields', 'go-session-rejects-unknown'],
      next: ['to-login', 'to-onboarding', 'render'],
    }),
    step({
      id: 'to-login',
      intent: '로그인하지 않았거나 세션이 만료된 채로 진입',
      behavior: '/login?next=/history로 보냄. 로그인하면 /history로 복귀',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: SESSION, symbol: 'requireSignedIn' }],
      tests: [
        'web-require-session-login',
        'web-require-session-rejected',
        'e2e-login-protected-redirect',
        'e2e-stale-cookie',
      ],
      via: ['browser-google-login'],
      next: ['visit'],
    }),
    step({
      id: 'to-onboarding',
      intent: '로그인했지만 온보딩을 마치지 않음',
      behavior: '/onboarding으로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: SESSION, symbol: 'requireSession' }],
      tests: ['web-require-session-onboarding', 'e2e-onboarding-redirect'],
      via: ['onboarding-intro'],
    }),
    step({
      id: 'render',
      intent: '기록 화면 보기',
      behavior:
        '셸(헤더 · 넓은 화면 사이드바 · 폰 폭 하단 탭) 안에서 처리한 사진의 최근 처리 기록을 서버에서 읽어 한국 날짜(오늘 · 어제 · 날짜)로 묶어 보임. 항목은 제목 · 시각 한 줄과 결과 앞부분 한 줄이고, 마치지 못한 처리만 상태를 보임. 온보딩 첫 사진은 온보딩을 마친 뒤에 들어감. 읽지 못하면 비었다고 하지 않고 그렇다고 알림. 사진은 저장하지 않아 기록에 사진이 없음',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/app-shell.tsx', symbol: 'AppShell' },
        { path: HISTORY, symbol: 'HistoryPage' },
        { path: 'apps/web/src/lib/processing-jobs/api.ts', symbol: 'fetchRecentJobs' },
        { path: 'apps/web/src/components/recent-jobs.tsx', symbol: 'RecentJobs' },
        { path: 'apps/web/src/lib/processing-jobs/days.ts', symbol: 'groupByDay' },
        { path: 'apps/api/internal/httpserver/processing.go', symbol: 'handlers.processingJobs' },
        { path: 'apps/api/internal/processing/store.go', symbol: 'Store.Recent' },
      ],
      apis: ['get-processing-jobs'],
      contracts: ['processing-recent-job'],
      tests: [
        'web-require-session-complete',
        'e2e-protected-direct',
        'web-recent-jobs',
        'processing-go-wire',
        'go-http-recent',
        'go-http-recent-outcome',
        'go-recent-origins',
        'go-http-recent-origins',
        'e2e-history-unreadable',
      ],
      next: ['open-job'],
    }),
    step({
      id: 'open-job',
      intent: '기록 하나를 열어 처리 결과 보기',
      behavior:
        '/history/{소문자 uuid}로 그 작업의 결과를 보임. 로그인 뒤에는 이 결과로 돌아옴. 다른 사용자 · 없는 작업은 찾을 수 없다고 하고, 원본 사진 · 다시 처리는 없음. 고정 헤더 왼쪽 "‹ 처리 결과"로 기록에 돌아감(앱 안에서는 네이티브 헤더)',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(product)/history/[jobId]/page.tsx', symbol: 'JobResultPage' },
        { path: 'apps/web/src/lib/auth/redirect.ts', symbol: 'safeReturnPath' },
        { path: 'libs/webview-bridge/src/lib/paths.ts', symbol: 'jobDetailPath' },
      ],
      apis: ['get-processing-job'],
      contracts: ['processing-job-detail'],
      tests: ['e2e-history-list', 'e2e-history-owner', 'e2e-result-signed-out', 'go-job-owner'],
      next: ['delete-job', 'delete-many'],
    }),
    step({
      id: 'delete-job',
      intent: '처리 결과 아래에서 기록 삭제',
      behavior:
        '되돌릴 수 없어 누르면 그 자리에서 한 번 더 확인받음. 확인하면 Server Action이 Origin을 확인하고 Go에 삭제를 요청한 뒤 기록 목록으로 감. 본인 작업만 지우고, 이 작업을 다시 처리한 작업은 남고 연결만 끊김. 이미 없는 작업도 지운 것으로 봄. 서버에 닿지 못하면 그 자리에서 다시 시도',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/processing/delete-record.tsx', symbol: 'DeleteRecord' },
        { path: 'apps/web/src/lib/processing-jobs/actions.ts', symbol: 'deleteRecord' },
        { path: 'apps/web/src/lib/processing-jobs/api.ts', symbol: 'deleteJob' },
        {
          path: 'apps/api/internal/httpserver/processing.go',
          symbol: 'handlers.deleteProcessingJob',
        },
        { path: 'apps/api/internal/processing/store.go', symbol: 'Store.Delete' },
      ],
      apis: ['delete-processing-job'],
      tests: ['e2e-history-delete', 'go-http-delete', 'go-delete-job'],
    }),
    step({
      id: 'delete-many',
      intent: '기록 목록에서 "선택"으로 여러 개를 골라 한 번에 삭제',
      behavior:
        '선택을 누를 때만 체크박스가 나오고 날짜 묶음마다 전체 선택이 있음. 화면 아래 "선택한 N개 삭제"는 한 번 더 확인받은 뒤 Go에 1~20개를 한 번에 보내 한 문장으로 지움(일부만 남지 않음). 본인 작업만 세고, 지운 개수를 알린 뒤 목록을 서버에서 다시 읽음',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/history/history-list.tsx', symbol: 'HistoryList' },
        { path: 'apps/web/src/lib/processing-jobs/actions.ts', symbol: 'deleteRecords' },
        { path: 'apps/web/src/lib/processing-jobs/api.ts', symbol: 'deleteJobs' },
        {
          path: 'apps/api/internal/httpserver/processing.go',
          symbol: 'handlers.deleteProcessingJobs',
        },
        { path: 'apps/api/internal/processing/store.go', symbol: 'Store.DeleteMany' },
      ],
      apis: ['delete-processing-jobs'],
      tests: ['e2e-history-delete-many', 'go-http-delete-many', 'go-delete-many'],
    }),
  ],
};
