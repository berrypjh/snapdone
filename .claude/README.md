# AI Development Harness

이 저장소의 Claude Code 설정이 어떻게 구성돼 있고 왜 그렇게 됐는지에 대한 **개발자용 문서**다. Claude에게 항상 주입되는 문서가 아니다. 설정 파일 옆에 두어 설정을 고칠 때 같이 눈에 들어오게 했다.

Claude에게 주입되는 것은 `AGENTS.md`(루트 `CLAUDE.md`가 `@AGENTS.md`로 불러온다)와 `.claude/rules/`이며, 이 문서는 그 내용을 반복하지 않는다.

## 목적

AI가 이 저장소에서 **일반적인 Nx 조언이 아니라 이 저장소의 실제 규칙**을 따르게 하는 것. 그리고 그 규칙을 매 세션 전부 읽히지 않고 필요한 순간에만 읽히게 하는 것.

## 어떤 문제를 어떤 장치로 푸는가

같은 지시를 두 군데에 적지 않는다. 새 규칙을 추가할 때는 아래 순서로 자리를 정한다.

| 문제의 성격                                | 장치                        | 예                                                    |
| ------------------------------------------ | --------------------------- | ----------------------------------------------------- |
| 이미 저장소 도구가 강제한다                | **아무것도 만들지 않는다**  | 포맷 → prettier, unused import → `noUnusedLocals`     |
| Claude Code에 이미 있다                    | **built-in을 쓴다**         | 코드 리뷰 → `/code-review`, 보안 → `/security-review` |
| 거의 모든 세션에 필요한 짧고 안정적인 사실 | `AGENTS.md`                 | 프로젝트 이름과 역할, 의존성 4단계                    |
| 특정 경로에서만 참인 불변식                | `.claude/rules/*.md`        | Expo 56 고정, 토큰은 역할 이름으로만                  |
| 판단이 필요한 여러 단계 절차               | `.claude/skills/*/SKILL.md` | 커밋 메시지 작성                                      |
| 메인 대화를 오염시키는 대량 탐색           | built-in subagent           | `Explore`, `Plan`                                     |
| 모델 판단과 무관하게 **막아야** 하는 것    | permission (settings)       | `.env` 읽기, 스토어 제출                              |
| permission 문법으로 표현되지 않는 판단     | `.claude/hooks/*.mjs`       | 명령 문자열 전체를 봐야 하는 것                       |
| 여러 저장소가 같은 규칙으로 쓰는 개발 도구 | 공용 plugin                 | `berry-commit@berrypjh` (commit skill + MCP)          |

`AGENTS.md`와 rule은 **context이지 강제 장치가 아니다.** 반드시 막아야 하는 것은 permission으로 처리한다.

## Directory map

```
AGENTS.md                     항상 로드. 저장소 사실과 원칙
CLAUDE.md                     `@AGENTS.md` 한 줄. Claude Code 진입점
.claude/
├─ rules/                     경로가 매칭될 때만 로드
│  ├─ web.md                  apps/web/**
│  ├─ mobile.md               apps/mobile/**
│  ├─ api.md                  apps/api/**
│  ├─ ko-ui.md                apps/{web,mobile}/src/**/*.tsx
│  └─ libs.md                 libs/**            (지금은 비어 있어 로드되지 않는다)
├─ skills/                    호출하거나 관련성이 판단될 때만 로드
│  ├─ repo-verify/            변경 영향 범위 판정 + 검증 사다리
│  └─ frontend-quality/       화면 제품 검수 (references/ 2개는 필요할 때만)
├─ hooks/
│  └─ guard-bash.mjs          PreToolUse(Bash). 컨텍스트를 쓰지 않는다
├─ settings.json              팀 공유. 커밋된다
├─ settings.local.json        개인용. gitignore된다
└─ README.md                  이 문서. Claude가 로드하지 않는다
docs/                         사람이 읽는 문서. rule과 skill이 링크로 참조한다
```

`.claude/rules/`는 재귀 탐색되고, `paths` frontmatter가 있는 파일은 Claude가 매칭되는 파일을 읽을 때 로드된다. `paths`가 없으면 매 세션 로드되므로 **`paths` 없는 rule을 만들지 않는다.**

## Skill

| skill                        | 출처                       | 언제                              | 누가 호출               |
| ---------------------------- | -------------------------- | --------------------------------- | ----------------------- |
| `/berry-commit:commit-scope` | 공용 plugin `berry-commit` | staged 변경을 scope별로 커밋할 때 | **사용자만**            |
| `repo-verify`                | 이 저장소                  | 코드를 바꾸고 완료를 보고하기 전  | Claude 자동 또는 사용자 |
| `frontend-quality`           | 이 저장소                  | web·mobile 화면을 바꾸고 나서     | Claude 자동 또는 사용자 |

커밋은 사용자가 시작해야 하는 일이다. plugin의 `commit_scope` tool은 **명시적 승인 뒤에만** 호출하고, git commit은 permission `ask`가 한 번 더 지킨다.

이 저장소의 두 skill은 자동 호출을 허용한다. "검증 없이 완료를 선언하지 않는다"와 "화면은 제품 기준으로 본다"가 Claude가 스스로 지켜야 하는 규칙이라, 사용자가 매번 타이핑해야 한다면 의미가 없기 때문이다.

**새 skill을 만드는 기준**

- 같은 지시를 반복해서 붙여넣고 있을 때
- `AGENTS.md`의 한 절이 사실이 아니라 절차로 자라났을 때

Skill 본문은 한번 로드되면 이후 턴에도 컨텍스트에 남는다. `SKILL.md`는 짧게 유지하고 상세 절차는 `references/`로 분리한다. `frontend-quality`가 그 예다 — 본문은 검수 순서만 갖고, 항목별 확인 방법은 `references/product-ux.md`와 `references/platform-checks.md`에 있다.

**rule과 겹치지 않게 한다.** rule은 _무엇이 옳은가_(불변식), skill reference는 _어떻게 확인하는가_(절차)다. 같은 문장을 양쪽에 적지 않는다.

의도적으로 만들지 않은 skill이 하나 있다. 구현 lifecycle 전체를 감싸는 `develop-change` 류인데, 그 내용이 `AGENTS.md`(탐색·재사용·최소 변경) · plan mode(계획) · `repo-verify`(검증) · `/code-review`(리뷰)에 이미 전부 있어서 네 번째 재서술이 되기 때문이다.

## Subagent

**커스텀 subagent를 만들지 않았다.** 내장으로 충분하다.

| 하려는 일        | 쓰는 것                            |
| ---------------- | ---------------------------------- |
| 코드 탐색        | `Explore`                          |
| 구현 계획        | plan mode / `Plan`                 |
| 격리된 복합 작업 | `general-purpose`                  |
| 리뷰             | `/code-review`, `/security-review` |

**`Explore`와 `Plan`만 `AGENTS.md`와 rule을 건너뛴다.** 탐색을 빠르고 싸게 하려는 의도적 설계이고, 나머지 내장 agent와 모든 custom agent는 전부 받는다. 그래서 코드를 쓰는 위임에는 `general-purpose`를 쓰면 컨벤션이 함께 간다. `Explore`·`Plan`에는 컨벤션 준수를 기대하지 말고, 그 결과를 받아서 판단하는 것은 메인 세션의 몫으로 둔다.

### 커스텀 agent를 만들지 않은 이유

내장과 역할이 겹치지 않는 **격리된 컨텍스트가 실제로 필요한가**가 기준인데, 지금은 아니다. 제품 소스 전체가 `apps/web` 265줄 · `apps/mobile` 348줄 · `apps/api` 293줄이다. 리뷰어가 전부 읽어도 컨텍스트를 오염시킬 양이 아니다.

아래 중 하나가 실제로 관측되면 그때 다시 판단한다. 미리 만들지 않는다.

- 한 번의 리뷰가 읽어야 할 코드가 수천 줄이 되어 메인 대화가 밀린다
- `/code-review`가 이 저장소 특유의 문제를 반복해서 놓치고, 그 패턴을 프롬프트로 고정할 수 있다
- `apps/api`에 인증 · 결제 · 비밀값 취급이 들어와 전용 보안 리뷰가 반복 필요해진다
- 같은 위임 프롬프트를 세 번 이상 손으로 다시 쓰고 있다

## Permissions

팀 공유 규칙은 `.claude/settings.json`에, 개인 설정은 `.claude/settings.local.json`에 둔다. 평가 순서는 **deny → ask → allow**이고 구체적인 규칙이라고 먼저 걸리지 않는다. 어느 스코프든 deny 하나면 다른 모든 allow를 막는다.

`permissions.allow`는 workspace trust를 수락한 뒤에만 적용된다. 저장소를 처음 clone하면 신뢰 다이얼로그가 한 번 뜬다. `deny`와 `ask`는 신뢰와 무관하게 즉시 적용된다.

### 무엇을 막는가

| 분류     | 대상                                                                       |
| -------- | -------------------------------------------------------------------------- |
| **deny** | 실제 secret 파일 읽기 (`.env` · `.env.local` · `.env.*.local` · 서명 키류) |
| **deny** | 스토어 제출 (`nx submit mobile` · `eas submit`) — 되돌릴 수 없다           |
| **deny** | force push                                                                 |
| **ask**  | commit · push · merge · rebase · tag · branch 삭제                         |
| **ask**  | 작업 내용을 지우는 것 (`reset --hard` · `clean` · `checkout --` · `stash`) |
| **ask**  | EAS 클라우드 빌드 — 계정과 쿼터를 소모한다                                 |
| **ask**  | 의존성 설치 · Nx 플러그인 추가 · 마이그레이션                              |

**`allow` 규칙은 하나도 두지 않았다.** `defaultMode`가 `auto`라 안전한 일상 명령은 분류기가 이미 통과시킨다. allow를 추가하면 ask 규칙과의 우선순위를 매번 따져야 하는데, 그 복잡도를 살 만한 마찰이 관측되지 않았다.

`.env.example`은 막지 않는다. 추적되는 템플릿이고 secret이 없다. deny 패턴이 `.env` · `.env.local` · `.env.*.local`을 정확히 겨냥하므로 `.env.example`에는 걸리지 않는다.

### 이 방어가 막지 못하는 것

층마다 강도가 다르다. 위로 갈수록 약하다.

| 층                             | 성격                        | 한계                                                               |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md` · `.claude/rules/` | **지시일 뿐 강제가 아니다** | Claude가 따르려 하지만 보장은 없다                                 |
| Skill                          | 절차 안내                   | 위와 같다                                                          |
| **permissions**                | tool 단위 guard             | Claude Code가 인식하는 tool 호출에만 적용된다                      |
| **hook**                       | event 단위 guard            | 등록한 이벤트에서만 동작한다                                       |
| **sandbox**                    | OS 수준 프로세스 격리       | 지원 OS에서만 (macOS · Linux · WSL2, 네이티브 Windows 불가)        |
| **git hook**                   | 커밋 시점 강제              | `--no-verify`로 건너뛸 수 있다. AI 전용이 아니라 사람에게도 걸린다 |

`git hook`은 다른 층과 성격이 다르다. 위 네 층은 전부 **Claude에게만** 걸리지만 git hook은 **누가 커밋하든** 걸린다. 그래서 AI 도구를 바꾸거나 사람이 직접 짜도 규칙이 남는다. Claude Code `PostToolUse` hook으로 같은 일을 할 수 있지만 그쪽은 Claude 밖에서 들어온 코드를 놓친다.

특히 알아야 할 구멍이 하나 있다. 공식 문서 표현 그대로다.

> Read와 Edit deny 규칙은 Claude의 내장 파일 도구와 Claude Code가 인식하는 Bash 파일 명령(`cat` · `head` · `tail` · `sed`)에 적용된다. **파일을 직접 여는 Python이나 Node 스크립트 같은 임의의 하위 프로세스에는 적용되지 않는다.**

즉 `Read(.env)` deny가 있어도 `node -e "require('fs').readFileSync('.env')"` 같은 것은 permission 층에서 걸리지 않는다. **`guard-bash.mjs`가 이 경로를 덮는다**(아래 Hook 절). 다만 훅도 명령 문자열을 보는 것이라 우회 가능하다. **모든 프로세스를 막는 것은 여전히 sandbox의 일이다.**

그리고 다음은 프로젝트 설정으로 할 수 없고 user 또는 managed scope가 필요하다.

- `sandbox.filesystem.disabled` — 프로젝트 설정에서 끌 수 없다 (안전한 방향의 제약)
- `allowManagedPermissionRulesOnly` · `deniedMcpServers` · `disableBypassPermissionsMode` — managed 전용
- 홈 디렉터리 credential 정책 — 저장소가 개인 홈 설정을 정하는 것은 월권이다

마지막으로, **clone한 저장소의 내용 자체가 신뢰 대상이 아닐 수 있다.** 이 저장소의 `.claude/settings.json`(plugin 선언 포함) · 스킬의 `allowed-tools`는 전부 git에서 오는 것이고, 그중 일부(hook · `env` · 스킬의 `allowed-tools`)는 **신뢰 다이얼로그를 수락하기 전에도 적용된다.** 남의 저장소에서 `claude -p`를 돌리기 전에는 `--setting-sources user` 또는 `--bare`를 검토한다.

## Hook

`.claude/hooks/guard-bash.mjs` 하나뿐이다. `PreToolUse` · matcher `Bash`.

**permission으로 표현할 수 없는 것만** 여기서 처리한다. permission 규칙은 패턴 매칭이고, 이 훅은 명령 문자열 전체를 본 뒤 **왜 막혔고 대신 무엇을 해야 하는지**를 문장으로 돌려준다. 그 차이가 존재 이유다.

| 막는 것                                                     | permission으로 안 되는 이유                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| dev 서버 · `pnpm e2e` · `nx build web`                      | 영구 금지가 아니라 **이 환경에서만** 불가. "사용자에게 요청"이 정답 |
| secret 경로 + 리다이렉트 / `node -e` / `grep` / `base64` 등 | Read deny는 `cat`·`head`·`tail`·`sed`만 인식한다                    |

두 번째 항목은 **두 조건이 함께 있을 때만** 막는다. `cat .env.example`이나 `echo x > /tmp/out`은 통과한다.

**의도적으로 넣지 않은 것**

- `nx build mobile` · `eas *` · `nx submit` — permission의 `ask`/`deny`가 이미 처리한다. 두 곳에 적지 않는다
- `pnpm build` — `api`까지 성공하고 `web`에서 멈춘다. 부분 성공에 정보가 있으므로 막지 않는다
- prettier · typecheck 자동 실행 — `lint-staged`가 더 잘 한다. Claude 밖에서 들어온 코드에도 걸린다

**실패하면 통과시킨다.** 훅이 깨져서 모든 Bash가 막히는 쪽이 더 나쁘다. 그래서 이것은 보조 장치이지 마지막 방어선이 아니다.

명령을 바꾸거나 새로 막을 것이 생기면 `.claude/hooks/guard-bash.mjs`의 `PORT_BOUND` · `BYPASS` 배열만 고친다. 문서 세 곳에 흩어 적지 않는다.

### 테스트

```bash
pnpm test:hooks    # node --test tools/scripts/*.test.mjs
```

`tools/scripts/guard-bash.test.mjs`가 훅을 **실제로 실행해서** stdin/stdout 계약까지 확인한다(49 케이스). 정규식만 검사하면 JSON 형식이 깨져도 통과하는데, 그러면 훅이 조용히 무력해진다.

훅이 망가지는 방식은 두 가지이고 둘 다 눈에 띄지 않는다.

- **과차단** — 정상 명령이 막혀 작업이 안 된다. 원인이 훅이라는 걸 알아채기 어렵다
- **과통과** — secret 우회가 다시 열린다. 아무 증상이 없다

그래서 `PORT_BOUND` · `BYPASS`를 고칠 때는 테스트를 함께 고친다. `.claude/`는 Nx 프로젝트가 아니라 `nx test`가 잡지 못하므로 `pnpm verify`가 `test:hooks`를 따로 부른다.

## Git hook

AI 설정과 별개의 층이다. **누가 커밋하든 걸린다**는 점이 존재 이유다.

| 파일                   | 시점           | 하는 일                            |
| ---------------------- | -------------- | ---------------------------------- |
| `.husky/pre-commit`    | 커밋 직전      | `lint-staged` — staged 파일만      |
| `.husky/commit-msg`    | 메시지 작성 후 | `commitlint` — 커밋 규칙 강제      |
| `commitlint.config.js` | —              | `@berrypjh/commitlint-config` 상속 |

`lint-staged`는 `package.json`에 있다. TS·JS는 `eslint --fix` + `prettier --write`, JSON·CSS·MD는 `prettier --write`, **Go는 `gofmt -w`**다. Go를 넣은 이유는 `api`에 `lint` 타겟이 없고 `nx fmt api`가 검사만 하기 때문이다. 자동으로 고치는 지점이 여기밖에 없다.

`commitlint` 규칙(`@berrypjh/commitlint-config`)과 plugin `berry-commit`의 `skills/commit-scope/examples/commit-message-rules.md`는 **같은 내용**이며 둘 다 공용 shared-stack이 소유한다. 문서는 Claude에게 설명하고 config는 강제한다. 바꿔야 하면 이 저장소가 아니라 upstream에서 함께 고친다.

`prettier`는 `nx format:*`이 아니라 **plain `prettier .`**를 쓴다. `nx format:check`는 base 대비 변경된 파일만 검사해서, 한 번 들어간 드리프트를 영원히 놓친다. 실제로 `tools/mcp/commit/`의 5개 파일이 그렇게 방치돼 있었다.

건너뛰려면 `git commit --no-verify`다. 막지 않지만, 그때는 건너뛴다는 것을 알고 하는 것이다.

## 신뢰 표면

harness가 커지면서 **아무도 실행을 지시하지 않아도 도는 코드**가 생겼다. 여기 전부 적는다.

| 언제                   | 무엇이                                                                            | 출처                                                   |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude의 Bash 호출마다 | `node .claude/hooks/guard-bash.mjs`                                               | 이 저장소                                              |
| `git commit`마다       | `npx lint-staged` · `npx commitlint --edit`                                       | 이 저장소 + npm                                        |
| `pnpm install`마다     | `prepare: husky`                                                                  | npm                                                    |
| Claude 세션 시작마다   | `node ${CLAUDE_PLUGIN_ROOT}/dist/index.js` (`berry-commit` plugin의 `commit-mcp`) | 공용 marketplace `berrypjh` (**plugin에 커밋된 번들**) |

그리고 lint · format · tsconfig · commitlint 규칙은 **npm 공식 레지스트리가 아닌** GitHub Packages에서 온다.

```
.npmrc:  @berrypjh:registry=https://npm.pkg.github.com
         @berrypjh/{eslint,prettier,tsconfig,commitlint}-config
```

전부 의도한 구성이다. 문제는 **Step 11 보안 리뷰가 이 중 어느 것도 없을 때 수행됐다**는 점이다. 그때는 `.claude/`에 실행되는 코드가 하나도 없었다.

### `.claude/` · `.husky/`를 건드리는 변경을 리뷰할 때

일반 코드와 다르게 본다. 이 파일들은 리뷰어가 승인하는 순간부터 **모든 커밋과 모든 Bash 호출에서** 돈다.

```bash
git diff -- .claude/ .husky/ commitlint.config.js    # 무엇이 실행 대상이 됐나
pnpm test:hooks                                       # 훅이 여전히 의도대로 막고 통과시키나
pnpm ls @berrypjh/eslint-config @berrypjh/tsconfig    # 버전이 예상과 같나
```

확인할 것은 세 가지다.

- **새로 실행되는 것이 생겼나** — `settings.json`의 `hooks`, `.husky/` 새 파일, `package.json`의 `prepare`/`lint-staged`
- **네트워크나 홈 디렉터리에 닿는가** — 훅은 프로젝트 안에서만 끝나야 한다. `curl` · `~/.ssh` · `$HOME`이 보이면 멈춘다
- **plugin이 무엇을 실행하는가** — `settings.json`의 `extraKnownMarketplaces` · `enabledPlugins`가 바뀌면 세션 시작 시 도는 코드가 바뀐다. `claude plugin list`로 설치 버전과 scope를 확인한다

`claude plugin validate .` 도 있지만 이 저장소는 plugin이 아니라 프로젝트 설정이라 대상이 아니다.

## 로컬 전용 설정

`.claude/settings.local.json`은 gitignore된다. 여기에 두는 것:

- 이 머신에서만 필요한 샌드박스 경로
- 개인 플러그인

**공유 설정에 절대 경로를 쓰지 않는다.** 홈 디렉터리는 `~/`로 적는다.

### 샌드박스를 켠 개발자용 메모

샌드박스는 기본적으로 작업 디렉터리와 세션 임시 디렉터리에만 쓸 수 있다. 이 저장소에서 실제로 확인된 영향은 하나뿐이다.

**Go 빌드 캐시(`go env GOCACHE`)가 홈 디렉터리에 있어 쓰기가 막힌다.** 다만 Go는 캐시를 못 써도 그냥 컴파일하므로 `nx build api` · `nx test api` · `nx vet api`는 **전부 정상 동작한다.** 느려질 뿐이고, 실패하는 것은 `go clean -cache` 하나다.

캐시 성능이 아쉬우면 `.claude/settings.local.json`에 자기 머신 경로를 넣는다. OS마다 다르므로 공유 설정에 넣지 않았다.

```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": ["~/Library/Caches/go-build"]
    }
  }
}
```

pnpm store는 이 저장소에서 프로젝트 안(`.pnpm-store/`)에 있어 이미 쓸 수 있다. `pnpm store path`로 확인한다.

## MCP와 plugin을 추가하는 기준

MCP 서버와 plugin은 사용자 권한으로 임의 코드를 실행할 수 있고, 응답 텍스트가 컨텍스트로 유입된다. Anthropic은 공식 마켓플레이스의 plugin을 보안 감사하지 않는다.

추가 전에 확인한다.

1. 로컬 CLI로 되는가 (`git`, `gh`, `nx`, `go`)
2. Claude Code 내장으로 되는가
3. 이미 있는 저장소 도구와 겹치지 않는가
4. 팀 전원이 설치해야 하는 부담을 감수할 값어치가 있는가

### 현재 상태

**프로젝트에 로컬 MCP 서버는 없다.** 커밋용 `commit-mcp`는 공용 plugin `berry-commit@berrypjh`가 제공한다(tool 이름 `mcp__plugin_berry-commit_commit-mcp__*`). 예전의 `tools/mcp/commit` · `.mcp.json` · `/commit-scope` 로컬 사본은 plugin 연결을 확인한 뒤 삭제했다 — plugin 쪽이 staged patch를 `git apply --cached`로 복원해 더 안전하다.

`settings.json`의 plugin 키:

```json
"extraKnownMarketplaces": { "berrypjh": { "source": { "source": "github", "repo": "berrypjh/shared-stack" } } },
"enabledPlugins": { "berry-commit@berrypjh": true, "code-review@claude-plugins-official": true }
```

`commit-mcp`의 보안 성격 — tool 3개 중 쓰기는 `commit_scope` 하나뿐이고, **네트워크 호출이 없고 credential을 읽지 않는다.** git 호출은 `spawnSync('git', args)` 배열 형태라 모델이 만든 커밋 문구가 셸로 해석되지 않는다. **plugin 설치에는 빌드 단계가 없고 `dist/index.js` 번들이 plugin 저장소에 커밋돼 있다** — 신뢰 표면이 shared-stack으로 옮겨갔다는 뜻이다.

`code-review@claude-plugins-official`도 켜져 있다. GitHub PR 워크플로 전용이라(`gh pr view` · `gh pr diff` · `gh pr comment`) 활성화하면 `gh pr comment`(외부 쓰기)가 미리 승인된다 — 스킬의 `allowed-tools`는 workspace trust 게이트를 받지 않는다. 사용자가 켠 설정이며 이 문서는 그 영향만 기록한다.

Plugin은 사용자 스코프(`~/.claude/settings.json`)에서도 켤 수 있는데, 그렇게 켠 것은 **저장소에 흔적이 남지 않아 팀원 환경에서 재현되지 않는다.** 팀이 함께 써야 하는 것은 프로젝트 `enabledPlugins`에 선언하고, 팀원은 `claude plugin install`을 한 번 실행해야 한다.

### 외부 없이도 돌아가야 한다

`AGENTS.md` · rules · `repo-verify` · `frontend-quality` · permissions는 **MCP와 plugin이 하나도 없어도 그대로 동작한다.** 전부 파일과 로컬 `nx` · `git`만 쓴다. `/berry-commit:commit-scope`만 plugin MCP에 의존하는데, plugin이 없으면 손으로 커밋하면 되고 그 경로는 permission의 ask가 지킨다. 공용 UI 조회도 네트워크 없이 **설치된 패키지 bin**(`berry-react-ui`)만 쓴다.

저장소를 이해하고 검증하는 능력을 외부 서버에 의존시키지 않는다.

## Memory

무엇을 어디에 두는지는 `AGENTS.md`의 Memory 절에 있다. 여기에는 그 경계를 그렇게 그은 이유만 적는다.

auto memory는 Claude Code 기본값 그대로 켜 두었다. 끄거나 위치를 옮기지 않았다. 이걸 architecture의 source of truth로 쓰지 않는 이유는 세 가지다.

- **머신 로컬이다.** `~/.claude/projects/<repo>/memory/`에 저장되고 git에도, 다른 머신에도 가지 않는다. 팀원이 같은 내용을 갖지 못한다
- **`MEMORY.md`는 200줄 또는 25KB에서 잘린다.** 넘긴 부분은 세션 시작 시 아예 로드되지 않는다
- **리뷰를 거치지 않는다.** Claude가 스스로 쓰므로 PR에서 검토할 기회가 없다

반대로 "이 머신에서 pnpm store가 어디에 있더라" 같은 사실은 committed 문서에 둘 이유가 없다. 내용은 `/memory`로 언제든 읽고 고치고 지울 수 있다.

## 확장하는 법

1. 이미 있는 저장소 도구나 Claude 내장이 푸는 문제인지 먼저 확인한다
2. 위 표에서 자리를 고른다
3. 같은 내용이 이미 다른 곳에 있는지 검색한다. 있으면 **옮기고**, 새로 쓰지 않는다
4. rule을 추가하면 `paths`를 반드시 붙인다
5. `/context`로 실제 로드 여부와 비용을 확인한다

## Troubleshooting

**규칙이 안 지켜진다** — `/context`의 Memory files에 파일이 있는지 본다. 없으면 Claude가 못 본 것이다. rule은 매칭되는 파일을 **읽어야** 로드된다.

**path rule이 안 걸린다** — 먼저 **rule을 이번 세션 중에 만들었는지** 확인한다. 세션 시작 시점에 없던 rule 파일은 그 세션에서 로드되지 않는다. **새 세션에서 다시 본다.** 그래도 안 걸리면 `paths` glob이 저장소 루트 기준인지 확인하고, `InstructionsLoaded` 훅으로 무엇이 언제 로드됐는지 찍어본다.

무엇이 로드됐는지 직접 물어보는 것이 가장 확실하다. 대화형 세션을 새로 띄우지 않고도 된다.

```bash
claude -p "Read apps/web/src/app/page.tsx. Then answer with ONLY: RULES_SEEN=<rule filenames you were given, or NONE>"
```

**compact 후 지시가 사라진 것 같다** — 루트 `CLAUDE.md`(=`AGENTS.md`)는 자동으로 다시 주입되지만 path rule은 다음에 매칭 파일을 읽을 때 재로드된다.

**설정이 안 먹는다** — `/status`로 어떤 settings 파일이 실제로 로드됐는지 본다. `claude doctor`는 설치 상태를 읽기 전용으로 점검한다.

**컨텍스트가 무겁다** — `/context`로 비중을 보고, `/doctor`로 안 쓰는 skill · MCP · plugin을 비용 대비로 찾는다.

## Experimental 기능 정책

**실험적/preview 기능은 이 저장소의 기본 구성에 넣지 않는다.** 개인이 시험하는 것은 자유이며 `settings.local.json`에 둔다.

현재 기본 구성에서 제외한 것: Agent view(research preview) · Agent Teams(experimental, 기본 비활성) · `prompt`/`agent` 타입 hook(experimental).

플랜에 따라 쓸 수 없는 기능도 팀 공유 구성의 전제로 삼지 않는다: Remote Control · Routines · Channels · Claude in Chrome.
