import type { Scenario } from '../../domain/model';

import { step } from './step';

export const logoutSessionRevocation: Scenario = {
  id: 'logout-session-revocation',
  title: '로그아웃 · 세션 취소',
  goal: '로그아웃하면 이 기기의 로그인이 끝나고 서버 세션도 취소',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'foundation', heading: 'Web Shell' }],
  gaps: [{ kind: 'runtime-unverified', note: '앱 로그아웃은 단위 테스트까지' }],
  steps: [
    step({
      id: 'web-logout',
      intent: '브라우저 헤더에서 "로그아웃" 누르기',
      behavior:
        'Server Action이 Origin을 확인하고 Go에 세션 취소를 요청한 뒤, Go가 실패해도 session cookie를 지우고 /login으로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/app-shell.tsx', symbol: 'AppShell' },
        { path: 'apps/web/src/lib/auth/actions.ts', symbol: 'logout' },
        { path: 'apps/web/src/lib/auth/api.ts', symbol: 'revokeSession' },
        { path: 'apps/web/src/lib/auth/config.ts', symbol: 'isAllowedOrigin' },
      ],
      apis: ['post-auth-logout'],
      tests: ['web-logout-revokes', 'web-logout-unreachable', 'web-logout-origin', 'e2e-logout'],
      next: ['revoke'],
    }),
    step({
      id: 'app-logout',
      intent: '앱 헤더에서 "로그아웃" 누르기',
      behavior:
        '서버 취소를 시도하고 SecureStore credential을 지워 로그인 화면으로 전환. 기기 삭제 실패와 서버 취소 미완료를 다른 알림으로 구분',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/components/auth/LogoutButton.tsx', symbol: 'LogoutButton' },
        { path: 'apps/mobile/src/auth/controller.ts', symbol: 'createAuthController' },
        { path: 'apps/mobile/src/components/auth/authCopy.ts', symbol: 'LOGOUT_NOT_REVOKED' },
      ],
      apis: ['post-auth-logout'],
      tests: [
        'mobile-logout',
        'mobile-logout-unreachable',
        'mobile-logout-delete-fails',
        'mobile-copy-logout',
      ],
      next: ['revoke'],
    }),
    step({
      id: 'revoke',
      intent: '(자동) 서버가 세션 취소',
      behavior:
        '토큰 해시로 세션 취소. 앱의 root 세션을 취소하면 그 아래 WebView child 세션도 무효',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/httpserver/auth.go', symbol: 'handlers.logout' },
        { path: 'apps/api/internal/auth/session.go', symbol: 'Store.RevokeSession' },
      ],
      apis: ['post-auth-logout'],
      tests: ['go-logout-revokes', 'go-revoke-root-children'],
    }),
  ],
};
