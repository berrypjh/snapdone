/**
 * Bash 실행 전 체크하는 PreToolUse hook.
 *
 * 이 저장소의 AI 세션 샌드박스에서 실행할 수 없는 명령(포트 바인딩)만 막는다.
 * secret 파일 우회 읽기 판정은 berry-dev plugin hook(`guard-secrets.mjs`)이 맡는다.
 *
 * 애매한 경우에는 막지 않는다.
 */

// 포트 바인딩이 필요한 명령은 샌드박스에서 실행할 수 없다.
const PORT_BOUND = [
  {
    pattern:
      /\b(?:nx|pnpm)\s+(?:run\s+)?dev(?::|\b)|\bnx\s+start\b|\bnx\s+run-many\s+[^\n]*-t\s*[^\s]*\bdev\b/,
    what: 'dev 서버',
  },
  {
    pattern: /\b(?:pnpm|nx)\s+(?:run\s+)?e2e\b|\bnx\s+run-many\s+[^\n]*-t\s*[^\s]*e2e/,
    what: 'Playwright e2e',
  },
  {
    pattern: /\bnx\s+(?:run\s+)?build\s+web\b|\bnx\s+run\s+web:build\b/,
    what: 'web 프로덕션 빌드 (Turbopack의 PostCSS 워커가 포트를 연다)',
  },
];

/**
 * 검색어 또는 출력 문자열에 포함된 명령까지 오탐하지 않도록
 * PORT_BOUND 검사 전에 quoted string을 제거한다.
 */
const stripQuoted = (command) => command.replace(/'[^']*'|"[^"]*"/g, ' ');

// 차단 대상이면 사유를 반환하고, 아니면 null.
const findReason = (command) => {
  const blocked = PORT_BOUND.find((rule) => rule.pattern.test(stripQuoted(command)));
  if (!blocked) {
    return null;
  }
  return `이 환경에서는 실행할 수 없습니다 — ${blocked.what}는 포트 바인딩이 차단됩니다. 사용자에게 직접 실행을 요청하고, 결과를 받기 전까지 검증했다고 보고하지 마세요.`;
};

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
  const payload = JSON.parse(await readStdin());
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') {
    return;
  }

  const reason = findReason(command);
  if (!reason) {
    return;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
};

// hook 자체의 오류 때문에 모든 Bash 실행이 막히는 상황은 피한다.
main().catch(() => process.exit(0));
