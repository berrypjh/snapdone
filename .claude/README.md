# AI Development Harness

이 저장소의 Claude Code 설정이 어떻게 구성돼 있고 왜 그런지에 대한 **개발자용 문서**다. Claude에게 주입되지 않는다.

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
| 여러 저장소가 같은 규칙으로 쓰는 개발 도구 | 공용 plugin                 | `berry-commit` (commit) · `berry-dev` (검증 · secret) |

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
│  ├─ product-ui.md           apps/{web,mobile}/src/**/*.tsx · 문구 모듈(*-copy.ts · *Copy.ts) — 제품 화면 판정 기준
│  ├─ libs.md                 libs/**
│  ├─ devhub.md               apps/devhub/**
│  ├─ e2e.md                  apps/{web,devhub}-e2e/**
│  ├─ docs.md                 docs/**/*.md — docs-ko에 더하는 것만
│  └─ _generated/             berry-dev standards 생성본. 손으로 고치지 않는다(harness:sync)
├─ hooks/
│  └─ guard-bash.mjs          PreToolUse(Bash). 포트 바인딩 명령만 막는다
├─ standards.json             어떤 berry-dev standard를 어느 경로에 쓸지
├─ harness-source.json        고정한 shared-stack 커밋(40자) · berry-dev version
├─ harness.profile.md         berry-dev skill · rule이 읽는 snapdone 사실
├─ settings.json              팀 공유. 커밋된다
├─ settings.local.json        개인용. gitignore된다
└─ README.md                  이 문서. Claude가 로드하지 않는다
docs/                         사람이 읽는 문서. rule과 skill이 링크로 참조한다
```

`.claude/rules/`는 재귀 탐색되고, `paths` frontmatter가 있는 파일은 Claude가 매칭되는 파일을 읽을 때 로드된다. `paths`가 없으면 매 세션 로드되므로 **`paths` 없는 rule을 만들지 않는다.** 예외는 모든 작업에 적용되는 생성본 `_generated/core.md` 하나다.

`_generated/`는 `pnpm harness:sync`가 고정한 shared-stack checkout(`SHARED_STACK_DIR`, 기본 `../shared-stack`)의 berry-dev CLI로 쓴다. `tools/scripts/harness.mjs`가 그 checkout의 HEAD · plugin 이름 · version이 `harness-source.json`과 같은지 먼저 확인하고, 다르면 CLI를 부르지 않는다. 생성본과 일치하는지는 `pnpm harness:check`(쓰지 않음)로 본다. 규칙을 바꾸려면 shared-stack의 원본을 고치고 고정 커밋을 올린다.

## Skill

| skill                         | 출처                       | 언제                              | 누가 호출               |
| ----------------------------- | -------------------------- | --------------------------------- | ----------------------- |
| `/berry-commit:commit-scope`  | 공용 plugin `berry-commit` | staged 변경을 scope별로 커밋할 때 | **사용자만**            |
| `/berry-dev:repo-verify`      | 공용 plugin `berry-dev`    | 코드를 바꾸고 완료를 보고하기 전  | Claude 자동 또는 사용자 |
| `/berry-dev:frontend-quality` | 공용 plugin `berry-dev`    | web·mobile 화면을 바꾸고 나서     | Claude 자동 또는 사용자 |

커밋은 사용자가 시작해야 하는 일이다. plugin의 `commit_scope` tool은 **명시적 승인 뒤에만** 호출하고, git commit은 permission `ask`가 한 번 더 지킨다.

`repo-verify` · `frontend-quality`의 절차는 plugin이 갖고, snapdone 사실(영향 범위 · 실행 제약 · consumer 조회 명령 · 화면 폭 · 문구 정책)은 `harness.profile.md`가 갖는다. 절차를 로컬에 다시 적지 않는다. 두 skill은 Claude가 스스로 지켜야 하는 규칙이라 자동 호출을 허용한다.

**새 skill을 만드는 기준**

- 같은 지시를 반복해서 붙여넣고 있을 때
- `AGENTS.md`의 한 절이 사실이 아니라 절차로 자라났을 때

`SKILL.md`는 짧게 유지하고 상세 절차는 `references/`로 분리한다. rule은 _무엇이 옳은가_(불변식), skill은 _어떻게 확인하는가_(절차)다. 같은 문장을 양쪽에 적지 않는다.

구현 lifecycle 전체를 감싸는 skill(`develop-change` 류)은 만들지 않는다. `AGENTS.md` · plan mode · `repo-verify` · `/code-review`의 재서술이 되기 때문이다.

## Subagent

**커스텀 subagent를 만들지 않았다.** 내장으로 충분하다.

| 하려는 일        | 쓰는 것                            |
| ---------------- | ---------------------------------- |
| 코드 탐색        | `Explore`                          |
| 구현 계획        | plan mode / `Plan`                 |
| 격리된 복합 작업 | `general-purpose`                  |
| 리뷰             | `/code-review`, `/security-review` |

**`Explore`와 `Plan`만 `AGENTS.md`와 rule을 건너뛴다.** 코드를 쓰는 위임에는 `general-purpose`를 써야 컨벤션이 함께 간다. `Explore` · `Plan`의 결과를 판단하는 것은 메인 세션의 몫이다.

아래 중 하나가 실제로 관측되면 커스텀 agent를 다시 판단한다. 미리 만들지 않는다.

- 한 번의 리뷰가 읽어야 할 코드가 수천 줄이 되어 메인 대화가 밀린다
- `/code-review`가 이 저장소 특유의 문제를 반복해서 놓치고, 그 패턴을 프롬프트로 고정할 수 있다
- `apps/api`에 인증 · 결제 · 비밀값 취급이 들어와 전용 보안 리뷰가 반복 필요해진다
- 같은 위임 프롬프트를 세 번 이상 손으로 다시 쓰고 있다

## Permissions

팀 공유 규칙은 `.claude/settings.json`에, 개인 설정은 `.claude/settings.local.json`에 둔다. 평가 순서는 **deny → ask → allow**이고, 어느 스코프든 deny 하나면 다른 모든 allow를 막는다. `allow`는 workspace trust를 수락한 뒤에만, `deny` · `ask`는 즉시 적용된다.

### 무엇을 막는가

| 분류     | 대상                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| **deny** | 실제 secret 파일 읽기 (`.env` · `.env.local` · `.env.*.local` · 서명 키류)             |
| **deny** | 스토어 제출 (`nx submit mobile` · `eas submit`) — 되돌릴 수 없다                       |
| **deny** | force push                                                                             |
| **ask**  | commit · push · merge · rebase · tag · branch 삭제                                     |
| **ask**  | 작업 내용을 지우는 것 (`reset --hard` · `clean` · `checkout --` · `restore` · `stash`) |
| **ask**  | EAS 클라우드 빌드 — 계정과 쿼터를 소모한다                                             |
| **ask**  | 의존성 설치 · Nx 플러그인 추가 · `nx migrate` · Go 모듈 변경(`go get` · `go mod`)      |

**`allow` 규칙은 두지 않았다.** `defaultMode`가 `auto`라 안전한 일상 명령은 분류기가 통과시키고, allow를 더하면 ask와의 우선순위를 매번 따져야 한다.

`.env.example`은 막지 않는다. secret이 없는 추적 템플릿이고 deny 패턴에 걸리지 않는다.

### 이 방어가 막지 못하는 것

| 층                             | 성격                        | 한계                                                               |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md` · `.claude/rules/` | **지시일 뿐 강제가 아니다** | Claude가 따르려 하지만 보장은 없다                                 |
| Skill                          | 절차 안내                   | 위와 같다                                                          |
| **permissions**                | tool 단위 guard             | Claude Code가 인식하는 tool 호출에만 적용된다                      |
| **hook**                       | event 단위 guard            | 등록한 이벤트에서만 동작한다                                       |
| **sandbox**                    | OS 수준 프로세스 격리       | 지원 OS에서만 (macOS · Linux · WSL2, 네이티브 Windows 불가)        |
| **git hook**                   | 커밋 시점 강제              | `--no-verify`로 건너뛸 수 있다. AI 전용이 아니라 사람에게도 걸린다 |

알아야 할 구멍 — Read deny는 내장 파일 도구와 `cat` · `head` · `tail` · `sed`에만 적용되고, `node -e "require('fs').readFileSync('.env')"` 같은 하위 프로세스는 막지 못한다. 이 경로는 secret hook(아래 Hook 절)이 덮지만 hook도 명령 문자열을 보는 것이라 우회 가능하다. **모든 프로세스를 막는 것은 sandbox의 일이다.**

clone한 저장소의 `.claude/settings.json` · 스킬의 `allowed-tools`는 git에서 오고, 일부(hook · `env` · `allowed-tools`)는 **신뢰 다이얼로그 전에도 적용된다.** 남의 저장소에서 `claude -p`를 돌리기 전에는 `--setting-sources user` 또는 `--bare`를 검토한다.

## Hook

`PreToolUse` · matcher `Bash`에 hook이 둘 걸린다. 책임이 겹치지 않는다.

| hook                                                   | 출처                    | 막는 것                                                     |
| ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------- |
| `.claude/hooks/guard-bash.mjs`                         | 이 저장소               | dev 서버 · `pnpm e2e` · `nx build web` (포트 바인딩)        |
| `guard-secrets.mjs` (`${CLAUDE_PLUGIN_ROOT}/scripts/`) | 공용 plugin `berry-dev` | secret 경로 + 리다이렉트 / `node -e` / `grep` / `base64` 등 |

**permission으로 표현할 수 없는 것만** hook으로 처리한다. hook은 명령 문자열 전체를 본 뒤 **왜 막혔고 대신 무엇을 해야 하는지**를 문장으로 돌려준다.

- **포트 바인딩** — 이 환경에서만 불가하고 "사용자에게 요청"이 정답이다. 저장소마다 다르므로 local에 둔다
- **secret 우회 읽기** — secret 경로와 우회 수단이 **함께 있을 때만** 막는다(`cat .env.example`은 통과). 여러 저장소가 같은 판정을 쓰므로 plugin이 갖는다

plugin이 없는 환경에서는 secret hook이 없어 `.env.production` 같은 이름이 내장 Read로도 읽힌다. 팀원은 `claude plugin install berry-dev@berrypjh`를 한 번 실행한다.

**의도적으로 넣지 않은 것**

- `nx build mobile` · `eas *` · `nx submit` — permission의 `ask`/`deny`가 이미 처리한다
- `pnpm build` — `api`까지 성공하고 `web`에서 멈춘다. 부분 성공에 정보가 있다
- prettier · typecheck 자동 실행 — `lint-staged`가 Claude 밖 코드에도 걸려 더 낫다

**실패하면 통과시킨다.** 훅이 깨져서 모든 Bash가 막히는 쪽이 더 나쁘다. 보조 장치이지 마지막 방어선이 아니다.

포트 명령을 바꾸려면 `guard-bash.mjs`의 `PORT_BOUND` 배열과 테스트를 함께 고친다. secret 판정은 shared-stack의 `secret-policy.mjs`에서 고친다.

### 테스트

```bash
pnpm test:hooks    # node --test tools/scripts/*.test.mjs
```

- `guard-bash.test.mjs` — local 훅을 실제로 실행해 stdin/stdout 계약까지 확인한다. secret 명령은 local 훅이 **통과시키는지** 본다
- `harness.test.mjs` — 고정 source 판정
- secret 판정 테스트는 shared-stack이 갖는다
- `.claude/`는 Nx 프로젝트가 아니라 `pnpm verify`가 `test:hooks`를 따로 부른다

## Git hook

AI 설정과 별개의 층이다. **누가 커밋하든 걸린다.**

| 파일                   | 시점           | 하는 일                            |
| ---------------------- | -------------- | ---------------------------------- |
| `.husky/pre-commit`    | 커밋 직전      | `lint-staged` — staged 파일만      |
| `.husky/commit-msg`    | 메시지 작성 후 | `commitlint` — 커밋 규칙 강제      |
| `commitlint.config.js` | —              | `@berrypjh/commitlint-config` 상속 |

`lint-staged`(`package.json`) — TS·JS는 `eslint --fix` + `prettier --write`, JSON·CSS·MD·YAML은 `prettier --write`, Go는 `gofmt -w`. `api`는 `nx fmt`가 검사만 하므로 자동으로 고치는 곳이 여기뿐이다.

커밋 규칙은 `@berrypjh/commitlint-config`(강제)와 `berry-commit`의 `commit-message-rules.md`(Claude 설명)가 같은 내용이고 둘 다 shared-stack이 소유한다. 바꾸려면 upstream에서 함께 고친다.

`prettier`는 `nx format:*`이 아니라 plain `prettier .`를 쓴다. `nx format:check`는 변경 파일만 봐서 이미 들어간 드리프트를 놓친다.

## 신뢰 표면

아무도 실행을 지시하지 않아도 도는 코드.

| 언제                   | 무엇이                                                                            | 출처                                                   |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Claude의 Bash 호출마다 | `node .claude/hooks/guard-bash.mjs`                                               | 이 저장소                                              |
| Claude의 Bash 호출마다 | `node ${CLAUDE_PLUGIN_ROOT}/scripts/guard-secrets.mjs` (`berry-dev` plugin)       | 공용 marketplace `berrypjh`                            |
| `git commit`마다       | `npx lint-staged` · `npx commitlint --edit`                                       | 이 저장소 + npm                                        |
| `pnpm install`마다     | `prepare: husky`                                                                  | npm                                                    |
| Claude 세션 시작마다   | `node ${CLAUDE_PLUGIN_ROOT}/dist/index.js` (`berry-commit` plugin의 `commit-mcp`) | 공용 marketplace `berrypjh` (**plugin에 커밋된 번들**) |

lint · format · tsconfig · commitlint 설정은 npm 공식 레지스트리가 아닌 GitHub Packages에서 온다(`.npmrc`의 `@berrypjh:registry=https://npm.pkg.github.com`).

### `.claude/` · `.husky/`를 건드리는 변경을 리뷰할 때

이 파일들은 승인되는 순간부터 **모든 커밋과 모든 Bash 호출에서** 돈다.

```bash
git diff -- .claude/ .husky/ commitlint.config.js    # 무엇이 실행 대상이 됐나
pnpm test:hooks                                       # 훅이 여전히 의도대로 막고 통과시키나
pnpm ls @berrypjh/eslint-config @berrypjh/tsconfig    # 버전이 예상과 같나
```

- **새로 실행되는 것이 생겼나** — `settings.json`의 `hooks`, `.husky/` 새 파일, `package.json`의 `prepare`/`lint-staged`
- **네트워크나 홈 디렉터리에 닿는가** — `curl` · `~/.ssh` · `$HOME`이 보이면 멈춘다
- **plugin이 무엇을 실행하는가** — `extraKnownMarketplaces` · `enabledPlugins`가 바뀌면 세션 시작 시 도는 코드가 바뀐다. `claude plugin list`로 확인한다

## 로컬 전용 설정

`.claude/settings.local.json`(gitignore)에는 이 머신에서만 필요한 샌드박스 경로와 개인 플러그인을 둔다. **공유 설정에 절대 경로를 쓰지 않는다.** 홈 디렉터리는 `~/`로 적는다.

### 샌드박스를 켠 개발자용 메모

Go 빌드 캐시(`go env GOCACHE`)가 홈에 있어 쓰기가 막힌다. 그래도 `nx build api` · `nx test api` · `nx vet api`는 느려질 뿐 정상 동작하고, 실패하는 것은 `go clean -cache` 하나다. 캐시가 필요하면 `settings.local.json`에 자기 경로를 넣는다.

```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": ["~/Library/Caches/go-build"]
    }
  }
}
```

pnpm store는 프로젝트 안(`.pnpm-store/`)에 있어 이미 쓸 수 있다.

## MCP와 plugin

MCP 서버와 plugin은 사용자 권한으로 임의 코드를 실행하고, 응답 텍스트가 컨텍스트로 들어온다. 추가 전에 확인한다.

1. 로컬 CLI로 되는가 (`git`, `gh`, `nx`, `go`)
2. Claude Code 내장으로 되는가
3. 이미 있는 저장소 도구와 겹치지 않는가
4. 팀 전원이 설치해야 하는 부담을 감수할 값어치가 있는가

### 현재 상태

**프로젝트에 로컬 MCP 서버는 없다.** `settings.json`의 plugin 키:

```json
"extraKnownMarketplaces": { "berrypjh": { "source": { "source": "github", "repo": "berrypjh/shared-stack" } } },
"enabledPlugins": { "berry-commit@berrypjh": true, "berry-dev@berrypjh": true, "code-review@claude-plugins-official": true }
```

- **`berry-commit`** — `commit-mcp`(tool `mcp__plugin_berry-commit_commit-mcp__*`)와 `/commit-scope`. 쓰기 tool은 `commit_scope` 하나, 네트워크 · credential 접근 없음. git은 `spawnSync('git', args)` 배열로 불러 커밋 문구가 셸로 해석되지 않는다. 빌드 없이 커밋된 `dist/index.js`를 실행하므로 신뢰 표면이 shared-stack에 있다
- **`berry-dev`** — skill 둘(`repo-verify` · `frontend-quality`)과 secret hook. Node 내장 모듈만 쓰고 네트워크 호출이 없다. standards rule은 plugin이 아니라 `harness:sync`가 `_generated/`에 쓴다 — marketplace 설치본은 version이 같아도 SHA가 다를 수 있어 고정 checkout을 쓴다
- **`code-review@claude-plugins-official`** — GitHub PR 전용. 스킬의 `allowed-tools`가 trust 게이트를 받지 않아 `gh pr comment`(외부 쓰기)가 미리 승인된다

사용자 스코프(`~/.claude/settings.json`)에서 켠 plugin은 저장소에 흔적이 없어 팀원 환경에서 재현되지 않는다. 팀이 쓸 것은 프로젝트 `enabledPlugins`에 선언한다.

### 외부 없이도 돌아가야 한다

`AGENTS.md` · rules(`_generated/` 포함) · `harness.profile.md` · permissions는 MCP와 plugin 없이도 동작한다. plugin이 없을 때 남는 것:

- `/berry-commit:commit-scope` — 손으로 커밋, permission의 ask가 지킨다
- `berry-dev`의 두 skill — profile을 직접 읽고 검증한다
- secret hook — permission의 Read deny만 남는다

공용 UI 조회도 설치된 패키지 bin(`berry-react-ui`)만 쓴다. 저장소를 이해하고 검증하는 능력을 외부 서버에 의존시키지 않는다.

## Memory

무엇을 어디에 두는지는 `AGENTS.md`의 Memory 절에 있다. auto memory는 기본값 그대로 켜 두었고, architecture의 source of truth로 쓰지 않는다.

- **머신 로컬이다** — git에도, 다른 머신에도 가지 않는다
- **`MEMORY.md`는 200줄 또는 25KB에서 잘린다** — 넘긴 부분은 로드되지 않는다
- **리뷰를 거치지 않는다** — Claude가 스스로 쓴다

내용은 `/memory`로 읽고 고치고 지운다.

## 확장하는 법

1. 이미 있는 저장소 도구나 Claude 내장이 푸는 문제인지 먼저 확인한다
2. 위 표에서 자리를 고른다
3. 같은 내용이 이미 다른 곳에 있는지 검색한다. 있으면 **옮기고**, 새로 쓰지 않는다
4. rule을 추가하면 `paths`를 반드시 붙인다
5. `/context`로 실제 로드 여부와 비용을 확인한다

## Troubleshooting

**규칙이 안 지켜진다** — `/context`의 Memory files에 파일이 있는지 본다. rule은 매칭되는 파일을 **읽어야** 로드된다.

**path rule이 안 걸린다** — 세션 중에 만든 rule은 그 세션에서 로드되지 않으므로 새 세션에서 본다. 그래도 안 걸리면 `paths` glob이 저장소 루트 기준인지 확인하고, `InstructionsLoaded` 훅으로 로드 시점을 찍어본다. 직접 물어볼 수도 있다.

```bash
claude -p "Read apps/web/src/app/page.tsx. Then answer with ONLY: RULES_SEEN=<rule filenames you were given, or NONE>"
```

**compact 후 지시가 사라진 것 같다** — `AGENTS.md`는 자동으로 다시 주입되고, path rule은 다음에 매칭 파일을 읽을 때 재로드된다.

**설정이 안 먹는다** — `/status`로 실제 로드된 settings 파일을 본다. `claude doctor`는 설치 상태를 점검한다.

**컨텍스트가 무겁다** — `/context`로 비중을 보고, `/doctor`로 안 쓰는 skill · MCP · plugin을 찾는다.

## Experimental 기능 정책

**실험적/preview 기능은 기본 구성에 넣지 않는다.** 개인 시험은 `settings.local.json`에 둔다.

- 제외 — Agent view(research preview) · Agent Teams(experimental) · `prompt`/`agent` 타입 hook(experimental)
- 플랜에 따라 쓸 수 없어 전제로 삼지 않음 — Remote Control · Routines · Channels · Claude in Chrome
