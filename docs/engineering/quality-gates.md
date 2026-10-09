# Quality Gates

## PR 올리기 전에

```bash
pnpm verify
```

`format:check → lint → typecheck → test → test:hooks → build` 순서, 하나라도 실패하면 중단. 개별 실행은 아래 명령

| 명령                            | 실제로 도는 것                                 | 대상                                                                                                            |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`             | `prettier --check .`                           | 저장소 전체 (`.prettierignore` 제외)                                                                            |
| `pnpm lint`                     | `nx run-many -t lint,vet,fmt` 뒤 루트 `eslint` | web · mobile · web-e2e · libs는 eslint, api는 `go vet` + gofmt, 루트 eslint는 `tools/scripts` · `.claude/hooks` |
| `pnpm typecheck`                | `nx run-many -t typecheck`                     | web · mobile · web-e2e · libs                                                                                   |
| `pnpm test`                     | `nx run-many -t test`                          | api `go test`, web · mobile · libs · devhub Vitest. devhub 캐시 없음                                            |
| `pnpm test:hooks`               | `node --test tools/scripts/*.test.mjs`         | `.claude/hooks/` 포트 차단 · `tools/scripts`. Nx 밖 별도 명령                                                   |
| `pnpm harness:check`            | `node tools/scripts/harness.mjs check`         | `.claude/rules/_generated/`가 고정한 berry-dev standards와 같은지. 쓰지 않음. **verify 제외**                   |
| `pnpm build`                    | `nx run-many -t build --exclude=mobile`        | web · api · devhub. devhub는 git 스냅샷을 넣어 캐시 없음                                                        |
| `pnpm e2e`                      | `nx run-many -t e2e`                           | web-e2e · devhub-e2e. **verify 제외**                                                                           |
| `pnpm devhub:check`             | `nx run devhub:devhub-check`                   | DevHub catalog ↔ 저장소 일치. `pnpm test`에도 포함                                                              |
| `pnpm eval:check`               | `nx run api:eval-check`                        | 평가 harness offline 테스트 + sample dataset. 모델 호출 없음. **verify 제외**                                   |
| `pnpm eval`                     | `nx run api:eval`                              | 평가 CLI(`pnpm eval list`). `run` · `retry`만 `--allow-api` 시 provider 호출                                    |
| `pnpm swagger:check`            | `nx run api:swagger-check`                     | `docs/swagger` ↔ swag 주석 일치. 파일 수정 없음                                                                 |
| `pnpm swagger` · `pnpm migrate` | `nx run api:swagger` · `nx run api:migrate`    | Swagger 재생성 · DB 마이그레이션 적용(Postgres 필요)                                                            |

- **`test:hooks`** — Node 24 내장 러너, 의존성 없음
- **`nx run-many`** — target이 없는 프로젝트는 조용히 건너뜀. 없는 target 때문에 실패하지 않음

### 공유 설정 패키지

lint · format · tsconfig는 `@berrypjh/*` 공유 패키지 상속. GitHub Packages라 `.npmrc`와 `GITHUB_TOKEN` 필요

| 패키지                        | 연결 지점                      | 주는 것                                                                 |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `@berrypjh/eslint-config`     | `eslint.config.mjs`            | `base`(import 정렬 · unused-imports · no-explicit-any) · `nx` · `react` |
| `@berrypjh/prettier-config`   | `package.json`의 `prettier` 키 | `printWidth: 100` · `singleQuote` · md/yaml override                    |
| `@berrypjh/tsconfig`          | `tsconfig.base.json`           | `next.json`(앱)                                                         |
| `@berrypjh/commitlint-config` | `commitlint.config.js`         | type 11종 · `!:` 금지                                                   |

**`.prettierrc` 없음.** `package.json`의 `"prettier"` 키로 지정

#### 이 저장소에서 다르게 한 것

- **`jsx-a11y`는 web에만** — `apps/web/eslint.config.mjs`만 `@berrypjh/eslint-config/react` 사용. React Native에는 DOM이 없어 `no-autofocus` 같은 규칙이 오탐
- **`react-hooks` · `jsx-a11y`** — `flat/react-typescript`는 플러그인을 등록하지 않아 `/react`가 채움
- **`lint-staged`의 `*.go` → `gofmt -w`** — `api`에 `lint` target이 없어서 추가

### `format`이 `nx format`이 아닌 이유

`nx format:check`는 base 대비 변경 파일만 검사해, 포맷이 어긋난 채 들어온 파일을 다시 잡지 못함. `prettier --check .`는 저장소 전체 검사

### 커밋 시점 게이트

| 훅                  | 하는 일                                                      |
| ------------------- | ------------------------------------------------------------ |
| `.husky/pre-commit` | `lint-staged` — staged 파일에 eslint · prettier · gofmt 적용 |
| `.husky/commit-msg` | `commitlint` — 커밋 메시지 형식 강제                         |

`git commit --no-verify`로 건너뛰기 가능. husky는 `pnpm install`의 `prepare` 스크립트가 설치

### `verify`가 e2e를 빼는 이유

브라우저 바이너리와 dev 서버가 필요해 매번 돌리기엔 무거움. CI에서는 별도 잡. 브라우저 설치 · 실행 주의점은 [local-development.md](../development/local-development.md)의 검사

- **`e2e-ci`** — `@nx/playwright/plugin`이 spec 파일마다 `e2e-ci--src/<file>` target을 생성. web-e2e는 고정 포트라 CI에서 쓰지 않음

### CI (`.github/workflows/ci.yml`)

PR과 main push마다 바뀐 프로젝트만(`nx affected`). 잡 세 개가 병렬

| 잡       | 내용                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks` | `format:check` · `lint` `vet` `fmt` `typecheck` `test` `swagger-check` · `build`(mobile 제외) · `devhub:check` · `test:hooks`. Postgres 서비스로 DB 테스트까지 |
| `e2e`    | Playwright 세 브라우저. 실패하면 리포트를 artifact로                                                                                                           |
| `docker` | 바뀐 api · web 이미지를 push 없이 빌드                                                                                                                         |
| `deploy` | main push에서만. 세 잡이 모두 통과하면 바뀐 api · web을 `deploy.sh`로 배포([deployment.md](../development/deployment.md#자동-배포))                            |

- **비공개 패키지** — `GITHUB_TOKEN`(`packages: read`)으로 `@berrypjh` 설치. 패키지 설정에서 이 저장소에 읽기 권한 필요
- **로컬과 차이** — DB 테스트와 e2e는 AI 세션에서 돌지 않지만 CI에서는 돔

### `build`가 mobile을 빼는 이유

`mobile`의 `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**(Expo 계정 필요, 원격 실행). 로컬 번들 확인은 `pnpm exec nx export mobile`

## 테스트 현황 — 솔직하게

| 프로젝트   | 종류             | 명령        | 상태                                                                                      |
| ---------- | ---------------- | ----------- | ----------------------------------------------------------------------------------------- |
| api        | 단위 · DB        | `pnpm test` | Go test. `TEST_DATABASE_URL` 없으면 DB 테스트 **skip**. 평가 harness는 provider 호출 없음 |
| web        | 단위             | `pnpm test` | Vitest                                                                                    |
| mobile     | 단위             | `pnpm test` | Vitest                                                                                    |
| libs       | 단위             | `pnpm test` | Vitest                                                                                    |
| web-e2e    | E2E              | `pnpm e2e`  | Playwright × 3 브라우저 + 오류 주입                                                       |
| devhub     | 단위 · freshness | `pnpm test` | Vitest. catalog ↔ 저장소 검사는 `pnpm devhub:check`로 따로 실행                           |
| devhub-e2e | E2E              | `pnpm e2e`  | Playwright × Chromium                                                                     |

- **DB 검증** — `nx test api` 통과가 DB 검증을 뜻하지 않음. Postgres를 띄우고 `TEST_DATABASE_URL`을 주고 실행
- **덮인 범위** — web `src/lib/**` · mobile `src/lib/**` · `src/auth/**` · `src/onboarding/**`(api 호출 · 인증 · 온보딩 진행 · 사진 처리 순수 로직), `libs/*`, Go 인증 · 사진 처리 전체
- **모델 호출** — 사진 처리의 Claude 호출은 가짜 HTTP 응답으로만 검사, 실제 API 호출 없음
- **단위 테스트 없음** — 화면 컴포넌트 · 디자인 토큰 · App Shell. web 셸 · 로그인 화면은 E2E가 대신 잡음
- **mobile 화면** — 런타임 검증 수단이 없어 코드 판독과 실기기 수동 인수까지가 한계

### 단위 테스트 실행 방식

- **한 번 실행** — `nx.json`의 `@nx/vitest` 플러그인이 `testMode: "run"`. `"watch"`로 두면 `pnpm verify`가 watch에 걸려 멈춤. watch 실행은 [local-development.md](../development/local-development.md)의 검사
- **환경** — `vitest.config.ts`는 `environment: 'node'`. React 컴포넌트 단위 테스트가 생길 때 `jsdom` · `@testing-library/react` · `@vitejs/plugin-react`를 함께 추가
- **spec 타입 검사** — `pnpm typecheck`가 담당. vitest는 타입을 검사하지 않으므로 tsconfig에 `*.spec.ts` exclude를 다시 넣지 않음

### E2E 범위

`apps/web-e2e`는 홈, **반응형 셸 계약**, 로그인 흐름을 고정함. 홈은 보호 page라 셸 계약도 로그인 상태로 확인

셸 계약 — 유틸리티 클래스 하나만 잘못 고쳐도 깨짐

- `<html lang="ko">`, `<h1>` 텍스트, 상태 문구
- 1280px · 768px(경계)에서 사이드바(`complementary` 랜드마크) 노출
- 767px에서 사이드바 사라지고 헤더(`banner`)가 제품명을 대신 표시
- 320px에서 가로 스크롤 없음 — 한국어 텍스트가 길어 실제로 터질 수 있는 지점
- 첫 Tab이 "본문으로 건너뛰기"(`SkipLink`)에 멈추고 드러나며, Enter 뒤 포커스가 `main`으로 이동. WebKit은 링크 이동에 `Alt+Tab` 사용

역할 기반 선택자라 시맨틱 랜드마크까지 함께 검증됨. 자세한 계약은 [design/foundation.md](../design/foundation.md).

흐름별 범위

- **로그인** — 로그인 · 온보딩 화면의 반응형 · 접근성, 보호 경로 redirect와 복귀, 로그아웃, WebView 핸드오프
- **온보딩** — 첫 사진 → 첫 결과 → 완료 → 홈, 결과 화면의 320px · 포커스 · 키보드 완료
- **사진 처리**(`photo-flow` · `processing-result` · `reprocess` · `home-flow`) — 추가 → 확인 → 처리 → 결과, unsupported · ambiguous, 재처리와 기본값 저장의 분리, 실패 뒤 재시도, 세션 만료, 다른 사용자 작업 차단
- **사진 종류별 기본 처리**(`/settings/processing`) — 유형별 저장 · 유지, 다른 유형 · 사용자 무영향, 저장 실패 표시, 키보드 · 320px, 앱 모드 · 핸드오프 진입
- **홈** — 빈 홈 · 최근 처리 홈, 다른 사용자 기록 미표시, 읽기 실패를 빈 상태로 보이지 않음, 320px · 키보드
- **가짜 API** — `src/support/fake-api.mts`. 실제 Google 접속 없음, 처리 규칙은 Go를 흉내 냄(사진 digest 비교 제외), 사용자별 실패 주입은 `__fixture/sessions`. 운영 바이너리에는 가짜 provider 스위치 없음

실행 방법과 함정은 `.claude/rules/e2e.md`.

**mobile에는 E2E 없음.** Detox는 시뮬레이터 · 에뮬레이터가 필요한데 이 환경에 없음(full Xcode · Android SDK 미설치). 실행 환경이 갖춰지면 그때 판단

## Go

```bash
pnpm exec nx fmt api     # gofmt 위반 시 실패
pnpm exec nx vet api     # go vet ./...
pnpm exec nx test api    # go test ./...
pnpm exec nx build api   # dist/apps/api/api
pnpm swagger:check   # docs/swagger가 주석과 일치하는지 (파일을 고쳐 쓰지 않는다)
```

- **묶음 포함 여부** — fmt · vet · test는 `pnpm lint` · `pnpm test`에 포함. `swagger-check`는 어느 묶음에도 없음. 대신 `go test`의 `TestEveryRouteIsDocumentedInSwagger`가 주석 없는 endpoint를 `pnpm test`에서 잡음
- **HTTP 테스트** — `httptest`로 실제 Gin router 호출. `http.Server` 동작은 `net.Pipe` listener로 포트 없이 확인
- **`fmt`는 검사만** — 파일을 고쳐 쓰지 않음. 위반은 로컬에서 `gofmt -w .`로 수정

## 평가 harness

```bash
pnpm eval:check      # offline Go 테스트 + sample dataset 검증 · readiness. 모델 호출 없음, 캐시 없음
pnpm eval list    # dataset · variant 목록. 모델 호출 없음
```

- **유료 호출** — `api:eval`의 `run` · `retry`만 실제 provider 호출, `--allow-api`와 `--max-api-calls N` 둘 다 필요. `pnpm test` · `pnpm verify`에는 섞이지 않음
- **산출물** — `tools/evals/results/`(git ignore)

자세한 것은 [agent-evaluation.md](../architecture/agent-evaluation.md).

## API 연결 확인

```bash
pnpm dev:api    # 다른 터미널
pnpm health
```

`pnpm health`는 web 앱의 `fetchHealth`를 그대로 호출하는 개발자용 명령. 제품 화면 아님

## Dependency 추가 원칙

설치 **전에** 순서대로 확인하고 결과를 설명

1. 기존 dependency로 되는가
2. 표준 라이브러리로 되는가 (Go stdlib, Node 내장, Web API)
3. 현재 platform SDK로 되는가 (Next.js / Expo)
4. 그래도 필요하면 왜 필요한지

**"편해서"는 사유가 아님.**

적용 예

- **axios 미도입** — Node와 RN 모두 `fetch` 기본 제공
- **Gin · swaggo** — DTO · binding · route group · Swagger가 실제로 필요해진 뒤 도입. HTTP 경계에만 쓰고 request ID · 로그 · recovery는 표준 라이브러리
- **`react-native-safe-area-context` 도입** — RN `SafeAreaView`가 deprecated이고 Android edge-to-edge 미지원

### mobile에 패키지를 추가할 때

버전은 Expo SDK 지정값 사용. 루트 `package.json`에 실제 버전, `apps/mobile/package.json`에는 `"*"`. 확인 명령과 이유는 [local-development.md](../development/local-development.md)의 Expo SDK 버전 고정

### Nx 플러그인

개별 `pnpm add` 금지. `nx add` 또는 `nx migrate`만 사용. `nx`와 모든 `@nx/*`는 정확히 같은 버전

## Security 기본 원칙

### Secret

- 실제 secret을 커밋하지 않음
- `.env`, `.env.local`, `.env.*.local`은 git 제외, `.env.example`은 추적
- **`.env.example`에는 예시 값만** — 지금은 localhost 개발 주소와 개발 기본값뿐, 인증 키 · OAuth 클라이언트 값은 비어 있음

### 클라이언트에 노출되는 값

- `NEXT_PUBLIC_*` · `EXPO_PUBLIC_*`는 번들에 **인라인되는 공개값**. 이 접두사 뒤에 secret을 두지 않음
- 변수별 공개 여부는 [local-development.md](../development/local-development.md)의 public 접두사

### Backend

- **오류 응답에 내부 정보 없음** — 스택 · 파일 경로 · SQL · 내부 식별자 미노출. 오류 응답은 `writeError`가 만드는 `{"error": "<code>"}` 하나
- 서버 설정은 환경변수로 받음. 하드코딩 금지
- CORS는 **필요해질 때** 도입. 지금은 cross-origin 요청 주체가 없어 CORS 코드 없음
- CORS 도입 시 허용 origin은 설정으로 관리하고 dev/production 분리. **production에서 `*` 금지**

자세한 판단 근거는 [data-access.md](../architecture/data-access.md).

### 로깅

- 토큰 · 비밀번호 · 개인정보 · **이미지 내용**을 로그에 남기지 않음
- 입력 스크린샷에 이름 · 전화번호 · 계좌번호가 흔함. 이미지와 분석 결과 원문 로그 금지
- 요청 로그는 request_id · method · route template · status · latency까지. 원문 URL · query · 헤더 · 본문 미기록

### 앱 코드의 `console`

앱 소스에 `console.*`를 남기지 않음. 예외는 출력이 곧 인터페이스인 CLI 도구뿐

- `tools/scripts/check-api-health.mjs` — 검사 결과 출력

### 자동 실행되는 코드

`.claude/hooks/` · `.husky/` · `commitlint.config.js` · `package.json`의 `prepare`/`lint-staged`는 **지시 없이도 실행됨.** 이 파일들의 변경은 일반 코드와 다르게 리뷰. 무엇이 언제 도는지와 리뷰 절차는 [.claude/README.md의 신뢰 표면](../../.claude/README.md#신뢰-표면).

lint · format · tsconfig · commitlint 설정은 **npm 공식 레지스트리가 아니라** GitHub Packages(`@berrypjh/*`)에서 옴

## TypeScript

- `any` 남용 금지. 외부 응답은 좁은 타입 가드로 확인 (`apps/*/src/lib/api.ts` 참고)
- unused import · dead code 금지. `tsconfig.base.json`의 `noUnusedLocals`가 잡음
- 생성된 tsconfig를 한 번에 "초엄격"으로 바꾸지 않음. 새 코드에서 타입을 분명히 하는 방향

## 접근성

화면을 추가할 때마다 확인

- **Web** — `html lang="ko"` / `header`·`main`·`aside` 같은 시맨틱 landmark / 전역 `:focus-visible` 포커스 링 / 클릭 가능한 것은 `<button>` 또는 `<a>`
- **Mobile** — `accessibilityRole` / 최소 44px 터치 타깃 / Safe Area
- **공통** — 긴 한국어 문장에서 버튼 · 카드 제목이 깨지지 않는지. 한국어는 영어보다 길고 줄바꿈 규칙이 다름

토큰과 원칙은 [design/foundation.md](../design/foundation.md).
