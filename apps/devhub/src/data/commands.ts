import type { CommandRef, TestRef } from '../domain/model';

const script = (name: string) => ({ kind: 'package-script' as const, script: name });

/**
 * 루트 `package.json`의 script 전부. api target도 루트 script(`migrate` · `swagger` · `eval` 등)가 감싼다.
 * `constraints`는 샌드박스 AI 세션에서 그 명령이 왜 실패하는지 말한다.
 */
export const commands: CommandRef[] = [
  {
    id: 'dev',
    source: script('dev'),
    group: 'run',
    summary: 'dev target이 있는 프로젝트(web :3000 · api :8080 · devhub :3100)를 함께 띄움',
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
    summary: 'Go API (8080). Postgres와 적용된 마이그레이션 필요',
    constraints: ['port-binding', 'database'],
  },
  {
    id: 'dev-devhub',
    source: script('dev:devhub'),
    group: 'run',
    summary: 'DevHub 개발 서버 (3100). web(3000)과 함께 떠도 충돌 없음',
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
      'DevHub catalog이 지금 저장소와 맞는지만 확인(경로 · symbol · Nx project/target · 시나리오 근거 · 스냅샷). 캐시하지 않음',
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
      'mobile을 뺀 build(web · api · devhub). Next 빌드의 Turbopack PostCSS 워커가 포트를 엶',
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
    summary: 'prettier --write (파일 수정)',
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
    id: 'prepare',
    source: script('prepare'),
    group: 'workspace',
    summary: 'pnpm install이 husky git hook 설치',
    constraints: [],
  },
  {
    id: 'api-migrate',
    source: script('migrate'),
    group: 'api',
    summary: 'Postgres 마이그레이션 적용 (Nx 내장 migrate와 다름)',
    constraints: ['database'],
  },
  {
    id: 'api-swagger',
    source: script('swagger'),
    group: 'api',
    summary: 'swag 주석으로 apps/api/docs/swagger 재생성',
    constraints: [],
  },
  {
    id: 'api-eval',
    source: script('eval'),
    group: 'api',
    summary:
      '평가 harness CLI(go run ./cmd/eval). list · validate · plan · replay · report · compare는 모델을 부르지 않고, run은 --allow-api와 --max-api-calls가 있을 때만 실제 provider를 부름',
    constraints: [],
  },
  {
    id: 'api-eval-check',
    source: script('eval:check'),
    group: 'check',
    summary:
      '평가 harness의 offline Go 테스트와 sample dataset 구조 검증 · readiness 출력. 모델 호출 없음, 캐시 없음',
    constraints: [],
  },
  {
    id: 'api-swagger-check',
    source: script('swagger:check'),
    group: 'api',
    summary: 'Swagger 문서가 최신인지 검사만 함',
    constraints: [],
  },
];

/** 테스트 종류마다 돌리는 루트 명령(`test`는 Nx로 Vitest와 go test를 함께 돌린다). */
export const RUNNER_COMMAND: Record<TestRef['runner'], string> = {
  vitest: 'test',
  'go-test': 'test',
  playwright: 'e2e',
  'node-test': 'test-hooks',
};
