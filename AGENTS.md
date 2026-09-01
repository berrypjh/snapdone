# snapdone — AI 이미지 액션 라우터

> `CLAUDE.md`가 `@AGENTS.md`로 이 파일을 불러온다. 에이전트 지침의 단일 출처는 이 파일이다.

사진이나 스크린샷을 넣으면 무엇을 하려던 것인지 알아채고, 그 일을 대신 끝내주는 앱.

`Capture → Understand → Route → Act → Learn` 중 무게중심은 **Act**다. 성공 기준은 "AI가 분석했다"가 아니라 **사용자가 하려던 일이 끝난 것**이다. 화면에 남는 마지막 문장은 "캘린더에 등록했습니다" 같은 완료 보고이며, 분석 과정 · 신뢰도 점수 · 모델 이름은 결과가 아니다.

## Repository Overview

Nx integrated monorepo. package manager는 **pnpm**(`package.json`의 `packageManager`로 고정). 기본 locale은 `ko-KR`.

| project      | 위치               | 스택                 | 역할                        |
| ------------ | ------------------ | -------------------- | --------------------------- |
| `web`        | `apps/web`         | Next.js + TypeScript | 브라우저 제품 경험          |
| `mobile`     | `apps/mobile`      | Expo + React Native  | 모바일 제품 경험            |
| `api`        | `apps/api`         | Go                   | 서버 로직 · 외부 연동       |
| `web-e2e`    | `apps/web-e2e`     | Playwright           | web E2E                     |
| `commit-mcp` | `tools/mcp/commit` | TypeScript           | 커밋 메시지 MCP (개발 도구) |

`libs/`는 비어 있다. `docs/`는 제품 · 아키텍처 문서다.

**target 이름은 프로젝트마다 다르다. 문서를 믿지 말고 `nx show project <이름>`으로 확인한다.** `api`에는 `lint`가 없고 `vet`과 `fmt`를 쓴다. `mobile`의 `build`는 로컬 빌드가 아니라 EAS 클라우드 빌드다.

## Working Principles

- 수정 전 관련 코드를 **읽는다.** 추측해서 덮어쓰지 않는다
- 기존 architecture와 convention을 먼저 재사용한다. 새 방식을 들여오기 전에 기존 것으로 왜 안 되는지 설명한다
- **사용자의 미커밋 변경을 보존한다.** `reset` · `checkout --` · `stash`로 되돌리지 않는다
- 관계없는 refactor를 하지 않는다. scope 밖 기능을 만들지 않는다
- TODO만 남기고 완료를 선언하지 않는다
- 작게 · 점진적으로 진행하고 각 단계를 검증한 뒤 넘어간다
- 문제를 고칠 때는 **근본 원인을 먼저 증명한다.** 재현 → 증거 → 수정. 추측 workaround를 넣지 않는다
- 과도한 방어적 프로그래밍을 하지 않는다. 모듈 · 함수는 짧게, 이름은 분명하게
- 주석은 docstring 위주로 간결하게. 코드 · print · 로그에 이모지를 쓰지 않는다

### Platform boundary

Web · React Native · Go는 각자의 정상 architecture를 유지한다. **Nx 때문에 플랫폼 관례를 깨지 않는다.**

- **Web UI를 React Native에 그대로 복제하지 않는다.** 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다
- **frontend 작업에서 `apps/api`를 고치지 않는다.** 두 세계의 계약 접점은 `{ status: string }` 하나뿐이다
- 공유는 `libs/`로만 한다. DOM component · RN component · CSS · platform API는 공유하지 않는다
- 새 Nx library는 **두 번째 사용처가 실제로 나타났을 때** 만든다. 미리 만들지 않는다

경로별 상세 규칙은 `.claude/rules/`에 있고 해당 파일을 열 때 적용된다.

### Dependency

설치하기 **전에** 순서대로 확인하고 결과를 설명한 뒤에만 설치한다.

1. 기존 dependency로 되는가
2. 표준 라이브러리로 되는가 (Go stdlib · Node 내장 · Web API)
3. 현재 platform SDK로 되는가 (Next.js · Expo)
4. 그래도 필요하면 왜 필요한지

**"편해서"는 사유가 아니다.** 설치가 필요하면 실행하기 전에 사용자에게 요청한다.

버전은 임의로 올리지 않는다. Nx plugin(`@nx/*`)은 개별 `pnpm add` 금지 — `nx add` 또는 `nx migrate`만 쓴다. **Expo는 SDK 56에 고정한다**(`@nx/expo`가 57 미지원, nrwl/nx#36443). 고정 버전 표는 [target-architecture.md](docs/architecture/target-architecture.md#버전-정책).

## Validation

- 완료를 선언하기 전에 **영향 범위를 검증한다.** 검증하지 않은 것을 검증했다고 말하지 않는다
- 가장 작은 범위부터 올라간다. 한 프로젝트 변경에 전체 `pnpm verify`를 돌리지 않는다
- lint · typecheck · test 오류를 무시하지 않는다. 기존 테스트를 깨뜨리지 않는다
- 무엇을 어디까지 돌릴지는 `/repo-verify`가 판단한다. UI를 바꿨으면 `/frontend-quality`로 제품 기준도 본다

**AI 세션에서 실행할 수 없는 것**이 있다. dev 서버 · `pnpm e2e` · `nx build web`은 포트 바인딩이 막혀 있다(web은 Turbopack의 PostCSS 워커가 포트를 연다). 셋 다 사용자 터미널에서는 정상 동작하므로 실행을 요청한다. `nx build mobile`은 EAS 클라우드 빌드이고, mobile 런타임 검증은 수단 자체가 없다. 실행하지 못했으면 그렇게 보고한다.

검증 명령은 [quality-gates.md](docs/engineering/quality-gates.md).

## Git Safety

명시적 요청 없이 하지 않는다.

- commit · push · force push · merge · branch 삭제 · tag · release · deploy
- **`nx submit mobile`**(스토어 제출)과 **`nx build mobile`**(EAS 클라우드 빌드)
- `git reset --hard` · `git checkout --` · `git stash` — 사용자 변경을 지운다

커밋은 `/commit-scope`로 한다. scope별로 사용자 승인을 받은 뒤에만 커밋한다.

## Memory

| 어디에                                                                       | 무엇을                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **committed** — `AGENTS.md` · `.claude/rules/` · `.claude/skills/` · `docs/` | architecture · 안정적인 convention · 명령 · 팀 정책           |
| **auto memory**                                                              | 이 머신에서 반복되는 사실 (막히는 경로, 우회 방법, 개인 선호) |

architecture를 auto memory에만 두지 않는다. **secret과 credential은 어디에도 저장하지 않는다.**

## 문서

| 문서                                                               | 내용                         |
| ------------------------------------------------------------------ | ---------------------------- |
| [product-principles.md](docs/product/product-principles.md)        | 제품 판단 기준               |
| [target-architecture.md](docs/architecture/target-architecture.md) | 구조와 경계                  |
| [data-access.md](docs/architecture/data-access.md)                 | API 호출 규칙, CORS 판단     |
| [foundation.md](docs/design/foundation.md)                         | 디자인 토큰, App Shell       |
| [local-development.md](docs/development/local-development.md)      | 실행 · 환경변수 · 트러블슈팅 |
| [quality-gates.md](docs/engineering/quality-gates.md)              | 검증 · 의존성 · 보안 원칙    |

AI harness(rule · skill · hook · permission)가 어떻게 구성돼 있는지는 [.claude/README.md](.claude/README.md).
