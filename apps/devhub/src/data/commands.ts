import type { CommandRef, TestRef } from '../domain/model';

const script = (name: string) => ({ kind: 'package-script' as const, script: name });
const nxTarget = (project: string, target: string) => ({
  kind: 'nx-target' as const,
  project,
  target,
});

/**
 * Root `package.json` scripts, plus the `api` targets no script wraps.
 * `constraints` say why a command fails inside a sandboxed AI session.
 */
export const commands: CommandRef[] = [
  {
    id: 'dev',
    source: script('dev'),
    group: 'run',
    summary: 'dev target이 있는 프로젝트(web :3000 · api :8080 · devhub :3100)를 함께 띄운다',
    constraints: ['port-binding', 'database'],
  },
  {
    id: 'dev-web',
    source: script('dev:web'),
    group: 'run',
    summary: 'Next 개발 서버 (3000)',
    constraints: ['port-binding'],
  },
  {
    id: 'dev-mobile',
    source: script('dev:mobile'),
    group: 'run',
    summary: 'Expo Metro 개발 서버',
    constraints: ['port-binding'],
  },
  {
    id: 'dev-api',
    source: script('dev:api'),
    group: 'run',
    summary: 'Go API (8080). Postgres와 적용된 마이그레이션이 필요하다',
    constraints: ['port-binding', 'database'],
  },
  {
    id: 'dev-devhub',
    source: script('dev:devhub'),
    group: 'run',
    summary: 'DevHub 개발 서버 (3100). web(3000)과 함께 떠도 부딪히지 않는다',
    constraints: ['port-binding'],
  },
  {
    id: 'lint',
    source: script('lint'),
    group: 'check',
    summary: 'eslint · go vet · gofmt 검사 · 루트 eslint',
    constraints: [],
  },
  {
    id: 'typecheck',
    source: script('typecheck'),
    group: 'check',
    summary: 'tsc (TypeScript 프로젝트 전부)',
    constraints: [],
  },
  {
    id: 'test',
    source: script('test'),
    group: 'check',
    summary: 'Vitest · go test. DB 테스트는 TEST_DATABASE_URL이 없으면 skip',
    constraints: [],
  },
  {
    id: 'test-hooks',
    source: script('test:hooks'),
    group: 'check',
    summary: '.claude/hooks 회귀 테스트',
    constraints: [],
  },
  {
    id: 'devhub-check',
    source: script('devhub:check'),
    group: 'check',
    summary:
      'DevHub catalog이 지금 저장소와 맞는지만 본다(경로 · symbol · Nx project/target · 시나리오 근거 · 스냅샷). 캐시하지 않는다',
    constraints: [],
  },
  {
    id: 'e2e',
    source: script('e2e'),
    group: 'check',
    summary:
      'Playwright 두 벌: web-e2e(가짜 인증 API + next dev :3000)와 devhub-e2e(next dev :3100)',
    constraints: ['port-binding', 'browser-binaries'],
  },
  {
    id: 'build',
    source: script('build'),
    group: 'build',
    summary:
      'mobile을 뺀 build(web · api · devhub). Next 빌드의 Turbopack PostCSS 워커가 포트를 연다',
    constraints: ['port-binding'],
  },
  {
    id: 'verify',
    source: script('verify'),
    group: 'build',
    summary: 'format:check → lint → typecheck → test → test:hooks → build',
    constraints: ['port-binding'],
  },
  {
    id: 'health',
    source: script('health'),
    group: 'api',
    summary: '실행 중인 API의 /health 확인',
    constraints: ['running-service'],
  },
  {
    id: 'format',
    source: script('format'),
    group: 'workspace',
    summary: 'prettier --write (파일을 고친다)',
    constraints: [],
  },
  {
    id: 'format-check',
    source: script('format:check'),
    group: 'check',
    summary: 'prettier --check',
    constraints: [],
  },
  {
    id: 'graph',
    source: script('graph'),
    group: 'workspace',
    summary: 'Nx project graph를 브라우저로 연다',
    constraints: ['port-binding'],
  },
  {
    id: 'prepare',
    source: script('prepare'),
    group: 'workspace',
    summary: 'pnpm install이 husky git hook을 설치한다',
    constraints: [],
  },
  {
    id: 'api-migrate',
    source: nxTarget('api', 'migrate'),
    group: 'api',
    summary: 'Postgres 마이그레이션 적용 (Nx 내장 migrate와 다르다)',
    constraints: ['database'],
  },
  {
    id: 'api-swagger',
    source: nxTarget('api', 'swagger'),
    group: 'api',
    summary: 'swag 주석으로 apps/api/docs/swagger 재생성',
    constraints: [],
  },
  {
    id: 'api-swagger-check',
    source: nxTarget('api', 'swagger-check'),
    group: 'api',
    summary: 'Swagger 문서가 최신인지 검사만 한다',
    constraints: [],
  },
];

/** The root command that runs each kind of test (`test` runs Vitest and go test through Nx). */
export const RUNNER_COMMAND: Record<TestRef['runner'], string> = {
  vitest: 'test',
  'go-test': 'test',
  playwright: 'e2e',
  'node-test': 'test-hooks',
};
