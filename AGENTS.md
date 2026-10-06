# snapdone — AI 이미지 액션 라우터

> `CLAUDE.md`가 `@AGENTS.md`로 이 파일을 불러온다. 에이전트 지침의 단일 출처는 이 파일이다.

사진이나 스크린샷을 넣으면 무엇을 하려던 것인지 알아채고, 그 일을 대신 끝내주는 앱.

`Capture → Understand → Route → Act → Learn` 중 무게중심은 **Act**다. 성공 기준은 "AI가 분석했다"가 아니라 **사용자가 하려던 일이 끝난 것**이다. 화면에 남는 마지막 문장은 "캘린더에 등록했습니다" 같은 완료 보고이며, 분석 과정 · 신뢰도 점수 · 모델 이름은 결과가 아니다.

## Repository Overview

Nx integrated monorepo. package manager는 **pnpm**(`package.json`의 `packageManager`로 고정). 기본 locale은 `ko-KR`.

| project      | 위치              | 스택                 | 역할                                                                          |
| ------------ | ----------------- | -------------------- | ----------------------------------------------------------------------------- |
| `web`        | `apps/web`        | Next.js + TypeScript | 브라우저 단독 서비스 · 앱 WebView 콘텐츠 화면                                 |
| `mobile`     | `apps/mobile`     | Expo + React Native  | **주 제품** — 네이티브 셸 · 핵심 흐름 · WebView 호스트                        |
| `api`        | `apps/api`        | Go                   | 서버 로직 · 외부 연동                                                         |
| `web-e2e`    | `apps/web-e2e`    | Playwright           | web E2E                                                                       |
| `devhub`     | `apps/devhub`     | Next.js + TypeScript | 내부 도구 — 저장소의 시나리오 · 구조 · 근거 탐색. 제품 앱을 import하지 않는다 |
| `devhub-e2e` | `apps/devhub-e2e` | Playwright           | devhub E2E                                                                    |

`libs/`에는 `webview-bridge`(앱 ↔ WebView 계약), `auth-contracts`(인증 wire 타입), `onboarding`(온보딩 규칙 · 진행 · 사진 처리 계약)이 있다. 경계는 tag(`type:app` · `type:lib` · `type:e2e`)와 루트 `eslint.config.mjs`가 강제한다. `docs/`는 제품 · 아키텍처 문서다.

**제품 구성은 네이티브 셸 + 웹 콘텐츠다.** Capture → Act 핵심 흐름과 네비게이션 · 로그인 · 권한은 mobile 네이티브, 결과 상세 · 기록 · 공지 · 설정 같은 콘텐츠 화면은 web 한 벌을 브라우저와 앱 WebView에서 함께 쓴다. 둘은 코드로 참조하지 않고 URL과 `libs/`의 메시지 계약으로만 이어진다 ([target-architecture.md](docs/architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠)).

**target 이름은 프로젝트마다 다르다. 문서를 믿지 말고 `nx show project <이름>`으로 확인한다.** `api`에는 `lint`가 없고 `vet`과 `fmt`를 쓴다. `mobile`의 `build`는 로컬 빌드가 아니라 EAS 클라우드 빌드다.

## Working Principles

탐색 · 재사용 · 작은 변경 · 미커밋 변경 보존 · 의존성 검토 · 검증 정직성은 공통 rule(`.claude/rules/_generated/core.md`)을 따른다. 여기에는 더하는 것만 둔다.

- 문제를 고칠 때는 **근본 원인을 먼저 증명한다.** 재현 → 증거 → 수정. 추측 workaround를 넣지 않는다
- 과도한 방어적 프로그래밍을 하지 않는다. 모듈 · 함수는 짧게, 이름은 분명하게
- 주석은 docstring 위주로 간결하게. 코드 · print · 로그에 이모지를 쓰지 않는다

### Platform boundary

Web · React Native · Go는 각자의 정상 architecture를 유지한다. **Nx 때문에 플랫폼 관례를 깨지 않는다.**

- **Web UI를 React Native에 그대로 복제하지 않는다.** 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다
- **frontend 작업에서 `apps/api`를 고치지 않는다.** 두 세계는 HTTP 응답 계약으로만 만난다
- 공유는 `libs/`로만 한다. DOM component · RN component · CSS · platform API는 공유하지 않는다
- 새 Nx library는 **두 번째 사용처가 실제로 나타났을 때** 만든다. 미리 만들지 않는다
- 공용 UI 컴포넌트 · 토큰은 **설치된 패키지의 공개 CLI로 조회한다**(`berry-react-ui`). shared-stack source를 읽거나 복사하지 않는다. 순서는 web · mobile rule에 있다

경로별 상세 규칙은 `.claude/rules/`에 있고 해당 파일을 열 때 적용된다.

### Dependency

설치 전 확인 순서는 공통 rule — 기존 dependency → 표준 라이브러리(Go stdlib · Node 내장 · Web API) → platform SDK(Next.js · Expo). **"편해서"는 사유가 아니다.** 설치는 실행 전에 사용자에게 요청한다.

Nx plugin(`@nx/*`)은 개별 `pnpm add` 금지 — `nx add` 또는 `nx migrate`만 쓴다. **Expo는 SDK 56에 고정한다**(`@nx/expo`가 57 미지원, nrwl/nx#36443). 고정 버전 표는 [target-architecture.md](docs/architecture/target-architecture.md#버전-정책).

## Validation

- 한 프로젝트 변경에 전체 `pnpm verify`를 돌리지 않는다
- 무엇을 어디까지 돌릴지는 `/berry-dev:repo-verify`가 판단한다. UI를 바꿨으면 `/berry-dev:frontend-quality`로 제품 기준도 본다. 둘이 읽는 snapdone 사실은 `.claude/harness.profile.md`

**AI 세션에서 실행할 수 없는 것**이 있다. dev 서버 · `pnpm e2e` · `nx build web` · `nx build devhub`는 포트 바인딩이 막혀 사용자 터미널에서 실행을 요청한다. mobile 런타임 검증은 수단이 없다. 목록의 정본은 `.claude/harness.profile.md`.

검증 명령은 [quality-gates.md](docs/engineering/quality-gates.md).

## Git Safety

명시적 요청 없이 하지 않는다.

- commit · push · force push · merge · branch 삭제 · tag · release · deploy
- **`nx submit mobile`**(스토어 제출)과 **`nx build mobile`**(EAS 클라우드 빌드)
- `git reset --hard` · `git checkout --` · `git stash` — 사용자 변경을 지운다

커밋은 공용 plugin `berry-commit`의 `/berry-commit:commit-scope`로 한다(`.claude/settings.json`의 `enabledPlugins`). scope별로 사용자 승인을 받은 뒤에만 커밋한다.

## Memory

| 어디에                                                                       | 무엇을                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **committed** — `AGENTS.md` · `.claude/rules/` · `.claude/skills/` · `docs/` | architecture · 안정적인 convention · 명령 · 팀 정책           |
| **auto memory**                                                              | 이 머신에서 반복되는 사실 (막히는 경로, 우회 방법, 개인 선호) |

architecture를 auto memory에만 두지 않는다. **secret과 credential은 어디에도 저장하지 않는다.**

## 문서

| 문서                                                               | 내용                                |
| ------------------------------------------------------------------ | ----------------------------------- |
| [product-principles.md](docs/product/product-principles.md)        | 제품 판단 기준                      |
| [target-architecture.md](docs/architecture/target-architecture.md) | 구조와 경계                         |
| [data-access.md](docs/architecture/data-access.md)                 | API 호출 규칙, CORS 판단            |
| [agent-evaluation.md](docs/architecture/agent-evaluation.md)       | 평가 harness — 계약 · 실행 · 산출물 |
| [foundation.md](docs/design/foundation.md)                         | 디자인 토큰, App Shell              |
| [local-development.md](docs/development/local-development.md)      | 실행 · 환경변수 · 트러블슈팅        |
| [quality-gates.md](docs/engineering/quality-gates.md)              | 검증 · 의존성 · 보안 원칙           |

AI harness(rule · skill · hook · permission)가 어떻게 구성돼 있는지는 [.claude/README.md](.claude/README.md).
