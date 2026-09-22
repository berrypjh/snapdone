import type { ExternalSystemRef } from '../domain/model';

export const externalSystems: ExternalSystemRef[] = [
  {
    kind: 'external',
    id: 'browser',
    name: '브라우저',
    summary:
      '사용자의 브라우저. web에서 HTML을 받고 Server Action · Route Handler 호출. Go API는 직접 부르지 않음',
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
    summary:
      '사용자 · 세션 · 일회용 grant · 온보딩 진행 · 사진 처리 작업 저장소. 사진 자체는 저장하지 않음. 로컬은 Docker compose',
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
  {
    kind: 'external',
    id: 'image-model',
    name: '이미지 분류 모델',
    summary:
      '사진을 받아 무엇을 하려던 것인지 분류하는 모델. 환경변수로 Claude API 또는 OpenAI 호환 서버(OpenAI · 로컬 Ollama) 선택. 설정하지 않으면 사진 처리 꺼짐',
    evidence: [
      { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.Classify' },
      { path: 'apps/api/internal/processing/openai.go', symbol: 'OpenAIClassifier.Classify' },
      { path: 'apps/api/internal/config/processing.go', symbol: 'loadProcessing' },
    ],
    docs: [{ document: 'local-development', heading: '온보딩 처음부터 보기' }],
  },
];
