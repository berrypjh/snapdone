/**
 * .claude/hooks/guard-bash.mjs 회귀 테스트.
 *
 * 정규식만 직접 검사하지 않고 훅 프로세스를 실제로 실행한다.
 * 차단 규칙뿐 아니라 stdin 입력과 stdout 응답 형식까지 함께 검증하기 위해서다.
 *
 * 실행:
 *   node --test tools/scripts/
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../../.claude/hooks/guard-bash.mjs', import.meta.url));

/**
 * Bash 명령을 훅에 전달한다.
 * 허용된 명령이면 null, 차단된 명령이면 차단 사유를 반환한다.
 */
const decide = (command) => {
  const stdout = execFileSync('node', [HOOK], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
  });

  if (!stdout.trim()) {
    return null;
  }

  const { hookSpecificOutput } = JSON.parse(stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
};

const BLOCKED_PORT = [
  'pnpm dev:web',
  'pnpm run dev:api',
  'nx dev web',
  'npx nx dev web',
  'nx start mobile',
  'nx run-many -t dev',
  'pnpm e2e',
  'nx e2e web-e2e',
  'npx nx run-many -t e2e',
  'nx build web',
  'npx nx build web --skip-nx-cache',
  'nx run web:build',
];

const BLOCKED_SECRET = [
  "printf 'x' > apps/web/probe.key",
  "node -e \"require('fs').readFileSync('.env')\"",
  'grep . .env.local',
  'cat .env > /tmp/x',
  'python3 -c "print(open(\'.env.production.local\').read())"',
  'base64 apps/mobile/signing.p12',
  'cp .env /tmp/leak',
  'xxd certs/apple.p8',
];

const ALLOWED = [
  // 현재 실행 환경에서 사용하는 기본 검증 명령.
  'pnpm verify',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm format:check',

  // 전체 빌드가 중간에 멈추더라도 앞 단계의 검증 결과는 확인할 가치가 있다.
  'pnpm build',
  'nx build api',
  'nx test web',
  'pnpm exec nx export mobile',

  // 별도 permission 정책에서 처리하므로 Bash 훅에서는 중복 차단하지 않는다.
  'nx build mobile',
  'eas build --platform ios',

  // 실제 secret이 아닌 공개용 환경변수 템플릿.
  'cat apps/web/.env.example',
  'grep API_BASE_URL apps/web/.env.example',

  // 차단에 사용될 수 있는 명령이라도 secret 경로가 아니면 허용한다.
  'echo hello > /tmp/out.txt',
  'grep -rn "onClick" apps/web/src --include="*.tsx"',
  'base64 apps/web/public/logo.png',
  'node tools/scripts/check-api-health.mjs',

  // 일반적인 개발 명령.
  'git status --porcelain',
  'git diff -- apps/web',
  'ls -la apps/web/.next',
  'gofmt -l apps/api',

  // 문자열 안에 차단 대상 명령이 포함되어 있어도 실제 실행이 아니면 허용해야 한다.
  // 문서 검색, 테스트 수정, 로그 조회 같은 작업을 과차단하지 않는지 확인한다.
  'grep -rn "pnpm dev:web" docs/',
  "grep -rl 'nx build web' AGENTS.md docs/",
  'echo "run pnpm e2e first" >> notes.md',
  'git log --grep="nx dev web"',
];

describe('포트 바인딩으로 이 환경에서 실패하는 명령', () => {
  for (const command of BLOCKED_PORT) {
    test(command, () => {
      const reason = decide(command);
      assert.ok(reason, '차단되지 않았다');
      assert.match(reason, /포트 바인딩/);
    });
  }
});

describe('Read deny가 닿지 않는 secret 접근', () => {
  for (const command of BLOCKED_SECRET) {
    test(command, () => {
      const reason = decide(command);
      assert.ok(reason, '차단되지 않았다');
      assert.match(reason, /secret 파일/);
    });
  }
});

describe('통과해야 하는 명령', () => {
  for (const command of ALLOWED) {
    test(command, () => {
      assert.equal(decide(command), null, '과차단됐다');
    });
  }
});

describe('입력이 깨져도 통과시킨다', () => {
  const run = (input) => execFileSync('node', [HOOK], { input, encoding: 'utf8' });

  test('JSON이 아님', () => assert.equal(run('not json').trim(), ''));
  test('빈 객체', () => assert.equal(run('{}').trim(), ''));
  test('command 없음', () => assert.equal(run('{"tool_input":{}}').trim(), ''));
  test('Bash가 아닌 tool', () =>
    assert.equal(run('{"tool_name":"Read","tool_input":{"file_path":".env"}}').trim(), ''));
});
