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
        '셸(헤더 · 사이드바 · 로그아웃) 안에서 처리한 사진의 최근 처리 기록을 서버에서 읽어 보임. 온보딩 첫 사진은 온보딩을 마친 뒤에 들어감. 읽지 못하면 비었다고 하지 않고 그렇다고 알림. 사진은 저장하지 않아 기록에 사진이 없음',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/app-shell.tsx', symbol: 'AppShell' },
        { path: HISTORY, symbol: 'HistoryPage' },
        { path: 'apps/web/src/lib/processing-jobs/api.ts', symbol: 'fetchRecentJobs' },
        { path: 'apps/web/src/components/home/recent-jobs.tsx', symbol: 'RecentJobs' },
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
        '/history/{소문자 uuid}로 그 작업의 결과를 보임. 로그인 뒤에는 이 결과로 돌아옴. 다른 사용자 · 없는 작업은 찾을 수 없다고 하고, 원본 사진 · 다시 처리는 없음',
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
    }),
  ],
};
