import type { ExternalSystemRef } from '../domain/model';

export const externalSystems: ExternalSystemRef[] = [
  {
    kind: 'external',
    id: 'browser',
    name: '브라우저',
    summary:
      '사용자의 브라우저. web에서 HTML을 받고 Server Action · Route Handler를 부른다. Go API는 직접 부르지 않는다',
    evidence: [
      { path: 'apps/web/src/app/layout.tsx', symbol: 'RootLayout' },
      { path: 'apps/web/src/lib/auth/actions.ts', symbol: 'startGoogleLogin' },
    ],
    docs: [{ document: 'data-access', heading: 'Web은 서버에서 호출한다' }],
  },
  {
    kind: 'external',
    id: 'postgres',
    name: 'PostgreSQL',
    summary: '사용자 · 세션 · 일회용 grant 저장소. 로컬은 Docker compose',
    evidence: [
      { path: 'apps/api/internal/database/database.go', symbol: 'Open' },
      { path: 'apps/api/compose.yaml' },
    ],
    docs: [{ document: 'local-development', heading: '로컬 Postgres' }],
  },
  {
    kind: 'external',
    id: 'google-oidc',
    name: 'Google OIDC',
    summary: 'Google 로그인 동의 화면과 token endpoint',
    evidence: [{ path: 'apps/api/internal/google/google.go', symbol: 'Client.Exchange' }],
    docs: [{ document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' }],
  },
];
