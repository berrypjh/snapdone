import type { Scenario } from '../../domain/model';

import { step } from './step';

const SESSION = 'apps/web/src/lib/auth/session.ts';
const HISTORY = 'apps/web/src/app/(product)/history/page.tsx';

export const protectedHistoryAccess: Scenario = {
  id: 'protected-history-access',
  title: '보호된 기록 화면 접근',
  goal: '브라우저에서 기록 화면은 로그인하고 온보딩을 마친 사용자만 볼 수 있음',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'foundation', heading: 'Web Shell' }],
  gaps: [
    {
      kind: 'code-not-found',
      note: '접근 제어는 구현됐지만 기록 내용은 고정 빈 상태 문구. 기록 데이터 · API 없음',
    },
  ],
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
      behavior: '헤더 · 사이드바(홈 · 기록) · 로그아웃이 있는 셸 안에 기록 page를 렌더',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/app-shell.tsx', symbol: 'AppShell' },
        { path: HISTORY, symbol: 'HistoryPage' },
      ],
      tests: ['web-require-session-complete', 'e2e-protected-direct'],
    }),
  ],
};
