# Quality Gates

여기 적힌 명령은 전부 실제로 존재하고 통과하는 것들이다. 동작하지 않는 명령은 적지 않는다.

## PR 올리기 전에

```bash
pnpm verify
```

`format:check → lint → typecheck → test → test:hooks → build` 순으로 돌고, 하나라도 실패하면 거기서 멈춘다. 하나씩 돌리려면 아래를 쓴다.

| 명령                            | 실제로 도는 것                                 | 대상                                                                                                                                   |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`             | `prettier --check .`                           | 저장소 전체 (`.prettierignore` 제외)                                                                                                   |
| `pnpm lint`                     | `nx run-many -t lint,vet,fmt` 뒤 루트 `eslint` | web · mobile · web-e2e · libs는 eslint, api는 `go vet` + gofmt 검사, 루트 eslint는 `tools/scripts` · `.claude/hooks`                   |
| `pnpm typecheck`                | `nx run-many -t typecheck`                     | web · mobile · web-e2e · libs                                                                                                          |
| `pnpm test`                     | `nx run-many -t test`                          | api는 `go test`, web · mobile · libs · devhub는 Vitest. devhub는 캐시하지 않는다                                                       |
| `pnpm test:hooks`               | `node --test tools/scripts/*.test.mjs`         | `.claude/hooks/`의 포트 차단 · `tools/scripts`(harness launcher 등) — Nx 프로젝트가 아니라 별도 명령이다                               |
| `pnpm harness:check`            | `node tools/scripts/harness.mjs check`         | `.claude/rules/_generated/`가 고정한 shared-stack checkout의 berry-dev standards와 같은지. 쓰지 않는다. **`verify`에 포함되지 않는다** |
| `pnpm build`                    | `nx run-many -t build --exclude=mobile`        | web · api · devhub. devhub는 git 스냅샷을 페이지에 넣으므로 캐시하지 않는다                                                            |
| `pnpm e2e`                      | `nx run-many -t e2e`                           | web-e2e · devhub-e2e — **`verify`에 포함되지 않는다**                                                                                  |
| `pnpm devhub:check`             | `nx run devhub:devhub-check`                   | DevHub catalog이 지금 저장소와 맞는지만 본다. 같은 검사가 `pnpm test`에도 들어 있다                                                    |
| `pnpm eval:check`               | `nx run api:eval-check`                        | 평가 harness offline 테스트 + sample dataset 검증. 모델 호출 없음. **`verify`에 포함되지 않는다**                                      |
| `pnpm eval`                     | `nx run api:eval`                              | 평가 CLI. `pnpm eval list`처럼 인자를 그대로 넘긴다. `run` · `retry`만 `--allow-api`가 있을 때 실제 provider 호출                      |
| `pnpm swagger:check`            | `nx run api:swagger-check`                     | `docs/swagger`가 swag 주석과 일치하는지. 파일을 고쳐 쓰지 않는다                                                                       |
| `pnpm swagger` · `pnpm migrate` | `nx run api:swagger` · `nx run api:migrate`    | Swagger 재생성 · DB 마이그레이션 적용(Postgres 필요)                                                                                   |

`test:hooks`는 Node 24 내장 러너를 쓴다. 의존성이 없다.

`nx run-many`는 해당 target이 없는 프로젝트를 조용히 건너뛴다. 없는 target 때문에 실패하지 않는다.

### 공유 설정 패키지

lint · format · tsconfig는 직접 정의하지 않고 `@berrypjh/*` 공유 패키지를 상속한다. GitHub Packages에 있어 `.npmrc`와 `GITHUB_TOKEN`이 필요하다.

| 패키지                        | 연결 지점                      | 주는 것                                                                 |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `@berrypjh/eslint-config`     | `eslint.config.mjs`            | `base`(import 정렬 · unused-imports · no-explicit-any) · `nx` · `react` |
| `@berrypjh/prettier-config`   | `package.json`의 `prettier` 키 | `printWidth: 100` · `singleQuote` · md/yaml override                    |
| `@berrypjh/tsconfig`          | `tsconfig.base.json`           | `next.json`(앱)                                                         |
| `@berrypjh/commitlint-config` | `commitlint.config.js`         | type 11종 · `!:` 금지                                                   |

**`.prettierrc`는 없다.** 저자 규약대로 `package.json`의 `"prettier"` 키로 지정한다.

#### 이 저장소에서 다르게 한 것

`jsx-a11y`는 **web에만** 붙인다. `apps/web/eslint.config.mjs`가 `@berrypjh/eslint-config/react`를 쓰고 `apps/mobile`은 쓰지 않는다. React Native에는 DOM이 없어 `no-autofocus` 같은 규칙이 오탐이 된다.

`flat/react-typescript`는 플러그인을 등록하지 않으므로 `react-hooks` · `jsx-a11y`는 `/react`가 채운다.

`lint-staged`의 `*.go` → `gofmt -w`도 이 저장소 고유다. `api`에 `lint` 타겟이 없어서다.

### `format`이 `nx format`이 아닌 이유

`nx format:check`는 **base 대비 변경된 파일만** 검사한다. 한 번 포맷이 어긋난 채 들어온 파일은 이후 손대지 않는 한 영원히 검사되지 않는다. `prettier --check .`는 저장소 전체를 본다.

### 커밋 시점 게이트

`pnpm verify`는 사람이 기억해서 돌려야 하지만, 커밋에는 자동으로 걸리는 것이 있다.

| 훅                  | 하는 일                                                      |
| ------------------- | ------------------------------------------------------------ |
| `.husky/pre-commit` | `lint-staged` — staged 파일에 eslint · prettier · gofmt 적용 |
| `.husky/commit-msg` | `commitlint` — 커밋 메시지 형식 강제                         |

`git commit --no-verify`로 건너뛸 수 있다. 처음 clone하면 `pnpm install`이 `prepare` 스크립트로 husky를 설치한다.

### `verify`가 e2e를 빼는 이유

`pnpm e2e`는 브라우저 바이너리와 dev 서버를 요구해 매번 돌리기엔 무겁다. CI에서는 별도 잡으로 돌린다.

브라우저를 아직 받지 않았다면 한 번 받아야 한다.

```bash
pnpm exec playwright install chromium firefox webkit
```

CI에서는 파일 단위로 병렬화된 `e2e-ci` target을 쓸 수 있다. `@nx/playwright/plugin`이 spec 파일마다 `e2e-ci--src/<file>` target을 자동 생성한다.

### `build`가 mobile을 빼는 이유

`mobile`의 `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**다(Expo 계정 필요, 원격 실행).

모바일 번들을 로컬에서 확인하려면:

```bash
pnpm exec nx export mobile
```

## 테스트 현황 — 솔직하게

| 프로젝트   | 종류             | 명령        | 상태                                                                                                       |
| ---------- | ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| api        | 단위 · DB        | `pnpm test` | Go test. DB 테스트는 `TEST_DATABASE_URL`이 없으면 **skip**. 평가 harness 테스트는 provider를 부르지 않는다 |
| web        | 단위             | `pnpm test` | Vitest                                                                                                     |
| mobile     | 단위             | `pnpm test` | Vitest                                                                                                     |
| libs       | 단위             | `pnpm test` | Vitest                                                                                                     |
| web-e2e    | E2E              | `pnpm e2e`  | Playwright × 3 브라우저 + 오류 주입                                                                        |
| devhub     | 단위 · freshness | `pnpm test` | Vitest. catalog ↔ 저장소 검사는 `pnpm devhub:check`로 따로 돈다                                            |
| devhub-e2e | E2E              | `pnpm e2e`  | Playwright × Chromium                                                                                      |

`nx test api` 통과가 DB 검증을 뜻하지 않는다. DB까지 보려면 Postgres를 띄우고 `TEST_DATABASE_URL`을 주고 돌린다(아래 Go 절).

덮인 것은 web `src/lib/**` · mobile `src/lib/**` · `src/auth/**` · `src/onboarding/**`(api 호출 · 인증 · 온보딩 진행 · 사진 처리 순수 로직), `libs/*`, Go 인증 · 사진 처리 전체다. 사진 처리의 Claude 호출은 가짜 HTTP 응답으로만 검사하고 실제 API는 부르지 않는다. 화면 컴포넌트 · 디자인 토큰 · App Shell에는 단위 테스트가 없고, web의 셸 · 로그인 화면 동작은 E2E가 대신 잡는다. **mobile 화면은 런타임 검증 수단이 없어 코드 판독과 실기기 수동 인수까지가 한계다.**

### 단위 테스트 실행 방식

`nx.json`의 `@nx/vitest` 플러그인이 `testMode: "run"`이라 `nx test`는 **한 번 돌고 끝난다**(`vitest run`). 기본값인 `"watch"`로 두면 터미널에서 `pnpm verify`가 watch 모드에 걸려 멈춘다.

개발 중 watch가 필요하면 앱 디렉터리에서 직접 띄운다.

```bash
cd apps/web && pnpm exec vitest
```

`vitest.config.ts`는 `environment: 'node'`다. `lib/api.ts`가 순수 TS라 DOM이 필요 없다. **React 컴포넌트를 단위 테스트하게 되면** `jsdom`, `@testing-library/react`, `@vitejs/plugin-react`를 그때 함께 추가한다. 지금 넣으면 쓰지 않는 의존성이 된다.

spec 파일도 `pnpm typecheck`가 검사한다. tsconfig에 `*.spec.ts` exclude를 다시 넣지 않는다 — vitest는 타입을 검사하지 않는다.

### E2E 범위

`apps/web-e2e`는 홈, **반응형 셸 계약**, 로그인 흐름을 고정한다. 홈은 보호 page라 셸 계약도 로그인한 상태로 본다.

셸 계약은 유틸리티 클래스 하나만 잘못 고쳐도 깨진다.

- `<html lang="ko">`, `<h1>` 텍스트, 상태 문구
- 1280px · 768px(경계)에서 사이드바(`complementary` 랜드마크) 노출
- 767px에서 사이드바 사라지고 헤더(`banner`)가 제품명을 대신 표시
- 320px에서 가로 스크롤 없음 — 한국어 텍스트가 길어 실제로 터질 수 있는 지점
- 첫 Tab이 "본문으로 건너뛰기"(`SkipLink`)에 멈추고 드러나며, Enter 뒤 포커스가 `main`으로 옮겨감. WebKit은 링크 이동에 `Alt+Tab`을 쓴다

역할 기반 선택자를 쓰므로 시맨틱 랜드마크까지 함께 검증된다. 자세한 계약은 [design/foundation.md](../design/foundation.md).

로그인 흐름은 로그인 · 온보딩 화면의 반응형 · 접근성, 보호 경로 redirect와 복귀, 로그아웃, WebView 핸드오프를 본다. 온보딩은 첫 사진 → 첫 결과(일반 사진과 같은 실제 처리 결과, 처리 결과 계약 전 작업은 서버가 준 값만) → 완료 → 홈까지와 결과 화면의 320px · 포커스 · 키보드 완료를 본다. 사진 처리(`photo-flow` · `processing-result` · `reprocess` · `home-flow`)는 홈에서 사진 추가 → 파일 선택 · 끌어 놓기 → 확인 → 처리 → text · receipt 결과, unsupported · ambiguous, 영수증 필드 확정, 다시 처리와 기본값 저장의 분리(체크하지 않으면 저장하지 않음 · 저장 실패만 다시 시도 · 저장한 기본값이 다음 사진에 적용), 업로드 · 연결 실패 뒤 다시 시도, 세션 만료, 빈 홈이 처리 뒤 최근 처리 홈으로 바뀌는 것, 기록 목록 · 결과 하나 · 다른 사용자 작업 차단을 본다. 가짜 API는 처리를 Go처럼 흉내 낸다 — 사용자별 업로드 결과 순서, 유형만 정한 업로드는 저장된 처리 방식(재처리면 요청한 처리 방식)으로 처리, 사진 digest 비교는 흉내 내지 않는다. 처리 결과는 가짜 API가 사용자별로 정해 병렬 실행끼리 섞이지 않는다. 사진 종류별 기본 처리(`/settings/processing`)는 서버 기본값 표시, 유형별 저장과 새로고침 뒤 유지, 다른 유형 · 다른 사용자에 영향 없음, 저장 실패를 성공으로 보이지 않음(사용자별 실패 주입), 키보드 저장, 320px, 앱 모드 · 핸드오프 진입을 본다. 가짜 API는 처리 방식과 핸드오프 `next` allowlist를 Go와 같은 규칙으로 흉내 낸다. 홈은 온보딩 뒤 처리한 사진이 없을 때의 빈 홈, 있을 때의 최근 처리 홈, 다른 사용자의 기록이 보이지 않음, 저장한 처리 방식 표시, 기록 · 처리 방식을 읽지 못했을 때 비었다고 하거나 기본값을 보이지 않음, 320px의 긴 값, 키보드로 사진 추가 · 설정 변경 링크에 닿음, 세션 만료, 온보딩 첫 사진이 최근 처리에 들어가지 않음을 본다. 사용자별 일반 작업 · 읽기 실패는 `__fixture/sessions`가 그 사용자에게만 넣는다. 가짜 API도 작업의 출처를 Go처럼 세션의 온보딩 단계로 정한다. 인증 spec은 가짜 인증 API(`src/support/fake-api.mts`)로 돌고 실제 Google에는 접속하지 않는다. 운영 바이너리에는 가짜 provider로 바꾸는 스위치가 없다. 실행 방법과 함정은 `.claude/rules/e2e.md`.

**mobile에는 E2E가 없다.** Detox는 시뮬레이터/에뮬레이터가 필요한데 이 환경에 없다(full Xcode·Android SDK 미설치). 실행 환경이 갖춰지면 그때 판단한다.

## Go

```bash
pnpm exec nx fmt api     # gofmt 위반 시 실패
pnpm exec nx vet api     # go vet ./...
pnpm exec nx test api    # go test ./...
pnpm exec nx build api   # dist/apps/api/api
pnpm swagger:check   # docs/swagger가 주석과 일치하는지 (파일을 고쳐 쓰지 않는다)
```

앞의 셋은 `pnpm lint`와 `pnpm test`에 이미 포함되어 있다. `swagger-check`는 아직 어느 묶음 명령에도 없다(CI가 생기면 넣는다). 대신 `go test`의 `TestEveryRouteIsDocumentedInSwagger`가 등록된 route와 생성 문서의 operation을 비교해, 주석 없는 endpoint를 `pnpm test`에서 잡는다.

HTTP 테스트는 `httptest`로 실제 Gin router를 부르고, `http.Server` 동작(본문 상한 뒤 연결 종료 · graceful shutdown)은 `net.Pipe` listener로 포트 없이 확인한다.

`fmt` target은 파일을 고쳐 쓰지 않고 **검사만 한다.** CI가 소스를 바꾸면 안 되기 때문이다. 위반이 나오면 로컬에서 `gofmt -w .`로 고친다.

## 평가 harness

```bash
pnpm eval:check      # offline Go 테스트 + sample dataset 검증 · readiness. 모델 호출 없음, 캐시 없음
pnpm eval list    # dataset · variant 목록. 모델 호출 없음
```

`api:eval`의 `run` · `retry`만 실제 provider를 부르고, `--allow-api`와 `--max-api-calls N`이 둘 다 있어야 한다. `pnpm test` · `pnpm verify`는 `test` target만 돌리므로 유료 실행이 섞이지 않는다. 산출물은 `tools/evals/results/`(git ignore)에 쓴다. 자세한 것은 [agent-evaluation.md](../architecture/agent-evaluation.md).

## API 연결 확인

```bash
pnpm dev:api    # 다른 터미널
pnpm health
```

`pnpm health`는 web 앱의 `fetchHealth`를 그대로 호출한다. 제품 화면이 아니라 개발자용 명령이다.

## Dependency 추가 원칙

설치하기 **전에** 아래를 순서대로 확인하고 그 결과를 설명한다.

1. 기존 dependency로 되는가
2. 표준 라이브러리로 되는가 (Go stdlib, Node 내장, Web API)
3. 현재 platform SDK로 되는가 (Next.js / Expo)
4. 그래도 필요하면 왜 필요한지

**"편해서"는 사유가 아니다.**

적용 예:

- axios를 넣지 않음 — Node와 RN 모두 `fetch`를 기본 제공한다
- Gin · swaggo는 DTO · binding · route group · Swagger가 실제로 필요해진 뒤 넣었다. HTTP 경계에만 쓰고 request ID · 로그 · recovery는 표준 라이브러리다
- `react-native-safe-area-context`는 넣음 — RN `SafeAreaView`가 deprecated이고 Android edge-to-edge를 처리하지 못한다

### mobile에 패키지를 추가할 때

버전을 임의로 고르지 않는다. Expo SDK가 지정한 값을 쓴다.

```bash
node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"
```

그리고 **루트 `package.json`에 실제 버전을, `apps/mobile/package.json`에는 `"*"`를** 적는다. 루트에 빠뜨리면 `"*"`가 레지스트리 최신 버전으로 해석되어 SDK와 어긋난 패키지가 들어온다. 자세한 것은 [local-development.md](../development/local-development.md)의 Expo SDK 버전 고정.

### Nx 플러그인

개별 `pnpm add` 금지. `nx add` 또는 `nx migrate`만 쓴다. `nx`와 모든 `@nx/*`는 정확히 같은 버전이어야 한다.

## Security 기본 원칙

### Secret

- 실제 secret을 커밋하지 않는다
- `.env`, `.env.local`, `.env.*.local`은 git에서 제외된다. `.env.example`은 추적된다
- **`.env.example`에는 예시 값만 둔다.** 지금 채워진 값은 localhost 개발 주소와 개발 기본값뿐이고, 인증 키 · OAuth 클라이언트 값은 비어 있다

### 클라이언트에 노출되는 값

- `NEXT_PUBLIC_*`는 브라우저 번들에, `EXPO_PUBLIC_*`는 앱 번들에 **인라인된다.** 접두사가 붙은 값은 공개된 값이다
- 이 접두사 뒤에 secret을 두지 않는다. 모바일 앱에는 서버가 없으므로 앱이 아는 값은 전부 공개값이다
- web의 API 주소는 `API_BASE_URL`이다. 접두사가 없다 — 서버(Server Component · Server Action · Route Handler)에서만 쓰이므로 브라우저에 갈 이유가 없다

### Backend

- **오류 응답에 내부 정보를 담지 않는다.** 스택, 파일 경로, SQL, 내부 식별자 모두 밖으로 내보내지 않는다. 오류 응답은 `writeError`가 만드는 `{"error": "<code>"}` 하나뿐이다
- 서버 설정은 환경변수로 받는다. 하드코딩하지 않는다
- CORS는 **필요해질 때** 넣는다. 지금은 cross-origin 요청 주체가 없어 CORS 코드가 아예 없다
- CORS를 넣게 되면 허용 origin을 설정으로 관리하고 dev/production을 분리한다. **production에서 `*`를 쓰지 않는다**

자세한 판단 근거는 [data-access.md](../architecture/data-access.md).

### 로깅

- 토큰, 비밀번호, 개인정보, **이미지 내용**을 로그에 남기지 않는다
- 이 제품의 입력은 스크린샷이다. 이름·전화번호·계좌번호가 흔히 들어 있다. 이미지나 그 분석 결과 원문을 로그로 뱉지 않는다
- 현재 Go 로그(`log/slog`)는 수명주기 이벤트, 요청 한 줄(request_id · method · route template · status · latency), 인증 저장소 오류, panic 타입뿐이다. 원문 URL · query · 헤더 · 본문은 남기지 않는다

### 앱 코드의 `console`

앱 소스에 `console.*`를 남기지 않는다. 현재 남아 있는 것은 CLI 도구뿐이며, 거기서는 출력이 곧 인터페이스다.

- `tools/scripts/check-api-health.mjs` — 검사 결과 출력

### 자동 실행되는 코드

`.claude/hooks/` · `.husky/` · `commitlint.config.js` · `package.json`의 `prepare`/`lint-staged`는 **아무도 실행을 지시하지 않아도 돈다.** 이 파일들을 건드리는 변경은 일반 코드와 다르게 리뷰한다. 무엇이 언제 도는지와 리뷰 절차는 [.claude/README.md의 신뢰 표면](../../.claude/README.md#신뢰-표면).

lint · format · tsconfig · commitlint 설정은 **npm 공식 레지스트리가 아니라** GitHub Packages(`@berrypjh/*`)에서 온다.

## TypeScript

- `any`를 남용하지 않는다. 외부 응답은 좁은 타입 가드로 확인한다 (`apps/*/src/lib/api.ts` 참고)
- unused import·dead code를 남기지 않는다. `tsconfig.base.json`의 `noUnusedLocals`가 잡는다
- 생성된 tsconfig를 한 번에 "초엄격"으로 바꾸지 않는다. 새로 쓰는 코드에서 타입을 분명히 하는 쪽으로 간다

## 접근성

화면을 추가할 때마다 확인한다.

**Web** — `html lang="ko"` / `header`·`main`·`aside` 같은 시맨틱 landmark / 전역 `:focus-visible` 포커스 링 / 클릭 가능한 것은 `<button>` 또는 `<a>`

**Mobile** — `accessibilityRole` / 최소 44px 터치 타깃 / Safe Area

**공통** — 긴 한국어 문장에서 버튼·카드 제목이 깨지지 않는지. 한국어는 영어보다 길고 줄바꿈 규칙이 다르다.

토큰과 원칙은 [design/foundation.md](../design/foundation.md).
