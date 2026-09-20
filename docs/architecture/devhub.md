# DevHub

DevHub(저장소 구조 · 시나리오 탐색 web app)의 조사와 설계 결정을 담은 문서다.

- **Part I (1–15절) Discovery** — DevHub를 만들기 전에 **로컬 저장소의 실제 상태**를 조사한 기록. 다음 단계는 저장소를 다시 추측하지 않고 여기서 출발한다
- **Part II (16–27절) Design** — Part I을 근거로 정한 목적 · 범위 · 도메인 모델 · 상태 의미 · IA · 링크 정책 · 데이터 소유 · 접근성 · 의존성 · 단계 경계. DevHub UI는 아직 구현하지 않았다

Part I 기준:

- 조사일 2026-09-18, 기준 커밋 `4940176917cffbac66fa06328908dad18c12c18f`
- **스냅샷이다.** 이후 커밋이 쌓이면 이 문서의 숫자 · 경로가 낡는다. 다시 쓸 때는 [다시 확인하는 명령](#다시-확인하는-명령)을 돌린다
- docs와 source가 충돌하면 둘 다 적고, 구현 상태는 **source · 실행 결과**로 판정한다
- 파일 · symbol을 찾지 못한 것은 `Not found`로 적었다. 추정으로 채운 칸은 없다

# Part I — Discovery

## 1. Repository Snapshot

| 항목               | 값                                                                                                         | 근거                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 저장소 형태        | Nx integrated monorepo, pnpm workspace                                                                     | `nx.json`, `pnpm-workspace.yaml`                          |
| 추적 파일          | 228개                                                                                                      | `git ls-files \| wc -l`                                   |
| Nx 프로젝트        | 6개 — `web` · `mobile` · `api` · `web-e2e` · `auth-contracts` · `webview-bridge`                           | `pnpm exec nx show projects`                              |
| 제품 기능          | **인증 · 셸 · WebView 핸드오프까지.** Capture → Act 핵심 루프 코드는 없다                                  | 6절, `target-architecture.md` "무엇이 있고 무엇이 없는가" |
| CI                 | **없음.** `.github/` · `.gitlab-ci.yml` · `.circleci/` 모두 없다                                           | `ls`                                                      |
| Storybook          | **없음.** `.storybook/` · `*.stories.*` · `@storybook/*` 없음                                              | `git ls-files`, `pnpm-lock.yaml`                          |
| graph 라이브러리   | **없음.** `@xyflow/*` · `reactflow` · `d3*` · `dagre` · `elkjs` · `cytoscape` · `mermaid` 모두 lock에 없다 | `pnpm-lock.yaml`                                          |
| `node_modules`     | 설치되어 있음 (`@berrypjh/react-ui` 1.1.2 · `@berrypjh/react-native-ui` 1.1.2)                             | `node_modules/@berrypjh/*/package.json`                   |
| 단위 테스트 (HEAD) | **web 1개 실패**, 나머지 통과 — 9절                                                                        | `nx run-many -t test`                                     |

## 2. Local branch / HEAD / remote

| 항목               | 값                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| branch             | `main` (`## main...origin/main`, ahead/behind 없음)                                                                                              |
| HEAD               | `4940176917cffbac66fa06328908dad18c12c18f`                                                                                                       |
| `origin/main`      | `4940176917cffbac66fa06328908dad18c12c18f` — HEAD와 같다                                                                                         |
| remote             | `origin` → `https://github.com/berrypjh/snapdone.git` (fetch · push)                                                                             |
| 추적 파일 변경     | 없음 (`git status --short` 비어 있음)                                                                                                            |
| 최근 커밋 (위부터) | `4940176` docs · `d2ef673` api Gin/Swagger · `d920685` web-e2e 가짜 인증 API · `16cdeb2` web 온보딩 이동 테스트 · `d32f3d1` mobile 목적지 테스트 |

### 추적되지 않는 로컬 상태 (gitignore 대상)

git에는 보이지 않지만 다음 단계 판단에 영향을 주는 것만 적는다. 내용은 읽지 않았다.

| 경로                                                                   | 상태                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/scenario-atlas/`                                                 | (2026-09-19 기준 없음) **이전 시도의 잔여물.** 빌드 산출물(`.next/` · `out/` · `dist/` · `next-env.d.ts`)과 빈 디렉터리(`src/app/{scenarios,code,architecture}` 등)뿐, 소스 · `package.json` · `project.json`이 없다. Nx 프로젝트로 잡히지 않는다 |
| `docs/scenarios/`                                                      | (2026-09-19 기준 없음) 빈 디렉터리                                                                                                                                                                                                                |
| `docs/temp/`                                                           | 없음. 화면 기획서 원문도 로컬에 없다 (15절)                                                                                                                                                                                                       |
| `apps/api/.env` · `apps/api/.env.dev.local`                            | 존재. Nx가 `apps/api/.env`를 태스크 환경에 넣어 `nx test api`의 `internal/config` 테스트를 깨뜨릴 수 있다 (`local-development.md`)                                                                                                                |
| `apps/web/.env` · `apps/mobile/.env`                                   | 존재. web은 문서가 안내하는 `.env.local`이 아니라 `.env`다                                                                                                                                                                                        |
| `apps/*/dist` · `libs/*/dist` · `apps/web/.next` · `apps/mobile/.expo` | 빌드 · 타입 산출물                                                                                                                                                                                                                                |

## 3. Nx Project Inventory

`pnpm exec nx show project <name> --json`의 실제 값이다. `--json`은 `nx show project --help`에서 지원을 확인했다. Nx 23.1.1.

| project          | root                  | projectType | tags                      | 의존 (graph)                                |
| ---------------- | --------------------- | ----------- | ------------------------- | ------------------------------------------- |
| `web`            | `apps/web`            | application | `npm:private`, `type:app` | `auth-contracts`, `webview-bridge` (static) |
| `mobile`         | `apps/mobile`         | application | `npm:private`, `type:app` | `auth-contracts`, `webview-bridge` (static) |
| `api`            | `apps/api`            | application | `type:app`                | 없음 (Go)                                   |
| `web-e2e`        | `apps/web-e2e`        | (미지정)    | `npm:private`, `type:e2e` | `web` (implicit)                            |
| `auth-contracts` | `libs/auth-contracts` | library     | `npm:private`, `type:lib` | 없음                                        |
| `webview-bridge` | `libs/webview-bridge` | library     | `npm:private`, `type:lib` | 없음                                        |

### 실제 target

| project          | target                                                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`            | `build`(next build) · `dev` (c) · `start` (c) · `serve-static` (c) · `build-deps` · `watch-deps` (c) · `lint` · `test`(vitest run) · `test-ci` + 파일별 `test-ci--*` 9개 · `typecheck`(tsc --noEmit)                                                                                                       |
| `mobile`         | `typecheck` · `lint` · `start`(@nx/expo:start, continuous 덮어씀) · `serve` (c) · `run-ios` (c) · `run-android` (c) · `export` · `install` · `prebuild` · `build`(**EAS 클라우드**) · `submit`(eas submit) · `build-deps` · `watch-deps` (c) · `test` · `test-ci` + 파일별 12개 · `eas-build-post-install` |
| `api`            | `dev` (c)(go run ./cmd/server) · `migrate`(go run ./cmd/migrate) · `build`(→ `dist/apps/api/api`) · `test`(go test) · `vet` · `swagger` · `swagger-check` · `fmt`(검사만). **`lint` · `typecheck` 없음**                                                                                                   |
| `web-e2e`        | `typecheck` · `lint` · `e2e`(playwright test) · `e2e-ci` + 파일별 8개 · `e2e-ci--merge-reports`                                                                                                                                                                                                            |
| `auth-contracts` | `typecheck` · `lint` · `test` · `test-ci` + 1개                                                                                                                                                                                                                                                            |
| `webview-bridge` | `typecheck` · `lint` · `test` · `test-ci` + 1개                                                                                                                                                                                                                                                            |

`(c)` = continuous. target 출처: `web` · `mobile` · libs는 `nx.json` 플러그인(`@nx/next` · `@nx/expo` · `@nx/js/typescript` · `@nx/eslint` · `@nx/vitest` · `@nx/playwright`)이 추론하고 `package.json` `nx`가 일부를 덮는다. `api`는 `apps/api/project.json`의 `nx:run-commands`만 쓴다.

모듈 경계는 루트 `eslint.config.mjs`의 `@nx/enforce-module-boundaries`가 강제한다 — `type:app`·`type:e2e` → `type:lib`만, `type:lib` → `type:lib`만 + 플랫폼 패키지(react · next · expo · react-native · `@react-navigation/*` · 공용 UI kit) import 금지.

## 4. Repository Map

```
apps/
  web/          Next.js 16 App Router (src/app, src/components, src/lib)
    src/app/(product)/        AppShell 아래 — / (공개 부트스트랩 홈), /history (보호)
    src/app/(auth)/           셸 없는 main — /login, /onboarding, /auth/callback, /auth/handoff{,/start,/ready}
    src/lib/auth/             Server Action · Route Handler · cookie · redirect allowlist · 세션
    src/lib/in-app.ts         isInAppRequest() — User-Agent 판별 한 곳
  mobile/       Expo SDK 56 + React Navigation native stack
    src/app/App.tsx           인증 상태 → 화면 선택 (destinationFor)
    src/auth/                 controller · model(reducer) · api · device(SecureStore · crypto · 인증 브라우저) · webHandoff
    src/screens/              AuthScreen · OnboardingIntroScreen · HomeScreen · WebContentScreen
    src/lib/web.ts            WEB_VIEW_PATHS allowlist · webViewNavigation
  api/          Go module snapdone/api
    cmd/server · cmd/migrate
    internal/httpserver       Gin router · middleware · DTO · 핸들러(swag 주석)
    internal/auth             사용자 · 세션 · grant · OAuth transaction · 핸드오프 · AES-GCM
    internal/google           Google OIDC
    internal/database         pgx pool · migrations 0001_auth.sql, 0002_oauth_client_state.sql
    docs/swagger              swag 생성물 (손으로 고치지 않음)
  web-e2e/      Playwright, src/support/fake-api.mts (가짜 인증 API :4010)
libs/
  auth-contracts/  AUTH_PROVIDERS · AUTH_ERROR_CODES · Session · parseSession · toAuthErrorCode
  webview-bridge/  SnapdoneApp/<BRIDGE_VERSION=1> · WebToAppMessage(ready · auth-required · handoff-ready)
docs/           product · architecture · design · development · engineering (각 1~2개 파일)
tools/scripts/  check-api-health.mjs (pnpm health) · eas-build-post-install.mjs · guard-bash.test.mjs
.claude/        rules 5개 · skills 2개 · hooks/guard-bash.mjs · settings.json
.husky/         pre-commit(lint-staged) · commit-msg(commitlint)
```

## 5. Runtime Boundaries

```
브라우저 ──HTML/Server Action──▶ web (Next 서버) ──fetch(API_BASE_URL)──▶ api (Go, Gin) ──pgx──▶ Postgres
                                                                              └──TLS──▶ Google OIDC
mobile (RN) ──fetch(EXPO_PUBLIC_API_BASE_URL)──────────────────────────▶ api
mobile WebView ──URL(EXPO_PUBLIC_WEB_BASE_URL) + UA "SnapdoneApp/1"──▶ web
web ──window.ReactNativeWebView.postMessage(WebToAppMessage)──▶ mobile
```

| 경계             | 사실                                                                                                                                                                                                        | 근거                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 브라우저 → Go    | **직접 호출 없음.** web 서버만 Go를 부른다. CORS 코드 없음                                                                                                                                                  | `apps/web/src/lib/api.ts`, `data-access.md`                          |
| web → Go         | base URL을 아는 곳은 `getApiBaseUrl()` 하나. 인증 호출은 `src/lib/auth/api.ts`                                                                                                                              | `apps/web/src/lib/api.ts`, `apps/web/src/lib/auth/api.ts`            |
| mobile → Go      | `getApiBaseUrl()`(`src/lib/api.ts`) + `authApi`(`src/auth/api.ts`)                                                                                                                                          | 같은 경로                                                            |
| Go endpoint      | `GET /health`, `/v1/auth/{capabilities,session,logout}`, `/v1/auth/oauth/{start,cancel,callback}`, `/v1/auth/exchange`, `/v1/auth/handoff/{start,exchange}`, dev 전용 `/swagger/*any`                       | `apps/api/internal/httpserver/router.go` `NewRouter`                 |
| 인증 비활성      | `AUTH_*` 미설정 시 `/v1/auth/*` 503 (`requireConfigured`)                                                                                                                                                   | `router.go`                                                          |
| web ↔ mobile     | 코드 참조 없음. URL + `libs/webview-bridge` 계약만                                                                                                                                                          | nx graph (web · mobile 사이 edge 없음)                               |
| web → app 메시지 | `ready{title}` · `auth-required` · `handoff-ready{challenge,next}` 3종                                                                                                                                      | `libs/webview-bridge/src/lib/bridge.ts` `WebToAppMessage`            |
| app → web 메시지 | **Not found**                                                                                                                                                                                               | `bridge.ts`에 타입 없음                                              |
| WebView 안 이동  | web origin + `WEB_VIEW_PATHS`(`/` `/history` `/login` `/onboarding` `/auth/handoff*`)만 load, 외부 https는 `Linking.openURL`, 나머지 block                                                                  | `apps/mobile/src/lib/web.ts` `webViewNavigation`                     |
| 세션 저장        | web: HttpOnly cookie (`authCookies()`, prod `__Host-` 접두사). mobile: `expo-secure-store` `snapdone.session`                                                                                               | `apps/web/src/lib/auth/cookies.ts`, `apps/mobile/src/auth/device.ts` |
| TTL              | OAuth transaction 10분 · result grant 60초 · 핸드오프 코드 30초 · web 세션 idle 12시간/절대 7일 · mobile idle 7일/절대 30일                                                                                 | `apps/api/internal/auth/{oauth,handoff,session}.go`                  |
| DB 스키마        | `users` · `identities` · `profiles(onboarding_step intro/purpose/first-image/complete · onboarding_purposes)` · `auth_sessions` · `auth_transactions` · `one_time_grants`. 이미지 · 기록 · 행동 테이블 없음 | `apps/api/internal/database/migrations/*.sql`                        |

## 6. Current Consumer Scenario Inventory

분류 기준

- **Implemented** — 사용자 경로 전체가 source에 있고 실제로 호출된다
- **Partial** — 경로 일부만 있다 (화면은 있고 데이터 · 완료 단계가 없는 등)
- **Documented only** — docs가 동작이나 책임을 규정하지만 source에 코드가 없다
- **Planned** — docs가 "나중에 · 생기면"으로만 언급하고 동작을 규정하지 않는다
- **Not found** — docs와 source 어디에도 없다

`검증`은 분류와 별개다. mobile은 런타임 검증 수단(시뮬레이터 · Detox · Maestro)이 없어 단위 테스트가 한계다.

| 시나리오                 | 분류            | source 근거                                                                                                                                                                                                                                                                                                                        | 검증                                                                                                                                                          | docs 근거 · 비고                                                                                              |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| app entry                | Implemented     | mobile `index.js` → `src/app/App.tsx` `App`; web `src/app/layout.tsx` + `(product)/page.tsx`                                                                                                                                                                                                                                       | E2E `home.spec.ts`; mobile 없음                                                                                                                               | 두 홈 모두 "초기 설정 중입니다. 화면은 아직 준비되지 않았습니다." 부트스트랩 문구                             |
| session restore          | Implemented     | mobile `createAuthController().start/restore/retryRestore/revalidate`, `AuthRestoring`, `AuthRestoreFailed`, `AppState` active 시 재검증; web `getSession()`(요청마다 Go 확인)                                                                                                                                                     | mobile `controller.spec.ts` · `model.spec.ts`; E2E `auth.spec.ts` "treats a session cookie Go no longer accepts"                                              | `target-architecture.md` 네비게이션 절                                                                        |
| browser Google auth      | Implemented     | `startGoogleLogin`(Server Action) → Go `/v1/auth/oauth/start` → Google → Go callback → web `/auth/callback` `handleOAuthCallback` → cookie                                                                                                                                                                                         | web unit 9파일; E2E `login.spec.ts` · `auth.spec.ts` · `auth-faults.spec.ts`(가짜 API); Go `oauth_test.go`                                                    | 실계정 Google 인수는 남아 있다(`target-architecture.md`). 신규 사용자 진입 경로는 12절 #1에서 고쳤다          |
| mobile Google auth       | Implemented     | `createGoogleSignIn`(proof → `oauthStart` → `openAuthSessionAsync` → `finishGoogleSignIn` → `exchange`), cold start 복귀 `resumeFromLaunchUrl`                                                                                                                                                                                     | `google.spec.ts` · `callback.spec.ts` · `storage.spec.ts`; **런타임 검증 없음**                                                                               | `EXPO_PUBLIC_AUTH_REDIRECT_URI`가 비면 비활성 (`.env.example` 기본값이 빈 값)                                 |
| onboarding               | Partial         | web `/onboarding` · `/onboarding/purpose` · `/onboarding/first-image`, mobile `OnboardingFlow` — 둘 다 소개 → 목적 선택 → 첫 사진 → 사진 확인 → 처리. 진행은 `GET` · `PUT /v1/onboarding`(서버 `profiles`)에 있고 규칙은 `libs/onboarding`이 함께 준다. 온보딩을 끝내는 API는 **Not found** (진행 저장은 `complete`를 받지 않는다) | E2E `auth-accessibility.spec.ts`(레이아웃) · `onboarding.spec.ts`; Go `onboarding_test.go`; mobile `model.spec.ts`(`destinationFor`) · `onboarding/*.spec.ts` | `local-development.md`: 로컬에서는 `profiles.onboarding_step`을 직접 바꿔야 홈에 닿는다                       |
| WebView entry            | Implemented     | `HomeScreen` "기록 보기" → `navigate('WebContent', { path: '/history', title: '기록' })` → `WebContentScreen`; web `AppShell inApp`, `InAppReady`                                                                                                                                                                                  | E2E `in-app.spec.ts`(UA 흉내); mobile `web.spec.ts` · `webHandoff.spec.ts`                                                                                    | 진입점은 `/history` 하나뿐                                                                                    |
| WebView auth handoff     | Implemented     | web `handleHandoffStart` · `HandoffReadyPage` · `handleHandoff`; mobile `webHandoff.ts` · `controller.startHandoff`; Go `/v1/auth/handoff/{start,exchange}`                                                                                                                                                                        | E2E `auth.spec.ts` "WebView handoff" 3건 · `in-app.spec.ts`; Go `handoff_test.go`                                                                             | `data-access.md` "WebView 로그인 핸드오프"                                                                    |
| logout                   | Implemented     | web `logout` Server Action(Origin 검사 → revoke → cookie 삭제 → `/login`); mobile `controller.logout` + `LogoutButton`(서버 취소 실패 구분 Alert); Go `POST /v1/auth/logout`                                                                                                                                                       | E2E `auth.spec.ts` "logs out, revokes the session…"; mobile `controller.spec.ts`                                                                              | web in-app 모드에는 로그아웃 버튼이 없다(셸 숨김)                                                             |
| auth error/fallback      | Implemented     | web `auth-copy.ts` `authErrorMessage`, `/login?error=`; mobile `authCopy.ts`, `recoverable-error`, capability 실패 "다시 시도"; WebView `failure: 'handoff'`                                                                                                                                                                       | E2E `auth-faults.spec.ts` · `auth-accessibility.spec.ts`; mobile `authCopy.spec.ts`                                                                           | mobile 전용 오류 `storage_unavailable`은 lib 밖(`src/auth/model.ts`)                                          |
| API failure              | Partial         | 인증 호출만 처리 — `AuthApiError('network')`, `restore-failed`, WebView `onError`/`onHttpError` → "화면을 불러오지 못했습니다". 제품 API는 없다                                                                                                                                                                                    | 위 인증 테스트                                                                                                                                                | `data-access.md`의 adapter · mock 규칙은 "앞으로"다. 제품 화면에 health 상태를 보이지 않는다                  |
| history                  | Partial         | web `(product)/history/page.tsx` — `requireSession('/history')` 뒤 고정 빈 상태 "아직 기록이 없습니다." 데이터 · API · 테이블 없음                                                                                                                                                                                                 | E2E `in-app.spec.ts` · `auth.spec.ts`(보호 경로)                                                                                                              | AGENTS.md: 기록은 web 콘텐츠 화면                                                                             |
| screenshot/image capture | Partial         | mobile 온보딩 첫 사진만 — `expo-image-picker`의 시스템 카메라 · 사진 선택기로 한 장을 고른다(`onboarding/capture.ts`). 공유 시트 · 파일 선택 · 업로드는 Not found                                                                                                                                                                  | mobile `capture.spec.ts`; **런타임 검증 없음**                                                                                                                | `product-principles.md` Capture, `target-architecture.md`: "실제 이미지 업로드" 없음                          |
| image analysis           | Documented only | Not found                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                             | `target-architecture.md` "AI 분석" 없음, api 책임 "모델 호출과 결과 정규화"                                   |
| intent understanding     | Documented only | Not found                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                             | `product-principles.md` Understand                                                                            |
| action routing           | Documented only | Not found. 로그인 문구 "찍거나 올리면 AI가 알아서 처리합니다"는 카피일 뿐이다                                                                                                                                                                                                                                                      | —                                                                                                                                                             | `product-principles.md` Route, Why · Confirmation                                                             |
| native action            | Documented only | Not found (캘린더 · 장소 · 영수증 · 번역)                                                                                                                                                                                                                                                                                          | —                                                                                                                                                             | `target-architecture.md` "아직 구현하지 않은 것"                                                              |
| external service         | Documented only | 행동 쪽 외부 연동 Not found. 구현된 외부 연동은 인증용 Google OIDC(`internal/google`)뿐                                                                                                                                                                                                                                            | Go `google_test.go`(인증만)                                                                                                                                   | `target-architecture.md` api 책임 "외부 서비스 연동 (캘린더, 저장소 등)"                                      |
| result/completion        | Documented only | Not found. 온보딩 소개의 예시 카드("지출 기록 완료" 등)는 고정 문구다                                                                                                                                                                                                                                                              | —                                                                                                                                                             | `product-principles.md` "성공 화면의 정의", `.claude/rules/ko-ui.md`                                          |
| settings                 | Documented only | 설정 화면 Not found. 설정 비슷한 것은 web 헤더 `ThemeSwitch`(다크 모드) 하나                                                                                                                                                                                                                                                       | E2E `shared-ui-consumer.spec.ts`(테마)                                                                                                                        | AGENTS.md · `target-architecture.md`: "설정 일부"는 web 콘텐츠                                                |
| permission denied        | Documented only | Not found. 권한 요청 코드 · `app.json` 권한 설정 없음 (`expo-secure-store` `faceIDPermission: false`만)                                                                                                                                                                                                                            | —                                                                                                                                                             | `target-architecture.md` "권한 요청과 그 실패 처리", `.claude/rules/mobile.md`                                |
| no-action/empty state    | Partial         | 빈 상태: web `/history` 고정 문구만. 행동을 못 찾았을 때(no-action) 흐름은 Not found                                                                                                                                                                                                                                               | —                                                                                                                                                             | `product-principles.md` "모르겠으면 모른다고 하고 선택지를 준다", `ko-ui.md` 상태 절(공용 상태 컴포넌트 없음) |

## 7. Implemented vs Documented-only matrix

핵심 루프 단계 × 실행 위치. `—`는 그 위치의 책임이 아니라고 docs가 정한 칸이다.

| 단계 / 영역             | web                               | mobile                                 | api                               | libs                                |
| ----------------------- | --------------------------------- | -------------------------------------- | --------------------------------- | ----------------------------------- |
| Capture                 | Documented only (파일 · 붙여넣기) | Documented only (카메라 · 사진 · 공유) | Documented only (파이프라인 진입) | —                                   |
| Understand              | —                                 | —                                      | Documented only                   | —                                   |
| Route                   | —                                 | Documented only                        | Documented only                   | —                                   |
| Act                     | —                                 | Documented only                        | Documented only                   | —                                   |
| Learn (자동화)          | Documented only (자동화 목록)     | Documented only                        | Documented only                   | —                                   |
| 결과 상세 · 기록        | Partial (`/history` 빈 상태)      | Implemented (WebView 호스트)           | Not found (기록 endpoint)         | —                                   |
| 인증 · 세션             | Implemented                       | Implemented                            | Implemented                       | Implemented (`auth-contracts`)      |
| 온보딩                  | Partial                           | Partial                                | Partial (단계 읽기만)             | Implemented (`OnboardingStep` 타입) |
| 네이티브 셸 · WebView   | Implemented (in-app 모드)         | Implemented                            | Implemented (핸드오프)            | Implemented (`webview-bridge`)      |
| 디자인 토큰 · 셸 · 테마 | Implemented                       | Implemented                            | —                                 | —                                   |

### Planned (동작 규정 없이 "나중에"만 있는 것)

| 항목                                                     | docs 근거                                          |
| -------------------------------------------------------- | -------------------------------------------------- |
| Apple · 네이버 · 카카오 로그인                           | `target-architecture.md` "나중에 추가"             |
| 앱 → web 메시지, 촬영 · 공유 요청 메시지                 | `target-architecture.md` "아직 없는 것"            |
| 딥링크 (Universal Link / App Link)                       | `target-architecture.md` 런타임 계약 5             |
| bottom navigation                                        | `foundation.md` Mobile Shell "실제 화면이 생길 때" |
| 브라우저 직접 업로드용 CORS · `NEXT_PUBLIC_API_BASE_URL` | `data-access.md` "언제 이 결정을 다시 볼 것인가"   |
| OpenAPI → TS 타입 생성                                   | `data-access.md` Contract 전략                     |
| UI → adapter → API/mock 경계                             | `data-access.md` "앞으로"                          |
| production DB (Cloud SQL) · 배포                         | `target-architecture.md`                           |
| CI · `nx affected` base SHA                              | `target-architecture.md` "Nx가 담당하는 것"        |

## 8. Documentation Relationship Map

링크 방향(`A → B` = A가 B를 링크). `.md` 링크만 추출했다.

```
AGENTS.md ──▶ product-principles · target-architecture · data-access · foundation · local-development · quality-gates · .claude/README
README.md ──▶ local-development
target-architecture ──▶ data-access · foundation · local-development · quality-gates
data-access ──▶ target-architecture · local-development
foundation ──▶ target-architecture · product-principles
quality-gates ──▶ data-access · foundation · .claude/README
local-development ──▶ data-access
product-principles ──▶ (없음, 최상위 판단 기준)
.claude/rules/web.md ──▶ data-access · target-architecture · foundation
.claude/rules/mobile.md ──▶ data-access · target-architecture · foundation · local-development
.claude/rules/api.md ──▶ data-access
.claude/rules/libs.md ──▶ target-architecture
.claude/rules/ko-ui.md ──▶ foundation · product-principles
.claude/skills/repo-verify ──▶ local-development · quality-gates
.claude/skills/frontend-quality ──▶ foundation · product-principles (+ references/ 2개)
```

| 주제                            | 기준 문서                                  | 적용 규칙                           |
| ------------------------------- | ------------------------------------------ | ----------------------------------- |
| 제품 판단 · 성공 화면 · 신뢰 UX | `docs/product/product-principles.md`       | `.claude/rules/ko-ui.md`            |
| 구조 · 경계 · 구현 현황 · 버전  | `docs/architecture/target-architecture.md` | `.claude/rules/libs.md`             |
| API 호출 · CORS · 핸드오프      | `docs/architecture/data-access.md`         | `.claude/rules/{web,mobile,api}.md` |
| 토큰 · 셸 · primitive           | `docs/design/foundation.md`                | `.claude/rules/{web,mobile}.md`     |
| 실행 · 환경변수                 | `docs/development/local-development.md`    | —                                   |
| 검증 · 테스트 현황 · 보안       | `docs/engineering/quality-gates.md`        | `.claude/skills/repo-verify`        |
| harness 구성                    | `.claude/README.md`                        | —                                   |

## 9. Tests / Verification Inventory

조사 중 실제로 돌린 결과다 (2026-09-18, HEAD 기준).

| 프로젝트         | 러너                 | 파일                                  | 결과                                                                           | 명령                                                                        |
| ---------------- | -------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `web`            | Vitest 4.1.10 (node) | 9 (`src/lib/**/*.spec.ts`)            | 114개 통과 (12절 #1을 고친 뒤)                                                 | `NX_LOAD_DOT_ENV_FILES=false pnpm exec nx run-many -t test --skip-nx-cache` |
| `mobile`         | Vitest (node)        | 12 (`src/{auth,lib,components/auth}`) | 180 통과                                                                       | 같은 명령                                                                   |
| `auth-contracts` | Vitest               | 1                                     | 9 통과                                                                         | 같은 명령                                                                   |
| `webview-bridge` | Vitest               | 1                                     | 16 통과                                                                        | 같은 명령                                                                   |
| `api`            | `go test`            | `internal/*/*_test.go`                | 122개(하위 테스트 포함) — 76 통과 · 46 skip(`TEST_DATABASE_URL` 없음) · 실패 0 | `go test -count=1 -json ./...` (GOCACHE는 `$TMPDIR`)                        |
| `web-e2e`        | Playwright 1.62.1    | 8                                     | **실행하지 않음.** 목록만: 201개 = 65 × 3 브라우저 + 오류 주입 2 × 3           | `pnpm exec playwright test --list`                                          |
| hooks            | `node --test`        | `tools/scripts/guard-bash.test.mjs`   | 49 통과                                                                        | `pnpm test:hooks`                                                           |
| typecheck        | tsc                  | —                                     | 5개 프로젝트 통과                                                              | `pnpm exec nx run-many -t typecheck`                                        |

E2E spec → 시나리오

| spec                         | 덮는 것                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `home.spec.ts`               | 부트스트랩 홈 한국어 · 준비 중 문구                                                |
| `app-shell.spec.ts`          | 768px 사이드바 경계 · 320px 가로 스크롤 · SkipLink                                 |
| `shared-ui-consumer.spec.ts` | 첫 HTML 셸 · hydration 오류 없음 · 토큰 · 시스템 테마 · 다크 모드 저장 · landmark  |
| `login.spec.ts`              | 로그인 화면 · callback 오류 · 보호 경로 redirect · 외부 복귀 경로 차단             |
| `auth.spec.ts`               | 신규 · 기존 사용자 로그인, 만료 cookie, 로그아웃, WebView 핸드오프 3건             |
| `auth-accessibility.spec.ts` | 320/767/768/1280 × light/dark 레이아웃, 키보드 로그인, alert, in-app 동일 내용     |
| `auth-faults.spec.ts`        | 시작 실패 · 이중 클릭 (다른 브라우저 project 뒤 단독 실행)                         |
| `in-app.spec.ts`             | `SnapdoneApp/1` UA — 셸 숨김, `ready`, 핸드오프 challenge, 다른 브라우저 코드 거부 |

이 환경(AI 세션 샌드박스)에서 실행할 수 없는 것: `pnpm e2e` · `pnpm dev:*` · `nx build web`(포트 바인딩), DB 테스트(로컬 Postgres 차단), `nx build mobile`(EAS 클라우드). mobile 런타임 검증은 수단 자체가 없다.

## 10. Shared UI public surface findings

설치된 `@berrypjh/react-ui` **1.1.2**의 공개 CLI(`pnpm --dir apps/web exec berry-react-ui`)와 공개 export `@berrypjh/react-ui/agents`(`dist/AGENTS.md`)로만 조사했다. source · private 패키지는 보지 않았다.

- `summary` — 공개 symbol 217개, 컴포넌트 36개: `Avatar` `Badge` `Box` `BoxedInput` `Button` `ButtonBase` `Checkbox` `Chip` `Divider` `Fab` `FilledInput` `FormControl` `FormHelperText` `IconButton` `InputBase` `InputLabel` `List` `ListItem` `MenuItem` `PlainInput` `Popover` `PopoverPanel` `PopoverTrigger` `Radio` `RadioGroup` `SearchField` `SegmentControl` `Select` `SkipLink` `Stack` `Switch` `Table` `TableScroll` `TextField` `ThemeProvider` `VisuallyHidden`
- export 경로: `.` · `./styles.css` · `./tailwind` · `./catalog` · `./tokens` · `./agents`

DevHub 후보 컴포넌트의 prop (`api <Symbol>`, 스타일 · ref · aria 계열 생략)

| 컴포넌트            | prop                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SearchField`       | `value` `defaultValue` `onValueChange` `onChange` `clearable` `onClear` `clearAriaLabel` `suggestions: SearchFieldSuggestion[]` `onSuggestionSelect` `noSuggestionsText` `placeholder` `size=md\|sm` `variant=boxed\|filled\|plain` `fullWidth` `disabled` `error` |
| `Table`             | `children` `hiddenCaption`                                                                                                                                                                                                                                         |
| `TableScroll`       | `children` `label` (필수)                                                                                                                                                                                                                                          |
| `Popover`           | `children` (필수) `open` `defaultOpen` `onOpenChange` `semantics=dialog\|disclosure` — `PopoverTrigger` · `PopoverPanel(asDialog)`과 조합                                                                                                                          |
| `SegmentControl`    | `options` `value` `onChange` (모두 필수)                                                                                                                                                                                                                           |
| `List` / `ListItem` | `ordered` `marker` / `children`                                                                                                                                                                                                                                    |
| `Chip`              | `selected` `onClick` `leading` `size` `variant=filled\|outlined` `disabled`                                                                                                                                                                                        |
| `Badge`             | `content` `count` `max` `intent=error\|neutral\|primary\|secondary` `variant=count\|dot` `placement` `label`                                                                                                                                                       |
| `Select`            | `value` `onChange` `multiple` `renderValue` `placeholder` `size` `variant` …                                                                                                                                                                                       |

**없는 것** (`find` 결과 0건): Tabs · Dialog · Drawer · Tooltip. Tree · Graph · 다이어그램 컴포넌트도 없다. DevHub에 탭이 필요하면 `SegmentControl`, 겹침 UI는 `Popover`로 대신할지 판단해야 하고, 그래프 시각화는 공용 UI가 주지 않는다.

주의점 (`@berrypjh/react-ui/agents`)

- Server Component에서는 `cx` · `themes` · `Web` · `ThemeProvider` · `VisuallyHidden`만 직접 호출할 수 있다. 나머지는 `'use client'` 모듈이므로 서버 파일에서 JSX로 쓰되 **함수 prop(`onClick` 등)을 넘기지 않는다**
- `Stack` 기본 방향은 `column`, 반응형 prop 없음, `Flex` · `Grid` 없음
- `@berrypjh/react-native-ui` 1.1.2도 설치되어 있으나 DevHub(web)와 무관하다

## 11. Dependency inventory

루트 `package.json`이 버전을 가지고, 앱 `package.json`은 `workspace:*` · `"*"` · 정확한 버전으로 참조한다. 설치 버전은 `node_modules/*/package.json`에서 읽었다.

| 영역            | 패키지 (설치 버전)                                                                                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web runtime     | `next` 16.1.7 · `react`/`react-dom` 19.2.3 · `@berrypjh/react-ui` 1.1.2 · `tailwindcss` 4.3.3 · workspace libs 2개                                                                                                                                                                                                          |
| mobile runtime  | `expo` 56.0.19 · `react-native` 0.85.3 · `@react-navigation/native(-stack)` 7.x · `react-native-webview` 13.16.1 · `expo-{crypto,secure-store,web-browser,splash-screen,status-bar,system-ui}` · `react-native-safe-area-context` · `react-native-screens` · `react-native-svg` 15.15.4 · `@berrypjh/react-native-ui` 1.1.2 |
| api (Go 1.26.6) | 직접: `gin-gonic/gin` v1.12.0 · `jackc/pgx/v5` v5.11.0 · `swaggo/gin-swagger` v1.6.1 · `swaggo/files` v1.0.1, tool `swaggo/swag` v1.16.6                                                                                                                                                                                    |
| 도구            | `nx` · `@nx/*` 23.1.1 · `typescript` 6.0.3 · `eslint` 9.39.5 · `prettier` 3.9.6 · `vitest` 4.1.10 · `@playwright/test` 1.62.1 · `husky` · `lint-staged` · `@commitlint/cli`                                                                                                                                                 |
| 공유 설정       | `@berrypjh/{eslint,prettier,tsconfig,commitlint}-config` — GitHub Packages (`.npmrc`, `GITHUB_TOKEN`)                                                                                                                                                                                                                       |
| **없는 것**     | graph · 다이어그램(`@xyflow/react` · `reactflow` · `d3` · `dagre` · `elkjs` · `cytoscape` · `mermaid`), Storybook, `jsdom` · `@testing-library/*`, `msw`, 이미지 선택 · 카메라, HTTP 클라이언트(axios 등), 상태관리 · 데이터 페칭 라이브러리                                                                                |

`zod` 3.25.76은 lock에 간접 의존으로만 있다. 앱 코드가 import하지 않는다.

## 12. Known documentation/code discrepancies

| #   | docs · 테스트가 말하는 것                                                                                                                                            | source · 실행 결과                                                                                                                                                                                                                                                                                                                                                                                                                     | 판정                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | web 단위 테스트(16cdeb2)와 E2E `auth.spec.ts:24` "a new Google user lands on onboarding": 온보딩 전 사용자는 로그인 직후 `/onboarding`으로 간다                      | `apps/web/src/lib/auth/callback.ts` `completeLogin`은 온보딩 단계와 무관하게 `location: returnTo`를 돌려준다. `git log -S onboarding`에 그런 분기가 있던 이력도 없다. 단위 테스트는 **실제로 실패**한다(`/history` 수신). `/login`에서 시작하면 `returnTo`가 `/`이고 `/`(`(product)/page.tsx`)는 `requireSession`을 부르지 않으므로 신규 사용자가 공개 홈에 머문다 — 해당 E2E도 실패할 것으로 읽히나 **실행하지 못해 확인하지 않았다** | **해결** — `completeLogin`이 온보딩 전 사용자를 `/onboarding`으로 보낸다. 단위 테스트 통과, E2E는 실행하지 못했다 |
| 2   | `quality-gates.md` "여기 적힌 명령은 전부 … 통과하는 것들", web "Vitest 114개"                                                                                       | #1을 고친 뒤 114개 통과                                                                                                                                                                                                                                                                                                                                                                                                                | **해결**                                                                                                          |
| 3   | `target-architecture.md` Go module 절: "git remote가 없고 조직명도 정해지지 않았으므로 `github.com/...` 주소를 임의로 확정하지 않았다 … remote 확정 시점에 처리한다" | remote `https://github.com/berrypjh/snapdone.git`가 있다. module은 여전히 `snapdone/api`                                                                                                                                                                                                                                                                                                                                               | docs가 낡았다. module 경로 변경 여부는 결정 대상                                                                  |
| 4   | `target-architecture.md` 런타임 계약 4: "같은 도메인은 WebView 안에서"                                                                                               | 같은 origin이어도 `WEB_VIEW_PATHS` allowlist 밖이면 block (`apps/mobile/src/lib/web.ts`). `.claude/rules/mobile.md`는 allowlist로 맞게 적는다                                                                                                                                                                                                                                                                                          | target-architecture 표현이 source보다 넓다                                                                        |
| 5   | `target-architecture.md` 런타임 계약 3: 메시지 타입 "닫기 · 결과 전달 · 오류 · 촬영/공유 요청"                                                                       | 있는 것은 `ready` · `auth-required` · `handoff-ready`뿐. "아직 없는 것" 목록은 앱→web · 딥링크 · 촬영/공유만 적고 닫기 · 결과 전달 · 오류가 없다는 말은 없다                                                                                                                                                                                                                                                                           | Documented only 항목이 목록에서 빠져 있다                                                                         |
| 6   | `.claude/rules/web.md` "보호 page는 page 안에서 `requireSession(returnTo)`", `foundation.md` "제품 화면(홈 · 기록)"                                                  | `/`는 보호하지 않는 공개 부트스트랩 페이지이고 `InAppReady`도 없다. redirect allowlist에는 `/`가 있다                                                                                                                                                                                                                                                                                                                                  | 의도(공개 홈)인지 누락인지 docs에 없다 — 15절                                                                     |
| 7   | `data-access.md` 표: `apps/mobile/src/lib/api.ts` "`/health` 호출"                                                                                                   | `fetchHealth`는 정의 · 테스트만 있고 mobile 앱 코드에서 호출하지 않는다 (`pnpm health`는 web의 것을 부른다)                                                                                                                                                                                                                                                                                                                            | 표현 차이. 동작 문제는 아니다                                                                                     |
| 8   | `local-development.md` 환경변수 표: web 실제 파일은 `apps/web/.env.local`                                                                                            | 이 머신에는 `apps/web/.env`가 있다 (로컬 상태, 내용 미확인)                                                                                                                                                                                                                                                                                                                                                                            | 로컬 드리프트. Next는 둘 다 읽는다                                                                                |
| 9   | `.nvmrc` Node 24.14.0                                                                                                                                                | 이 세션의 `node --version` v24.20.0                                                                                                                                                                                                                                                                                                                                                                                                    | 로컬 드리프트                                                                                                     |
| 10  | `apps/mobile/app.json` — 문서화된 결정 없음                                                                                                                          | `name: "Mobile"` · `slug: "mobile"` · `scheme: "mobile"` · android `com.berrypjh.mobile` 생성기 기본값에 가깝다. 딥링크 계약(런타임 계약 5)을 받칠 설정이 없다                                                                                                                                                                                                                                                                         | 제품 식별자 미정. Planned 딥링크와 함께 결정 필요                                                                 |

## 13. Gap Analysis

### 제품 (docs 대비 source)

- **핵심 루프 대부분이 없다.** Capture · Understand는 온보딩 첫 사진 한 장에만 있다 — 앱 · web이 사진을 올리면 api가 설정된 모델로 분류한다(`/v1/processing-jobs`). Route · Act · Learn은 source · DB 스키마 · endpoint · 의존성에 흔적이 없다. 현재 제품 가치 흐름은 "로그인 → 온보딩(첫 사진 처리 뒤 막힘) → 부트스트랩 홈 → 빈 기록"이다
- 앱 · web 온보딩은 첫 사진 처리 뒤 "다음 단계는 준비 중입니다."에서 끝난다. 결과 화면과 완료 endpoint가 없어 실제 사용자는 홈에 닿지 못한다
- 권한 · 설정 · 결과 · no-action 상태는 규칙만 있고 첫 구현이 없다. 공용 loading · empty · error 컴포넌트도 없다(`ko-ui.md`)
- 화면 흐름 원문(화면 기획서)이 저장소 · 로컬 어디에도 없다. 코드 주석은 기획서 화면 ID를 참조하지만 원문을 확인할 수 없다

### 검증

- HEAD에서 `pnpm test`(따라서 `pnpm verify`)가 web 1건으로 실패한다
- E2E · DB 테스트 · web 빌드 · mobile 런타임은 AI 세션에서 돌릴 수 없다. CI가 없어 대신 돌려 주는 곳도 없다
- `swagger-check`는 어느 묶음 명령에도 없다 (`quality-gates.md`가 스스로 적음)

### DevHub 관점 — 무엇을 어디서 읽을 수 있는가

| DevHub가 보여줄 것        | 지금 읽을 수 있는 출처                                                     | 공백                                                                                  |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 프로젝트 · target · 의존  | `nx show projects`, `nx show project <n> --json`, `nx graph --file=<json>` | 없음. 빌드 시점에 JSON으로 뽑을 수 있다                                               |
| 시나리오 · 구현 상태      | **이 문서 6 · 7절뿐** (사람이 쓴 표)                                       | 기계가 읽을 시나리오 데이터 형식이 없다. `docs/scenarios/`는 빈 디렉터리(지금은 없음) |
| 코드 근거 (path · symbol) | 저장소 파일                                                                | 파일 → 시나리오 매핑이 코드에 없다                                                    |
| API 계약                  | `apps/api/docs/swagger/swagger.json` (route와 일치를 Go 테스트가 보장)     | TS 타입 생성 없음                                                                     |
| 테스트                    | Vitest · Playwright `--list`, `go test -json`                              | 테스트 → 시나리오 매핑 없음                                                           |
| docs 관계                 | markdown 링크 (8절)                                                        | 없음                                                                                  |
| 그래프 시각화             | —                                                                          | 공용 UI에 없고 graph 의존성도 없다. 추가하려면 의존성 4단계 판단 필요                 |

## 14. Recommended DevHub app name

**`devhub`** — 디렉터리 `apps/devhub`, Nx 이름 `devhub`, 패키지 `@snapdone/devhub`, tag `type:app`. E2E는 `apps/devhub-e2e`.

처음 이름은 `repo-atlas`였다(25절). 2026-09-19에 `devhub`로 바꿨다. 저장소 지도에서 성능 · 크기 등을 함께 보는 종합 개발 문서로 넓어질 예정이라, 규모가 커지기 전에 폴더 · Nx 이름 · 루트 script(`dev:devhub` · `devhub:check`) · 환경변수(`DEVHUB_COMMIT_SHA` · `DEVHUB_BRANCH`) · 화면 이름을 한 번에 바꿨다. 이 문서의 이전 절에 남은 기록도 새 이름으로 고쳐 읽히게 했다.

- 제품 앱(`web` · `mobile` · `api`)과 섞이지 않게 **개발용 도구**임을 이름이 말한다. 사용자 제품 이름("이미지 액션 라우터")이나 `web` 접두사를 쓰지 않는다
- 루트 `docs/`(마크다운 문서)와 헷갈리는 `docs` · `devdocs`, 이미 있는 `tools/`와 겹치는 `tools`는 쓰지 않는다
- `scenario-atlas`는 쓰지 않았다. 조사 당시 `apps/scenario-atlas/`에 이전 시도의 빌드 잔여물이 있었다. 2026-09-19 기준 그 디렉터리는 없다
- 새 앱은 `nx run-many`의 대상이 되므로 `pnpm lint` · `typecheck` · `test` · `build` · `verify` 범위가 늘어난다. `web-e2e`처럼 implicit dependency를 두지 않는 한 다른 프로젝트의 affected에는 영향이 없다

## 15. Open questions

Part II에서 답한 질문은 결정 절을 적어 두었다. 남은 질문은 27절 끝에 모았다.

1. `apps/scenario-atlas/` 잔여물과 빈 `docs/scenarios/`를 지울지 — **해결: 2026-09-19 기준 둘 다 없다**
2. DevHub는 저장소 파일을 빌드 시점에 읽는가, 실행 중에 읽는가 — **결정: 빌드 시점, 정적 출력** (23 · 25절)
3. 시나리오 데이터의 원본을 어디에 둘 것인가 — **결정: `apps/devhub/src/data`** (23절)
4. 그래프 시각화가 필요한가 — **결정: MVP는 목록 · 표가 기본이고 그림은 네이티브 DOM/SVG 보조** (21 · 24절)
5. 12절 #1(신규 사용자가 `/onboarding`으로 가지 않음) — 해결. `completeLogin`을 테스트 의도대로 고쳤다
6. `/`를 공개 페이지로 둘 것인지 (12절 #6) — 미결
7. 화면 기획서 원문을 다시 받을 수 있는가 — 미결
8. Go module 경로를 remote에 맞춰 바꿀지 (12절 #3) — 미결
9. DevHub를 `pnpm build`와 `verify`에 넣을지 — **결정: 넣는다(루트 스크립트 변경 없음)** (25절)

# Part II — Design

2026-09-18 결정. 근거는 괄호 안의 Part I 절이다. 결정을 바꾸면 이 절을 고치고 바뀐 근거를 적는다.

## 16. DevHub purpose

**"사용자의 목표 하나가 지금 어디까지 동작하고, 그 판단의 근거가 되는 코드 · 계약 · 문서 · 테스트 · 명령이 무엇인가"에 저장소를 다시 파헤치지 않고 답하는 내부 도구.**

- 읽는 사람: 이 저장소에서 일하는 개발자 · 리뷰어 · AI 에이전트
- 성공 기준
  - 화면의 모든 상태 표시가 **근거(evidence)까지 한 번에 따라갈 수 있다**
  - 구현된 것과 문서에만 있는 제품 목표가 **같은 모양으로 보이지 않는다** (19 · 20절)
  - 스냅샷이 낡았으면 낡았다고 보인다
- 하지 않는 것
  - 제품 화면이 아니다. 최종 사용자 · 앱 WebView에 노출하지 않는다
  - 코드 검색 엔진 · AST 인덱서가 아니다. 상태를 코드에서 자동 추론하지 않는다
  - 문서를 대체하지 않는다. `docs/`는 근거로 **링크**할 뿐 복제 · 재서술하지 않는다
  - 실시간 모니터가 아니다. 테스트를 돌리거나 CI를 대신하지 않는다
  - 데이터를 화면에서 편집하지 않는다. 데이터 변경은 PR 리뷰를 거친다

## 17. MVP scope

| 포함                                                                                                     | 근거 절 |
| -------------------------------------------------------------------------------------------------------- | ------- |
| 소비자 목표 시나리오 카탈로그 15개 (19절 표) · 단계 · 근거 · 상태 · 신뢰도                               | 6, 7    |
| 아키텍처 노드(프로젝트 · 런타임 · 외부 시스템)와 관계 목록, 보조 그림 1개                                | 3, 5    |
| API 참조 (Swagger 10개 operation) · 계약 참조 (`webview-bridge` 메시지 3종 · `auth-contracts` wire 타입) | 5       |
| 문서 목록 · 주제별 기준 문서 · 문서 간 링크                                                              | 8       |
| 명령 · 검증 결과 스냅샷(무엇을 돌렸고 무엇을 못 돌렸는지) · 테스트 파일 목록 · 외부 의존성               | 9, 11   |
| 알려진 불일치 10건                                                                                       | 12      |
| collector(Nx · Swagger 사실 추출)와 validator(참조 · 상태 규칙 검사)                                     | 23      |
| 커밋 SHA permalink                                                                                       | 22      |

| 제외 (단계)                                                                                         | 이유                                |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| line range · 스냅샷 신선도 자동 경고 · 테스트 목록 생성 · 문서 heading anchor · 전역 검색 (Phase 2) | generated 경로가 먼저 안정돼야 한다 |
| 내부 소스 미리보기 · 로컬 에디터 링크 · React Flow 재평가 · CI 결과 가져오기 (Phase 3)              | 22 · 24절 비교 결과, CI 없음(1절)   |
| AST 인덱싱 · 코드에서 상태 자동 추론 · 화면 편집 · 인증 · 배포 (계획 없음)                          | 16절 "하지 않는 것"                 |

## 18. Domain model

### 18.1 개념별 결정

| 개념                 | 결정                                                 | 근거                                                                                                                                                         |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository           | **채택**                                             | 링크를 만들 remote web 주소와 기본 branch가 필요하다 (2절). 저장소는 하나지만 SourceRef의 이름공간이다                                                       |
| RepositorySnapshot   | **채택**                                             | 모든 판정이 특정 커밋 기준이다 (Part I 전체가 `4940176` 스냅샷). permalink · 신선도 판단의 기준                                                              |
| Application, Library | **`Project` 하나로 병합**                            | Nx `projectType`(application · library · 미지정)과 tag(`type:app` · `type:lib` · `type:e2e`)가 이미 구분한다 (3절). 따로 두면 `web-e2e`가 어디에도 안 맞는다 |
| Runtime              | **채택 (노드 종류)**                                 | 한 프로젝트가 여러 곳에서 돈다 — `web`은 브라우저 · Next 서버 · 앱 WebView (5절). 프로젝트만으로는 이 경계가 안 보인다                                       |
| ExternalSystem       | **채택 (노드 종류)**                                 | Google OIDC · Postgres가 실제 호출 대상이다 (5절)                                                                                                            |
| ArchitectureNode     | **채택 = Project · Runtime · ExternalSystem 합집합** | 관계의 양 끝을 한 타입으로 받기 위해                                                                                                                         |
| Relation             | **채택**                                             | 의존(nx graph) · HTTP 호출 · WebView 호스팅 · postMessage · 실행 위치 · 저장이 서로 다른 관계다 (3, 5절)                                                     |
| Scenario             | **채택**                                             | IA의 출발점. 폴더가 아니라 소비자 목표                                                                                                                       |
| ScenarioStep         | **채택**                                             | 한 시나리오 안에서 단계마다 상태가 다르다 — 온보딩은 소개 화면 implemented, 완료 not-found (6절)                                                             |
| SourceRef            | **채택**                                             | 22절 정책                                                                                                                                                    |
| SymbolRef            | **SourceRef.symbol로 병합**                          | symbol은 파일 없이 의미가 없고, 검증도 "그 파일에 글자로 있는가"뿐이다                                                                                       |
| ApiRef               | **채택**                                             | endpoint는 파일이 아니라 `METHOD path`로 식별된다. Swagger에 `operationId`가 없으므로 `swagger.json`의 `paths` 키를 그대로 쓴다 (5절)                        |
| ContractRef          | **채택**                                             | 계약 이름이 symbol이 아니다 — `handoff-ready`는 `WebToAppMessage` 유니온의 한 variant (5절). 계약 종류: `webview-bridge` · `auth-contracts` · `api-dto`      |
| DocumentRef          | **채택**                                             | 문서는 근거로 링크한다 (8절). 경로 + 선택 heading                                                                                                            |
| TestRef              | **채택**                                             | 러너마다 식별이 다르다 — Go는 함수 이름, Vitest · Playwright는 제목 (9절)                                                                                    |
| CommandRef           | **채택**                                             | 명령마다 이 환경에서 못 도는 이유가 다르다 — 포트 · DB · EAS · 기기 (9절)                                                                                    |
| VerificationRef      | **채택**                                             | "테스트가 있다"와 "스냅샷에서 통과했다"는 다르다. web 1건 실패 · E2E 미실행 · Go DB 테스트 skip (9절)                                                        |
| ImplementationStatus | **채택** (5값, 19절)                                 | Part I 분류 그대로                                                                                                                                           |
| Confidence/Evidence  | **채택, 숫자 없음** (19절)                           | 같은 "implemented"라도 E2E를 돌린 것과 코드만 읽은 것은 다르다                                                                                               |
| Discrepancy          | **추가**                                             | Part I 12절의 docs ↔ source 불일치 10건. 상태와 별개로 보여야 한다                                                                                           |

### 18.2 타입 스케치

구현 코드가 아니라 설계 스케치다. 이름 · 모양은 구현 때 바뀔 수 있지만 **필드의 의미와 금지 사항은 이 절이 기준**이다.

```ts
type RepositoryId = string; // 'snapdone'

type Repository = {
  id: RepositoryId;
  webUrl: string; // remote에서 .git을 뗀 주소
  defaultBranch: string; // 'main'
};

type RepositorySnapshot = {
  repository: RepositoryId;
  commit: string; // 40자 SHA
  capturedOn: string; // YYYY-MM-DD
};

type ImplementationStatus = 'implemented' | 'partial' | 'documented-only' | 'planned' | 'not-found';
type Confidence = 'high' | 'medium' | 'low';

/** 22절. 사람이 쓰는 필드는 이것뿐이다. */
type SourceRef = {
  repository: RepositoryId;
  path: string; // 저장소 상대 POSIX 경로, 파일 또는 디렉터리
  symbol?: string; // 그 파일에 글자 그대로 있는 식별자. Go 메서드는 'Type.method'
};

/** collector가 만든 데이터에만 붙는다. curated 데이터에 있으면 validator가 실패한다. */
type GeneratedRange = { commit: string; start: number; end: number };

type ApiRef = { method: 'GET' | 'POST'; path: string }; // swagger.json paths 키
type ContractRef = {
  contract: 'webview-bridge' | 'auth-contracts' | 'api-dto';
  name: string; // 'handoff-ready', 'Session', 'HandoffStartRequest'
  source: SourceRef;
};
type DocumentRef = { path: string; heading?: string }; // heading은 문서의 제목 글자 그대로
type TestRef = {
  runner: 'vitest' | 'playwright' | 'go' | 'node-test';
  source: SourceRef; // Go는 symbol = 테스트 함수 이름
  title?: string; // Vitest · Playwright의 describe › test 제목
};
type CommandConstraint = 'port-binding' | 'database' | 'browser-binaries' | 'eas-cloud' | 'device';
type CommandRef = {
  id: string;
  command: string;
  nx?: { project: string; target: string };
  constraints: CommandConstraint[]; // AI 세션에서 못 도는 이유. 빈 배열 = 어디서나 돈다
};
type VerificationRef = {
  id: string;
  command: string; // CommandRef.id
  commit: string; // 돌린 스냅샷
  observedOn: string;
  outcome: 'pass' | 'fail' | 'pass-with-skips' | 'not-run';
  summary: string; // '113/114, callback.spec.ts 1건 실패'
};

type Evidence =
  | { basis: 'source'; ref: SourceRef }
  | { basis: 'test'; ref: TestRef }
  | { basis: 'run'; verification: string } // VerificationRef.id
  | { basis: 'doc'; ref: DocumentRef }
  | { basis: 'absence'; query: string; scope: string[] }; // 무엇을 어디서 찾았는데 없었나

type Project = { kind: 'project'; id: string; source: SourceRef }; // 나머지 필드는 generated
type Runtime = { kind: 'runtime'; id: string; label: string; source: SourceRef[] };
type ExternalSystem = { kind: 'external'; id: string; label: string; evidence: Evidence[] };
type ArchitectureNode = Project | Runtime | ExternalSystem;

type Relation = {
  from: string;
  to: string;
  kind: 'depends-on' | 'calls' | 'hosts' | 'sends-message' | 'runs-in' | 'stores-in';
  api?: ApiRef[];
  contracts?: ContractRef[];
  evidence: Evidence[];
};

type LoopStage = 'capture' | 'understand' | 'route' | 'act' | 'learn';

type ScenarioStep = {
  id: string;
  title: string; // 사용자가 겪는 한 단계
  runtime: string; // Runtime.id
  loopStage?: LoopStage;
  status: ImplementationStatus;
  source?: SourceRef[];
  api?: ApiRef[];
  contracts?: ContractRef[];
  tests?: TestRef[];
};

type Scenario = {
  id: string;
  goal: string; // 소비자 목표 한 문장
  status: ImplementationStatus;
  confidence: Confidence;
  confidenceReason: string; // 왜 그 등급인지 한 문장
  steps: ScenarioStep[];
  evidence: Evidence[];
  docs: DocumentRef[];
  commands: string[]; // CommandRef.id
  discrepancies?: string[]; // Discrepancy.id
};

type Discrepancy = {
  id: string;
  claim: DocumentRef | TestRef; // docs · 테스트가 말하는 것
  observed: Evidence[]; // source · 실행 결과
  verdict: string;
};
```

### 18.3 ID 규칙

- 시나리오 · 노드 · 명령 ID는 영어 kebab-case이고 **내용을 말한다** (`webview-auth-handoff`). 화면 기획서의 화면 ID · 기능 코드를 ID나 표시 문자열에 쓰지 않는다
- 프로젝트 노드 ID는 Nx 이름 그대로 (`web`, `devhub`)
- ID는 URL에 쓰이므로 한 번 공개하면 바꾸지 않는다. 바꿔야 하면 옛 ID를 validator가 막는 목록에 남긴다

## 19. Status semantics

### 19.1 ImplementationStatus

| 값                | 화면 라벨     | 의미                                                           | 필요한 근거 (validator 규칙)                                                    |
| ----------------- | ------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `implemented`     | 구현됨        | 사용자 경로 전체가 source에 있고 호출된다                      | 모든 단계가 `implemented`이고 단계마다 SourceRef ≥ 1                            |
| `partial`         | 일부 구현     | 경로 일부만 source에 있다                                      | `implemented`/`partial` 단계(SourceRef 포함) ≥ 1 **그리고** 그 외 상태 단계 ≥ 1 |
| `documented-only` | 문서에만 있음 | docs가 동작 · 책임을 규정하지만 source에 코드가 없다           | 어느 단계에도 SourceRef 없음 · `doc` 근거 ≥ 1 · `absence` 근거 ≥ 1              |
| `planned`         | 계획          | docs가 "나중에 · 생기면"으로만 언급하고 동작을 규정하지 않는다 | `doc` 근거 ≥ 1 · SourceRef 없음. 단계는 비어도 된다                             |
| `not-found`       | 찾지 못함     | docs와 source 어디에도 없다                                    | `absence` 근거 ≥ 1 · `doc` 근거 없음                                            |

- 상태는 **사람이 정하고 validator가 모순을 막는다.** 코드에서 자동 추론하지 않는다
- 시나리오 상태는 단계 상태와 모순되면 안 된다 (위 규칙). 단계 하나가 `not-found`인 시나리오를 `implemented`로 둘 수 없다
- 검증 여부는 상태에 섞지 않는다. 실행하지 못한 E2E는 상태가 아니라 신뢰도(19.3)와 검증 결과(VerificationRef)에 나타난다

### 19.2 표시 그룹 — 구현과 제품 목표를 섞지 않는다

그룹은 상태에서 **파생**한다. 별도 필드를 두지 않는다.

| 그룹          | 상태                          | 표시                                                                                 |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| **현재 동작** | `implemented` · `partial`     | 실선 테두리, 상태 라벨                                                               |
| **제품 목표** | `documented-only` · `planned` | 점선 테두리 · 흐린 면 · 라벨 "아직 코드 없음" · 그룹 제목에 "구현되지 않음"을 글자로 |
| **찾지 못함** | `not-found`                   | 목록에만. 그림에 그리지 않는다                                                       |

- **Capture → Understand → Route → Act → Learn은 제품 목표 그룹이다** (6 · 7절). 아키텍처 그림에 이 단계의 노드를 그리지 않는다. 아키텍처 노드는 SourceRef나 외부 시스템 근거가 있어야만 만들 수 있다 (validator)
- 제품 목표 루프는 시나리오 화면에서 **별도 figure**("제품 목표 흐름 — 코드 없음")로만 그린다. 현재 동작 그림과 같은 캔버스 · 같은 스타일을 쓰지 않는다
- 색만으로 구분하지 않는다. 모든 노드 · 행에 상태 라벨 글자가 있다 (21절)

### 19.3 Confidence

숫자 점수를 만들지 않는다. 등급은 아래 규칙으로만 정하고, `confidenceReason`에 한 문장으로 이유를 쓴다.

| 등급     | 조건                                                                                                          | Part I 예                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `high`   | 근거 source 확인 **그리고** 그 경로를 통합 수준(E2E · DB 포함 Go 테스트)으로 실행해 이 스냅샷에서 통과한 기록 | 지금은 없다 — E2E · DB 테스트를 이 스냅샷에서 돌리지 못했다 (9절)                     |
| `medium` | 근거 source(또는 부재 검색) 확인, 실행 기록은 단위 수준까지거나 없음                                          | WebView 핸드오프: source 확인 · web/mobile 단위 통과 · Go DB 테스트 skip · E2E 미실행 |
| `low`    | 판정이 코드 판독 추론이나 docs에만 기대거나, 실행 기록이 판정과 어긋난다                                      | 12절 #1의 E2E 실패 예측 — 실행하지 않은 추론                                          |

- 부재(`documented-only` · `not-found`)는 실행으로 증명할 수 없으므로 최고 `medium`이다
- VerificationRef가 `fail`인 테스트를 근거로 삼는 시나리오는 `high`가 될 수 없다

### 19.4 MVP 시나리오 카탈로그

Part I 6절의 21행을 **소비자 목표**로 다시 묶었다. 루프 단계(분석 · 의도 · 행동 선택 등)는 시나리오가 아니라 제품 목표 시나리오의 단계다.

| id                        | 목표 (한 문장)                                    | 상태            | 신뢰도 | 6절 행                                                                                                                                           |
| ------------------------- | ------------------------------------------------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `open-app`                | 앱이나 사이트를 열면 첫 화면이 보인다             | implemented     | medium | app entry                                                                                                                                        |
| `resume-session`          | 다시 열어도 로그인이 이어진다                     | implemented     | medium | session restore                                                                                                                                  |
| `sign-in-browser`         | 브라우저에서 Google로 로그인한다                  | implemented     | medium | browser Google auth (불일치 #1 연결)                                                                                                             |
| `sign-in-app`             | 앱에서 Google로 로그인한다                        | implemented     | medium | mobile Google auth (런타임 검증 없음)                                                                                                            |
| `recover-sign-in-failure` | 로그인이 실패하면 이유를 알고 다시 시도한다       | implemented     | medium | auth error/fallback, API failure(인증 부분)                                                                                                      |
| `sign-out`                | 로그아웃한다                                      | implemented     | medium | logout                                                                                                                                           |
| `webview-auth-handoff`    | 앱 안에서 기록 화면을 로그인된 채로 본다          | implemented     | medium | WebView entry, WebView auth handoff (27절 예시)                                                                                                  |
| `finish-onboarding`       | 처음 온 사용자가 온보딩을 마치고 홈에 닿는다      | partial         | medium | onboarding (완료 단계 not-found)                                                                                                                 |
| `view-history`            | 지금까지 처리한 일을 다시 본다                    | partial         | medium | history, no-action/empty state(빈 상태 부분)                                                                                                     |
| `finish-task-from-image`  | 사진 · 스크린샷을 넣으면 하려던 일이 끝난다       | documented-only | medium | screenshot/image capture, image analysis, intent, action routing, native action, external service, result/completion, API failure(제품 API 부분) |
| `no-action-found`         | 할 일을 찾지 못하면 그렇다고 듣고 선택지를 받는다 | documented-only | medium | no-action/empty state(no-action 부분)                                                                                                            |
| `permission-denied`       | 권한을 거부해도 다른 방법으로 이어간다            | documented-only | medium | permission denied                                                                                                                                |
| `automate-repeated-task`  | 반복되는 일을 직접 켠 자동화에 맡긴다             | documented-only | medium | (6절에 없음, `product-principles.md` Automation · Learn)                                                                                         |
| `change-settings`         | 설정 화면에서 설정을 바꾼다                       | documented-only | medium | settings (헤더 다크 모드 스위치는 근거 메모로만)                                                                                                 |
| `sign-in-other-provider`  | Apple · 네이버 · 카카오로 로그인한다              | planned         | medium | 7절 Planned                                                                                                                                      |

`finish-task-from-image`의 단계는 `loopStage`를 가진다 — capture(mobile 카메라 · 사진 · 공유 시트 / web 파일 · 붙여넣기) → understand → route(근거 · 확인) → act(네이티브 · 외부 서비스) → 결과(완료 문장 · 되돌리기). 전부 `documented-only`다.

딥링크 · CI · OpenAPI 생성 같은 7절의 나머지 Planned 항목은 소비자 목표가 아니므로 시나리오가 아니라 Engineering 화면의 항목이다.

## 20. Information Architecture

### 20.1 Top-level

| 순서 | 메뉴           | 답하는 질문                                | 주요 내용                                                                                    |
| ---- | -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1    | **개요**       | 이 저장소는 지금 어떤 상태인가             | 스냅샷(커밋 · 날짜 · 신선도), 그룹별 시나리오 수(파생), 알려진 불일치, 검증 기준선 요약      |
| 2    | **시나리오**   | 사용자는 무엇을 할 수 있고 무엇은 아직인가 | 19.4 카탈로그를 그룹(현재 동작 · 제품 목표 · 찾지 못함)별로, 필터(상태 · 플랫폼 · 루프 단계) |
| 3    | **아키텍처**   | 무엇이 어디서 돌고 서로 어떻게 부르는가    | 노드 목록 · 관계 표 · 보조 그림, 하위 보기: API(Swagger) · 계약(bridge · wire 타입)          |
| 4    | **문서**       | 어떤 문서가 무엇의 기준인가                | 주제별 기준 문서(8절 표), 문서 간 링크, 그 문서를 근거로 쓰는 시나리오                       |
| 5    | **엔지니어링** | 어떻게 검증하고, 무엇이 검증되지 않았나    | 명령과 제약, 검증 결과 스냅샷, 테스트 파일, 외부 의존성과 정책, 엔지니어링 Planned 항목      |

- **시나리오가 두 번째(첫 작업 메뉴)다.** 폴더 트리 메뉴는 두지 않는다. 폴더는 SourceRef로만 나타난다
- `Dependencies`는 top-level로 두지 않는다. 내부 의존(프로젝트 → lib)은 아키텍처 관계이고, 외부 패키지(루트 `package.json` dependencies 23 · devDependencies 46, Go 직접 의존 5)는 추가 정책(4단계)과 함께 엔지니어링에서 읽힌다 (11절)
- 화면 언어는 한국어(저장소 기본 locale). 식별자 · 경로 · 명령은 원문 그대로

### 20.2 시나리오 화면

- 목록: 행마다 목표 문장 · 상태 라벨 · 신뢰도 라벨 · 걸친 플랫폼. 그룹 제목이 "현재 동작" · "제품 목표 — 아직 구현되지 않음" · "찾지 못함"
- 상세 (`/scenarios/<id>`): 목표 → 상태와 신뢰도 이유 → **단계 순서 목록(기본 표현)** → 단계 흐름 그림(보조, 같은 데이터) → 근거 · 불일치
- 단계 행: 순서 · 제목 · 런타임 · 상태 라벨 · 근거 개수. 선택하면 inspector가 그 단계를 보여준다

### 20.3 Right Inspector

선택한 대상(시나리오 · 단계 · 노드 · 관계 · API · 문서)의 근거를 한곳에 모은다. **섹션은 항상 같은 순서로 모두 보인다.** 비어 있으면 숨기지 않고 "없음"과 이유를 쓴다 — 빈 칸이 곧 정보다.

| 섹션   | 내용                                                                        | 비었을 때 예                                     |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------ |
| 개요   | 이름 · 종류 · 상태 라벨 · 신뢰도와 이유 · 목표/설명 · 기준 스냅샷           | —                                                |
| 소스   | SourceRef를 프로젝트별로. 경로(복사 가능한 글자) · symbol · permalink       | "소스 없음 — 문서에만 있음", 부재 검색어와 범위  |
| 관계   | 들어오고 나가는 Relation, 연결된 API · 계약, (시나리오면) 거치는 노드       | "관계 없음"                                      |
| 문서   | DocumentRef(경로 · heading) · 이 대상이 걸린 불일치                         | "근거 문서 없음"                                 |
| 테스트 | TestRef와 최근 VerificationRef 결과(통과 · 실패 · skip · 실행 안 함 + 이유) | "테스트 없음" / "E2E — 이 스냅샷에서 실행 안 함" |
| 명령   | 이 대상을 검증 · 실행하는 CommandRef와 제약 라벨(포트 · DB · EAS · 기기)    | "명령 없음"                                      |

- 섹션 이동은 탭이 아니라 **제목(h2) + inspector 안 목차 링크**다. 공용 UI에 Tabs가 없고(10절) 목차는 스크린 리더 제목 탐색과 그대로 맞는다
- 넓은 화면(`lg` 이상): 목록 오른쪽 열. 좁은 화면: inspector가 본문 전체를 쓰고 맨 위에 "목록으로" 링크. overlay drawer · dialog를 쓰지 않는다(공용 UI에 없음, 포커스 트랩 부담)

### 20.4 URL

선택 상태는 **route**로 표현한다. 정적 출력에서 동작하고, 뒤로 가기 · 링크 공유가 그대로 된다.

```
/                                  개요
/scenarios                         카탈로그
/scenarios/<id>                    시나리오 상세 (inspector = 시나리오)
/scenarios/<id>/steps/<stepId>     단계 선택 (inspector = 단계)
/architecture                      노드 · 관계
/architecture/nodes/<id>           노드 선택
/architecture/api                  Swagger operation 목록
/architecture/contracts            계약 목록
/docs                              문서
/engineering                       명령 · 검증 · 테스트 · 의존성
```

## 21. Accessibility model

**목록 · 표가 정본이고 그림은 같은 데이터의 보조 표현이다. 그림만 있는 화면은 만들지 않는다.**

- 모든 그림(아키텍처 · 단계 흐름 · 제품 목표 루프)은 같은 화면에 **같은 정보를 담은 목록 · 표**가 먼저 있다. 그림은 `<figure>` + `<figcaption>`이고, 캡션에서 해당 표로 가는 링크를 둔다
- MVP 그림은 **상호작용이 없다.** 선택 · 이동은 목록의 링크로만 한다. 그림은 `role="img"`와 요약 `aria-label`(노드 수 · 관계 수 · 그룹)을 갖는다. 그림 안에 두 번째 포커스 체계를 만들지 않는다
- 상태 · 신뢰도는 **글자 라벨**로 전달한다. 색 · 점선 · 아이콘은 보조다. 표시 그룹도 제목 글자로 말한다
- 관계는 "`web` → 호출 → `api` (`POST /v1/auth/handoff/exchange`)"처럼 문장으로 읽히는 표 행이다
- landmark: `header` · `nav`(주요 메뉴) · `main`(목록) · `aside aria-label="상세"`(inspector). SkipLink로 `main`에 간다 (web과 같은 방식, `foundation.md`)
- route가 바뀌면 inspector 제목으로 포커스를 옮기고, "목록으로"는 선택했던 행으로 돌아간다
- 320px에서 가로 스크롤 없음. 넓은 표는 `TableScroll`(label 필수)로 감싼다
- JS 없이도 목록 · 표 · 링크가 읽힌다(정적 HTML). 필터 · 검색은 JS가 있을 때의 개선이다
- 모션 없음. 터치 타깃 44px, 전역 `:focus-visible`, 라이트/다크 토큰은 web과 같다

## 22. Source-link policy

### 22.1 SourceRef

- **정본 필드는 `repository` · `path` · `symbol?` 셋뿐이다.** path는 저장소 상대 POSIX 경로(`apps/web/src/lib/auth/handoff.ts`), 앞의 `/` · `./` 없음
- **path가 저장소 안을 가리키는지 한 곳에서 판정한다**(`domain/links.ts`의 `isCanonicalPath`). 받는 것은 저장소 상대 POSIX 경로뿐이다 — 절대 경로(`/etc/passwd`) · 저장소 밖으로 나가는 `..` · `.` · 빈 세그먼트 · 역슬래시 · 제어 문자 · URL(`://`) · 앵커(`#`)를 모두 거부한다. 공백과 한글은 허용하고 링크를 만들 때 세그먼트 단위로 인코딩한다. permalink · 최신 브랜치 링크 · 에디터 링크가 모두 이 판정을 먼저 지난다
- `symbol`은 **그 파일에 글자 그대로 있는 식별자**다. validator가 단어 경계 텍스트 검색으로 확인한다. Go 메서드만 `Type.method`로 쓰고 receiver 패턴(`func (x *Type) method(`)으로 찾는다. 이것은 검색 힌트이지 AST 주소가 아니다
- **line number를 사람이 쓰지 않는다.** `GeneratedRange`는 collector가 만든 데이터에만 붙고, curated 파일에 range가 있으면 validator가 실패한다. range의 `commit`이 스냅샷과 다르면 쓰지 않는다
- **URL을 데이터에 쓰지 않는다.** 링크는 `Repository.webUrl` + `RepositorySnapshot.commit` + `path`에서 렌더할 때 만든다

### 22.2 navigation 방식 비교

| 방식                                           | 장점                                      | 단점                                                                                                | 결정                                  |
| ---------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| branch link `…/blob/main/<path>`               | 최신 코드                                 | 판정 근거와 다른 코드를 보여줄 수 있다. 파일이 옮겨지면 404                                         | 보조 ("최신 main에서 보기") — Phase 2 |
| **commit SHA permalink** `…/blob/<sha>/<path>` | 상태를 판정한 그 코드. 영구               | 최신이 아니다. 저장소가 private이면 GitHub 권한이 있어야 열린다                                     | **MVP 정본**                          |
| 저장소 상대 경로 (글자)                        | 오프라인 · 복사 · 에디터 검색에 바로 쓴다 | 클릭 이동이 없다                                                                                    | **항상 함께 표시**                    |
| 로컬 에디터 deep link (`vscode://file/…`)      | 바로 편집                                 | 머신별 절대 경로가 필요하고 에디터에 묶인다. 정적 출력에 넣으면 개인 경로가 새어 나간다             | 제외. Phase 3에 opt-in 검토           |
| 내부 소스 미리보기                             | 화면을 떠나지 않는다                      | 소스를 번들해야 하고 크기 · 신선도 · syntax highlight 의존성이 생긴다. `.env` 같은 파일이 섞일 위험 | Phase 3                               |

### 22.3 MVP 정본 링크

```
file:      <Repository.webUrl>/blob/<RepositorySnapshot.commit>/<path>
directory: <Repository.webUrl>/tree/<RepositorySnapshot.commit>/<path>
range:     …#L<start>-L<end>   (GeneratedRange.commit == 스냅샷 commit일 때만, Phase 2)
```

- 지금 값: `https://github.com/berrypjh/snapdone/blob/4940176917cffbac66fa06328908dad18c12c18f/<path>` (2절 remote에서 `.git` 제거)
- symbol은 URL에 넣지 않는다(GitHub에 안정된 symbol anchor가 없다). 링크 옆에 글자로 보인다
- DocumentRef도 같은 permalink로 연다. heading은 글자로 보이고, anchor slug는 한국어 제목의 GitHub slug 규칙을 확인한 뒤 Phase 2에서 붙인다

## 23. Data ownership — curated / generated 경계

| 종류                              | 위치                                     | 누가 만드나                         | 담는 것                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **curated** (사람이 쓰고 PR 리뷰) | `apps/devhub/src/data/`                  | 사람 · AI 에이전트, 리뷰 후 커밋    | Repository, 시나리오 · 단계 · 상태 · 신뢰도와 이유, 런타임 · 외부 시스템 노드, 관계의 의미(calls · hosts …), 문서의 역할, CommandRef 제약, VerificationRef(관측 기록), 불일치 |
| **generated** (손으로 안 고침)    | `apps/devhub/src/generated/*.json`, 커밋 | collector (`nx run devhub:collect`) | 스냅샷 commit, Nx 프로젝트 · target · tag · 의존(`nx show project --json`, `nx graph --file`), Swagger operation 목록(`apps/api/docs/swagger/swagger.json`)                   |
| **linked evidence**               | `docs/**`, `.claude/**`, 소스 파일       | 원래 주인                           | DevHub는 경로 · heading만 참조하고 내용을 복제 · 파싱해 상태를 만들지 않는다                                                                                                  |
| **model**                         | `apps/devhub/src/model/`                 | 사람                                | 18.2 타입과 19절 규칙 함수                                                                                                                                                    |

- **새 공유 Nx library를 만들지 않는다.** 모델을 쓰는 곳이 `devhub` 하나다(`libs.md` "두 번째 사용처"). `libs/`는 플랫폼 중립 제품 계약 자리이고 도구 모델이 들어갈 곳이 아니다
- generated를 **커밋**하는 이유: 빌드 · 테스트가 Nx를 중첩 실행하지 않아도 되고, 사실이 바뀐 것이 diff로 리뷰된다. collector는 결정적으로(키 정렬 · 2칸 들여쓰기 · 끝 줄바꿈) 쓴다
- collector는 **CLI 출력과 JSON 파일만 읽는다.** 소스를 파싱하지 않는다
- 다른 앱의 파일은 **import하지 않고 빌드 시 `fs`로 읽는다.** `type:app` → `type:app` import는 `@nx/enforce-module-boundaries`가 막는다(3절)
- validator = `devhub`의 Vitest(`environment: 'node'`) 테스트. 따라서 `pnpm test`에 포함된다. 검사:
  - 모든 SourceRef · TestRef · DocumentRef 경로가 저장소에 있다. symbol은 파일에 글자로 있다. Go 테스트는 함수가 있다. DocumentRef heading은 문서에 있다
  - ApiRef는 generated Swagger operation에 있다. 프로젝트 ID는 generated 프로젝트에 있다
  - 19.1 상태 규칙, 19.3 신뢰도 규칙, 아키텍처 노드의 근거 규칙(19.2)
  - curated에 GeneratedRange · URL이 없다
  - curated `snapshot`과 generated `commit`이 같다 — 다르면 실패하고 collector를 다시 돌리라고 알린다
- **이 문서와의 관계:** 이 문서는 조사 · 결정 기록이다. `src/data`가 생기면 시나리오 상태의 원본은 데이터이고, Part I 6 · 7절은 2026-09-18 조사 스냅샷으로 남는다. 같은 표를 두 곳에서 갱신하지 않는다

## 24. Dependency policy

2026-09-18 다시 확인: `@xyflow/react` · `reactflow`는 `node_modules`에 없고, `pnpm-lock.yaml`에 0건, 어느 `package.json`에도 없다. dagre · elkjs · d3도 없다(1 · 11절). **설치하지 않았다.**

| 요구사항 (Part I 근거)                                                       | 네이티브 DOM/SVG                     | React Flow (`@xyflow/react`)                             |
| ---------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| 노드 규모: 아키텍처 약 15개(프로젝트 7 · 런타임 · 외부), 시나리오 단계 ≤ 8개 | 충분                                 | 과함 — 수백 노드용 설계                                  |
| 배치: 런타임 레인에 고정 배치, 드래그 · 줌 · 팬 불필요                       | CSS grid 레인 + SVG 연결선           | 기본 기능이지만 쓰지 않는 기능                           |
| 정적 HTML · Server Component에서 읽혀야 한다 (21절 JS 없이 읽힘)             | 된다                                 | client 전용 캔버스. JS 없으면 빈 영역                    |
| 목록 · 표가 정본, 그림은 비상호작용 보조 (21절)                              | 맞다                                 | 자체 키보드 · 포커스 모델이 목록과 두 번째 체계를 만든다 |
| 공용 토큰 · 라이트/다크 (`foundation.md`)                                    | Tailwind 토큰 클래스 그대로          | 라이브러리 CSS를 덮어써야 한다                           |
| 의존성 4단계 (AGENTS.md)                                                     | 1~3단계(기존 · 표준 · 플랫폼)로 해결 | 4단계 사유가 필요하고 사용자 승인 대상                   |

**결정: MVP는 네이티브 DOM/SVG.** MVP는 새 의존성이 0개다 — Next.js · `@berrypjh/react-ui` · Tailwind preset · Vitest를 그대로 쓴다. 검색은 `SearchField` + 배열 필터, 마크다운 렌더링 · syntax highlight · 상태관리 라이브러리를 넣지 않는다.

React Flow는 다음 중 하나가 **실제로** 생기면 Phase 3에서 4단계 판단과 승인을 거쳐 다시 본다: 노드가 수십 개를 넘어 고정 레인으로 안 읽힌다 · 사용자가 자유 배치 · 줌을 요구한다 · 자동 edge routing이 필요하다.

## 25. App naming decision

**확정: `devhub`.**

| 항목              | 값                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 디렉터리          | `apps/devhub`                                                                                                                   |
| Nx 이름 · 패키지  | `devhub` · `@snapdone/devhub`                                                                                                   |
| tag · projectType | `type:app` · `application` (새 tag 체계를 만들지 않는다)                                                                        |
| 스택              | Next.js App Router, 빌드 시 데이터를 읽는 정적 출력. `apps/web`의 관례(kebab-case 파일 · Tailwind preset · 공용 UI 직접 import) |
| 제품과의 관계     | 제품 앱을 import하지 않는다. 제품 web · WebView(`WEB_VIEW_PATHS`)에 연결하지 않는다. 인증 · Go API 호출 없음                    |
| 빌드 · 검증       | `nx run-many`에 자연히 포함된다(루트 스크립트 변경 없음). implicit dependency를 두지 않는다                                     |

- `scenario-atlas`는 쓰지 않았다 — 조사 당시 같은 경로에 이전 시도의 빌드 잔여물이 있었다(2절). 지금은 없다
- 앱을 만드는 것은 이 문서 범위가 아니다

## 26. Phase boundaries

| 단계              | 포함                                                                                                                                                                                                                 | 끝났다고 말하는 조건                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1 (MVP)** | 앱 골격 · model · curated 데이터(19.4 카탈로그 15개, 5절 노드 · 관계, 8절 문서, 9절 명령 · 검증 기록, 12절 불일치) · collector(Nx · Swagger) · validator · 20절 화면 5개 · inspector · 네이티브 그림 · SHA permalink | `nx lint`/`typecheck`/`test devhub` 통과(validator 포함), 모든 화면에 목록 · 표 표현, 사용자 터미널의 `nx build devhub` 통과(AI 세션은 Next 빌드 불가, 9절) |
| **Phase 2**       | 테스트 목록 생성(Vitest · `playwright --list` · `go test -list`), GeneratedRange(symbol 텍스트 검색으로 줄 찾기), 스냅샷 신선도 경고(HEAD ≠ 스냅샷), 문서 heading anchor, branch 보조 링크, 전역 검색                | generated 필드가 curated와 섞이지 않고 validator가 둘을 구분                                                                                                |
| **Phase 3**       | 내부 소스 미리보기, 로컬 에디터 opt-in 링크, CI가 생기면 검증 결과 가져오기, React Flow 재평가(24절 조건)                                                                                                            | 각 항목을 착수 전에 이 문서에 결정으로 추가                                                                                                                 |
| 계획 없음         | AST · 언어 서버 인덱싱, 코드에서 상태 자동 추론, 화면에서 데이터 편집, 인증 · 외부 배포                                                                                                                              | —                                                                                                                                                           |

**어느 단계에서도** 제품 목표 시나리오를 근거 없이 `implemented`로 올리지 않는다. 핵심 루프 코드가 생기면 먼저 Part I 방식으로 다시 조사하고, 그 결과로 데이터를 바꾼다.

## 27. Worked example — `webview-auth-handoff`

설계가 실제 저장소에 맞는지 한 시나리오로 확인한 것이다. 모든 경로와 symbol은 2026-09-18 스냅샷에서 확인했다.

- **목표** 앱 안에서 기록 화면을 로그인된 채로 본다
- **상태** implemented · **신뢰도** medium — source는 모든 단계에서 확인됐고 web · mobile 단위 테스트는 통과했지만, Go 핸드오프 DB 테스트는 `TEST_DATABASE_URL`이 없어 skip됐고 E2E는 이 스냅샷에서 실행하지 않았다

| #   | 단계                                              | 런타임         | SourceRef (path · symbol)                                                                                                                                                                                                                  | API · 계약                                                            |
| --- | ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | 홈에서 "기록 보기"를 누르면 WebView가 열린다      | mobile-app     | `apps/mobile/src/screens/HomeScreen.tsx` · `HomeScreen`; `apps/mobile/src/screens/WebContentScreen.tsx` · `WebContentScreen`; `apps/mobile/src/auth/webHandoff.ts` · `initialWebContent`                                                   | —                                                                     |
| 2   | web이 verifier를 cookie에 두고 challenge를 알린다 | web-server     | `apps/web/src/lib/auth/handoff.ts` · `handleHandoffStart`, `handoffChallenge`; `apps/web/src/app/(auth)/auth/handoff/ready/page.tsx` · `HandoffReadyPage`                                                                                  | 계약 `webview-bridge` · `handoff-ready`                               |
| 3   | 앱이 메시지를 확인하고 일회용 코드를 받는다       | mobile-app     | `apps/mobile/src/auth/webHandoff.ts` · `receiveMessage`; `apps/mobile/src/auth/controller.ts` · `startHandoff`; `apps/api/internal/httpserver/handoff.go` · `handlers.handoffStart`; `apps/mobile/src/auth/webHandoff.ts` · `openExchange` | `POST /v1/auth/handoff/start`, 계약 `api-dto` · `HandoffStartRequest` |
| 4   | web 서버가 코드를 교환해 세션 cookie를 심는다     | web-server     | `apps/web/src/lib/auth/handoff.ts` · `handleHandoff`, `completeHandoff`; `apps/web/src/lib/auth/api.ts` · `exchangeHandoffCode`                                                                                                            | `POST /v1/auth/handoff/exchange`                                      |
| 5   | 기록 화면이 셸 없이 열리고 제목을 알린다          | mobile-webview | `apps/web/src/app/(product)/history/page.tsx` · `HistoryPage`; `apps/web/src/components/in-app-ready.tsx` · `InAppReady`                                                                                                                   | 계약 `webview-bridge` · `ready`                                       |

| 근거 종류 | 참조                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| test      | vitest `apps/web/src/lib/auth/handoff.spec.ts` (`handleHandoffStart` · `completeHandoff` · `handleHandoff`), vitest `apps/mobile/src/auth/webHandoff.spec.ts` (`receiveMessage` · `retries`), vitest `libs/webview-bridge/src/lib/bridge.spec.ts` (`auth messages`), go `apps/api/internal/httpserver/handoff_test.go` · `TestHandoffCreatesChildWebSession`, playwright `apps/web-e2e/src/auth.spec.ts` "WebView handoff" |
| run       | web · mobile · libs Vitest — pass (web 전체는 다른 파일 1건 실패), Go — pass-with-skips(DB 테스트 skip), E2E — not-run(포트 바인딩)                                                                                                                                                                                                                                                                                        |
| doc       | `docs/architecture/data-access.md` · "WebView 로그인 핸드오프"                                                                                                                                                                                                                                                                                                                                                             |
| 명령      | `nx test web` · `nx test mobile` · `nx test webview-bridge` (제약 없음), `nx test api` + `TEST_DATABASE_URL` (database), `pnpm e2e` (port-binding · browser-binaries)                                                                                                                                                                                                                                                      |

이 예에서 드러난 모델 요구: 단계마다 런타임이 바뀐다(Runtime 필요), 비공개 Go 메서드 · 클로저 멤버(`startHandoff`)도 글자 symbol로 충분하다, 같은 테스트 파일이 여러 시나리오의 근거가 된다(TestRef는 시나리오에 종속되지 않는다), DB 없이 skip되는 테스트는 "통과"가 아니다(VerificationRef `pass-with-skips`).

### 남은 미결

1. GitHub 저장소가 private이면 SHA permalink는 권한 있는 사람에게만 열린다. 공개 여부와 그 경우의 대안(상대 경로만 표시)을 정해야 한다
2. DevHub를 로컬 전용으로 쓸지, 정적 출력을 어딘가에 게시할지. 게시한다면 스냅샷 · 경로가 외부에 나간다
3. generated JSON 커밋 방식을 받아들일지 — 대안은 build · test 전에 collector를 target 의존으로 돌리는 것(Nx 중첩 실행)
4. 한국어 GitHub heading slug 규칙 — Phase 2 문서 anchor 전에 확인
5. Part I 15절 미결 1 · 5 · 6 · 7 · 8

## 28. 구현 상태 — Phase 1 앱 골격

2026-09-18, 기준 커밋 `4940176` 위의 미커밋 변경.

### 생성

`@nx/next:application`(Nx 23.1.1)으로 만들었다. 플래그는 `nx g @nx/next:application --help`에서 확인한 것만 썼다.

```
nx g @nx/next:application --directory=apps/devhub --name=devhub --linter=eslint \
  --unitTestRunner=none --e2eTestRunner=none --tags=type:app --useProjectJson=false \
  --skipPackageJson --skipFormat --interactive=false
```

- `--skipPackageJson` — 기본값이면 루트 `package.json`을 고친다(dry-run으로 확인). 버전 이동을 막았다
- `--unitTestRunner=none` — 선택지가 `jest` · `none`뿐이다. 저장소는 Vitest를 쓴다
- `--useProjectJson=false` — `apps/web`처럼 Nx 설정을 `package.json` `nx`에 둔다
- `--swc`는 기본값(true)을 뒀다. `false`면 `.babelrc`가 생겨 Next가 Babel로 컴파일한다(dry-run으로 확인)
- AI 세션 샌드박스가 `.vscode/extensions.json` 쓰기를 막아 generator가 실패했고, 사용자 터미널에서 같은 명령으로 실행했다

generator가 앱 밖에 남긴 변경과 처리

| 파일                      | generator가 한 일            | 처리                                                                                    |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `.prettierrc`             | 새로 만듦 (`singleQuote`)    | 지움. 이 저장소는 `package.json` `prettier` 키를 쓴다(`quality-gates.md`)               |
| `nx.json`                 | JSON 재직렬화(배열 줄바꿈)만 | Prettier로 원래 모양 복원. 내용 변경 없음                                               |
| `.vscode/extensions.json` | JSON 재직렬화만              | 원래 모양 복원                                                                          |
| `.gitignore`              | 끝 줄바꿈만 제거             | 복원                                                                                    |
| `tsconfig.json` (루트)    | —                            | `nx sync`가 `apps/devhub` project reference를 추가했다. **유지** (`nx sync:check` 필수) |

앱 안에서 generator 산출물을 `apps/web` 관례로 바꿨다: `.swcrc` · `src/app/api/hello` · `page.module.css` · Nx 소개 page/CSS 삭제, `tsconfig.json` · `eslint.config.mjs`(`@berrypjh/eslint-config/react` + `core-web-vitals`) · `postcss.config.mjs` · `tailwind.config.mjs`(`@berrypjh/react-ui/tailwind`)를 web과 같은 모양으로, `package.json`에 `projectType: application`과 web과 같은 `typecheck` target.

### 현재 모양

| 항목        | 값                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx 프로젝트 | `devhub`, `application`, tag `npm:private` · `type:app`. graph 의존 없음(들어오고 나가는 edge 0)                                                                  |
| target      | `build` · `dev` (c) · `start` (c) · `serve-static` (c) · `build-deps` · `watch-deps` (c) · `lint` · `typecheck` · `test`(29절에서 `vitest.config.ts`를 두어 생김) |
| 의존성      | `@berrypjh/react-ui` `^1.1.2` · `next` `~16.1.6` · `react`/`react-dom` `19.2.3` — web과 같은 선언, 루트 버전 변경 없음                                            |
| import      | `next`, `@berrypjh/react-ui`, `@berrypjh/react-ui/styles.css`, `tailwindcss`뿐. 제품 앱 · `libs/` · private 패키지 없음                                           |
| 화면        | `/` smoke page 하나 — `header`(제품명) · `main`(h1 "Snapdone DevHub", 저장소 `berrypjh/snapdone`, "DevHub skeleton"). 테마 스크립트 · 셸 · 데이터 없음            |

### E2E 결정

generator 기본값(`--e2eTestRunner=playwright`)은 `apps/devhub-e2e`를 만든다(dry-run으로 확인). **만들지 않았다.**

- smoke page에는 E2E가 고정할 동작이 없다
- generator 산출물은 `apps/web-e2e`의 가짜 API · 포트 · 브라우저 구성과 무관한 예제 spec이라 그대로 쓸 수 없다
- DevHub E2E는 Phase 1 화면(목록 정본 · inspector route · 320px · 키보드, 21절)이 생길 때 추가한다. 그때 web(3000)과 겹치지 않는 포트를 정한다

### 남은 wiring

- ~~`pnpm-lock.yaml`에 `apps/devhub` importer가 없다~~ — 사용자가 `pnpm install`을 실행해 importer가 추가됐다(새 패키지 없음, lock +15줄)
- `nx build devhub`는 AI 세션에서 Turbopack PostCSS 워커가 포트를 열지 못해 실패한다(`binding to a port … Operation not permitted`, web과 같은 원인). 사용자 터미널에서 확인한다
- **`pnpm dev` · `pnpm build`의 범위가 넓어졌다.** 둘 다 `nx run-many`라 `dev` · `build` target이 있는 `devhub`도 함께 돈다(`nx show projects --with-target dev` → `devhub` · `api` · `web`). `README.md` · `local-development.md`의 "`pnpm dev`는 web과 api를 함께 띄운다"는 이제 틀리다. 두 Next dev 서버가 같은 기본 포트(3000)를 원한다. 루트 스크립트에서 뺄지, 포트를 정할지는 결정 대상이다(문서 · 스크립트 수정은 하지 않았다)

## 29. 구현 상태 — 도메인 모델 · curated 데이터

`apps/devhub/src/domain`(타입 · 파생 함수)과 `src/data`(curated 사실)를 만들었다. 화면(`src/app`)은 아직 데이터를 읽지 않는다 — 사실과 표현이 분리된 채로 시작한다.

### 파일

| 경로                           | 내용                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/domain/model.ts`          | 타입만. React · URL · SHA 없음                                                                                   |
| `src/domain/links.ts`          | `sourceUrl`(스냅샷 commit으로 permalink 파생) · `commandLine`(실행 문자열 파생) · `isCanonicalPath`              |
| `src/data/repository.ts`       | 저장소 1건 (`berrypjh/snapdone`, remote에서 `.git` 제거)                                                         |
| `src/data/projects.ts`         | application 5 (`web` · `mobile` · `api` · `web-e2e` · `devhub`), library 2 (`auth-contracts` · `webview-bridge`) |
| `src/data/external-systems.ts` | `postgres` · `google-oidc`                                                                                       |
| `src/data/apis.ts`             | `NewRouter`가 등록하는 route 11개 — Swagger에 있는 10개 + dev 전용 `/swagger/*any`                               |
| `src/data/contracts.ts`        | bridge UA 토큰 1 · 메시지 3 (`ready` · `auth-required` · `handoff-ready`) · auth wire 타입 3                     |
| `src/data/relations.ts`        | workspace-dependency 5 · runtime 7                                                                               |
| `src/data/documents.ts`        | `AGENTS.md` · `README.md` · `.claude/README.md` · `docs/**/*.md` 7개                                             |
| `src/data/commands.ts`         | 루트 스크립트 16개 전부 + `api`의 `migrate` · `swagger` · `swagger-check`                                        |
| `src/data/index.ts`            | `catalog` — 위를 한 객체로 묶는다                                                                                |

### 관계 두 종류

| kind                   | 뜻                                                                                | 데이터                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workspace-dependency` | manifest가 선언한 Nx graph edge. 빌드 구조일 뿐 실행 중 호출을 뜻하지 않는다      | `web`/`mobile` → `auth-contracts`/`webview-bridge` (`workspace:*`), `web-e2e` → `web` (implicit)                                                                                                                                                 |
| `runtime`              | 실행 중에 일어나는 일. Nx graph와 무관하다 (`web` → `api` edge는 Nx graph에 없다) | `web` → `api` http-call(6 API) · `mobile` → `api` http-call(7 API) · `google-oidc` → `api` browser-redirect · `api` → `google-oidc` http-call · `api` → `postgres` persistence · `mobile` → `web` webview-host · `web` → `mobile` bridge-message |

`devhub`에는 어느 쪽 관계도 없다 — 제품과 분리돼 있다는 사실 그대로다.

### 22절 설계와 다르게 한 것

- **`SourceRef`에 `repository` 필드를 두지 않았다.** 저장소가 하나이고 catalog가 그 저장소를 소유하므로, 레코드마다 같은 ID를 복사하지 않는다. 저장소가 둘이 되면 그때 넣는다
- **`Project` 대신 `ApplicationRef` · `LibraryRef` 두 타입**(`kind`로 구분)으로 두었다. `web-e2e`는 `role: 'test'`인 application이다
- **`Runtime` 노드를 아직 만들지 않았다.** 지금 데이터에서 필요한 곳이 없다. 런타임 경계는 relation의 `interaction` · `summary`에 있고, 시나리오 단계가 런타임을 가리켜야 할 때 추가한다
- **`RepositorySnapshot`은 타입만 있다.** SHA를 데이터에 적지 않는다. commit은 링크를 렌더할 때 인자로 받는다(collector가 생기면 거기서 온다)
- **`TestRef` · `ImplementationStatus`는 타입만 있다.** 시나리오 데이터가 들어올 때 쓴다
- **`src/generated/`는 아직 없다.** collector 대신 validator가 manifest · `swagger.json`을 직접 읽는다. 그래서 Nx 명령은 manifest에 **명시된** target만 쓸 수 있다(플러그인이 추론한 `mobile:export` 같은 target은 collector 이후)

### curated / generated 경계 (지금)

| 사실                                                        | 원본                                                                | 누가 맞는지 보장하나                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| 프로젝트 ID · 경로 · tag · 패키지 이름                      | Nx manifest (`package.json` `nx`, `project.json`)                   | validator가 manifest와 **집합 일치** 검사  |
| workspace 의존                                              | manifest의 `workspace:*` · `implicitDependencies`                   | validator 집합 일치                        |
| API route                                                   | `apps/api/docs/swagger/swagger.json`(Go 테스트가 route와 일치 보장) | validator 집합 일치                        |
| 루트 스크립트 · 명시 target                                 | `package.json` · manifest                                           | validator                                  |
| 문서 목록 · 제목                                            | `docs/**/*.md`, 첫 `#` 줄                                           | validator 집합 · 제목 일치                 |
| 요약 · 역할 · runtime relation 의미 · 명령 제약 · 계약 분류 | **curated** (사람이 판단)                                           | 근거 path · symbol 존재만 validator가 확인 |

### 테스트

`vitest.config.ts`(web · libs와 같은 node 환경)를 두자 `@nx/vitest` 플러그인이 `test` target을 추론했다. 새 의존성 없음 — jsdom · testing-library를 넣지 않았다.

- `src/domain/links.spec.ts` — permalink · 실행 문자열 · 경로 규칙
- `src/data/catalog.spec.ts` — 위 표의 validator. ID 유일성, 모든 SourceRef가 정규 경로이고 존재하며 symbol이 파일에 글자로 있음(Go 메서드는 receiver 패턴), 레코드에 SHA · URL · `#L` 없음, 관계가 존재하는 노드 · API · 계약만 가리킴, http-call relation의 API 경로가 근거 파일에 글자로 있음, contract 이름이 정의 파일에 있음, 모든 contract의 owner가 library
- 틀린 symbol · Swagger에 없는 API · 선언과 다른 의존 edge를 각각 넣어 해당 테스트가 실패하는 것을 확인하고 되돌렸다

## 30. 구현 상태 — curated 시나리오 · step trace

2026-09-18, HEAD `4940176` 기준. 모든 step의 source · test · 문서 heading을 이 커밋에서 다시 읽고 확인했다. 데이터는 `apps/devhub/src/data/scenarios/`(시나리오 1개당 파일 1개), `tests.ts`(TestRef 109개), `runtimes.ts`(6개)다.

### 모델 확장 (29절 대비)

| 추가                        | 이유                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Scenario` · `ScenarioStep` | step마다 사용자 의도(`intent`) · 시스템 동작(`behavior`) · runtime · 담당 노드(`owner`) · 상태 · source · API · 계약 · 테스트 · 문서 · `next`       |
| `RuntimeRef` (6)            | 같은 web 코드가 브라우저 · Next 서버 · 앱 WebView에서 돈다. 18.1의 Runtime을 여기서 도입했다                                                        |
| `TestRef.id` · `requires`   | 테스트를 ID로 참조하고, 무엇이 없으면 skip · 실행 불가인지(`database` · `port-binding` · `browser-binaries`)를 적는다                               |
| `DocumentLink`              | 문서 ID + heading 글자 그대로                                                                                                                       |
| `EvidenceGap`               | 증거가 보여주지 않는 것을 숨기지 않고 적는다 — failing-test · runtime-unverified · external-unverified · code-not-found · config-required · no-test |
| `AbsenceCheck`              | "코드 없음" 주장의 근거. validator가 매번 다시 검색한다                                                                                             |
| `ScenarioStep.via`          | 다른 시나리오를 거쳐 돌아오는 지점(보호 page → 로그인 → 복귀)                                                                                       |

신뢰도 등급(19.3)은 넣지 않았다. 검증 수준은 각 TestRef의 `requires`와 시나리오 gap으로 드러난다.

### 시나리오

| id                          | 상태            | step | runtime                                            | 테스트 (환경 조건별)   | gap                                                        |
| --------------------------- | --------------- | ---- | -------------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `app-entry-session-restore` | implemented     | 7    | mobile-app · go-api · next-server                  | 없음 13 · DB 1 · E2E 1 | runtime-unverified                                         |
| `browser-google-login`      | implemented     | 6    | next-server · browser · go-api                     | 없음 7 · DB 3 · E2E 4  | external-unverified                                        |
| `mobile-google-login`       | implemented     | 7    | mobile-app · system-auth-browser · go-api          | 없음 11 · DB 3         | runtime-unverified · external-unverified · config-required |
| `onboarding-intro`          | **partial**     | 7    | go-api · mobile-app · next-server                  | 없음 4 · DB 1 · E2E 4  | code-not-found(완료) · runtime-unverified                  |
| `mobile-history-webview`    | implemented     | 4    | mobile-app · mobile-webview                        | 없음 6 · E2E 3         | runtime-unverified                                         |
| `webview-auth-handoff`      | implemented     | 6    | next-server · mobile-webview · mobile-app · go-api | 없음 10 · E2E 6 · DB 3 | runtime-unverified                                         |
| `protected-history-access`  | implemented     | 4    | next-server                                        | 없음 7 · E2E 4         | code-not-found(기록 내용)                                  |
| `logout-session-revocation` | implemented     | 3    | next-server · mobile-app · go-api                  | 없음 8 · E2E 1 · DB 1  | runtime-unverified                                         |
| `auth-failure-recovery`     | implemented     | 5    | go-api · next-server · browser · mobile-app        | 없음 9 · E2E 6         | runtime-unverified                                         |
| `webview-recovery`          | implemented     | 4    | mobile-app                                         | 없음 6 · E2E 2         | runtime-unverified                                         |
| `finish-task-from-image`    | documented-only | 7    | (목표) mobile-app · browser · go-api               | 없음                   | code-not-found — 7 step 모두 부재 검색으로 뒷받침          |

"없음"은 AI 세션에서도 도는 단위 테스트 수, "DB"는 `TEST_DATABASE_URL`이 없으면 skip되는 Go 테스트, "E2E"는 포트 · 브라우저가 필요한 Playwright다. **Go OAuth · 핸드오프 · 세션 저장소 테스트는 전부 DB가 필요하다** — `go test -json`으로 skip 목록을 확인했다.

### 구현과 제품 목표를 섞지 않는 장치

- `track: 'product-target'`인 시나리오는 상태가 documented-only · planned · not-found만 될 수 있고 step에 source가 있으면 validator가 실패한다
- documented-only step은 source 없이 문서 근거와 **부재 검색**을 가져야 한다. 부재 검색은 lockfile의 카메라 · 사진 · 캘린더 · 모델 SDK 패키지, web의 파일 입력 · 붙여넣기, bridge의 촬영 · 공유 메시지, Swagger · 마이그레이션의 image · upload, 소스의 Calendar · Receipt · undo · automation을 찾는다
- 온보딩 소개의 예시(영수증 · 공연 포스터 · 맛집 캡처)는 `EXAMPLES` 고정 문구로 기록했다. 해당 기능 step으로 만들지 않았다
- 검색어 `action`은 쓰지 않는다 — `transaction`(OAuth transaction 테이블 · Swagger)에 걸려 아무것도 증명하지 못한다는 것을 validator 첫 실행이 잡았다

### 새로 드러난 사실

- `onboarding-intro/finish` — onboarding_step을 complete로 바꾸는 SQL이 API 코드에 없다(부재 검색). 앱과 web 모두 첫 사진 처리 뒤 "준비 중" 문구에서 멈춘다
- `onboarding-intro/route-web-after-login` — implemented. `completeLogin`이 온보딩 전 사용자를 `/onboarding`으로 보낸다(12절 #1 해결). E2E는 실행하지 못했다
- `webview-recovery/load-failure` — WebView 로드 실패 뒤 재시도 분기를 직접 검사하는 테스트가 없다(no-test)
- `app-entry-session-restore/web-home` — web `/`는 세션을 Go에 확인하지 않는다. cookie 존재만으로 헤더에 로그아웃을 둔다

### validator (`src/data/scenarios.spec.ts`)

시나리오 ID · step ID 유일성, `next`는 같은 시나리오의 다른 step, `via`는 다른 시나리오, runtime · owner · API · 계약 · 테스트 · 문서 ID 존재, 문서 heading이 글자 그대로 있음, step source의 경로 · symbol 존재, 상태별 증거(implemented → source, partial → source + gap, documented-only → 문서 + 부재 검색, not-found → 부재 검색), 시나리오 상태 = step 상태에서 파생, implemented 시나리오에 테스트 ≥ 1, 부재 검색 재실행, TestRef의 파일 · Go 함수 · Vitest/Playwright 제목 존재, 모든 TestRef가 어딘가에서 인용됨.

product-target step에 implemented, 틀린 테스트 제목, 없는 `next`, implemented 시나리오 안의 not-found step을 각각 넣어 해당 테스트가 실패하는 것을 확인하고 되돌렸다.

## 31. 구현 상태 — application shell

그림(그래프) 없이 탐색 · 정보 밀도 · 시맨틱 레이아웃을 먼저 확정했다. 20절 IA를 따르되 아래가 다르다.

### 구조

```
SkipLink "본문으로 건너뛰기" → #main-content (49절부터 #devhub-main)
header (banner)            제품명 · owner/name · 기본 브랜치 · 검색(비활성 SearchField) · nav "보기"
div (lg: 15rem | 1fr | 20rem, xl: 18rem | 1fr | 24rem, 칸마다 따로 스크롤 / lg 미만: 세로로 쌓임)
├─ aside "탐색기"          nav "저장소 항목": 개요 + SECTIONS(시나리오 · 애플리케이션 · 라이브러리 · 문서 · 엔지니어링)
├─ main#main-content (49절부터 #devhub-main)  header(eyebrow · h1) · 그림 자리(figure) · 목록(정본)
└─ aside "상세 정보"       header(종류 · h2 · 상태) · nav "상세 목차" · 개요 · 소스 · 문서 · 테스트
```

| route             | workspace                                                  | inspector            |
| ----------------- | ---------------------------------------------------------- | -------------------- |
| `/`               | 저장소 · 섹션별 개수 · 시나리오 상태별 개수(데이터에서 셈) | 비어 있음(안내 문구) |
| `/<section>`      | 그 섹션의 항목 목록                                        | 비어 있음            |
| `/<section>/<id>` | 요약 + 그림 자리 + 정본 목록(단계 · 관계 · 인용 · 명령)    | 선택한 항목의 근거   |

- 정적 route다(`generateStaticParams`, `dynamicParams = false`). 선택 상태가 URL이라 JS 없이 읽히고 링크를 공유할 수 있다
- 탐색기 · 목록은 전부 `catalog`에서 만든다(`src/lib/entities.ts` `SECTIONS`). 시나리오는 "현재 동작"과 "제품 목표 — 아직 구현되지 않음"으로 나눠 보인다
- 20.4의 `/architecture` · `/docs`는 `/applications` · `/documents`로 두었다 — 탐색기 섹션과 route를 1:1로 맞췄다. 아키텍처 보기는 애플리케이션 · 라이브러리 두 섹션을 연다
- inspector 섹션은 20.3의 6개 중 개요 · 소스 · 문서 · 테스트 4개다. 관계 · 명령은 workspace 목록에 있다
- 소스는 경로 · symbol 글자만 보인다. 스냅샷 commit을 아직 연결하지 않아 permalink(22절)를 만들지 않는다 — 데이터에 SHA를 적지 않는 원칙을 지킨다

### 공용 UI · 토큰

- `@berrypjh/react-ui` 1.1.2에서 조회해 썼다(`berry-react-ui api`): `SkipLink` · `SearchField`(`inputProps`로 `aria-label`) · `Chip`(passive `<span>`, `leading`은 `aria-hidden`) · `VisuallyHidden`
- 상태 칩 색은 Chip의 공식 확장점인 `--ui-chip-fg` · `--ui-chip-border-color`에 공용 `--ds-text-*` · `--ds-stroke-*`를 넣었다. 상태마다 글리프(● ◐ ○ ◇ ×)와 글자 라벨이 함께 있어 색만으로 구분하지 않는다
- 새 CSS 변수는 없다. DevHub utility 둘만 더했다 — `devhub-grid`(`--ds-stroke-light`로 그린 격자), `devhub-code`(공용 monospace 토큰이 없어 Tailwind `--font-mono`)
- 배경은 `--ds-background-default`(캔버스) 위에 `--ds-background-surface`(패널), 선택은 `bg-background-selected`

### 검증

- `nx lint` · `typecheck` · `test`(69) devhub 통과. `src/lib/entities.spec.ts` — 섹션이 catalog 전부를 담음, 항목 route가 유일하고 되돌아옴, inspector 빈 섹션마다 이유가 있음, 시나리오 inspector가 인용 테스트를 모두 보임, 제품 목표에는 소스가 없음
- 렌더 구조는 `react-dom/server`로 한 번 그려 확인했다(임시 spec, 커밋하지 않음): `main` 1 · `h1` 1, 탭 순서 SkipLink → 보기 nav → 탐색기 → workspace → 상세 목차, 비활성 검색은 탭 순서에 없음, 선택 항목 `aria-current="page"`
- **`nx build devhub`는 AI 세션에서 실패한다**(Turbopack PostCSS 워커 포트 바인딩, web과 같은 원인). 1920×1200 화면 · 실제 브라우저 탭 이동 · 포커스 링은 사용자 터미널에서 확인해야 한다

## 32. 구현 상태 — scenario flow viewer

시나리오 화면의 그림 자리를 읽기 전용 흐름 viewer로 바꿨다. 외부 graph 라이브러리 없이 DOM node + SVG edge다(24절 결정). 편집 · 연결 만들기 · 끌어서 옮기기는 없다.

### 모델 — 데이터와 좌표의 분리

| 층     | 파일                                    | 내용                                                                                                           |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 데이터 | `src/data/scenarios/*`                  | 변경 없음. 좌표 · 색 · 크기를 담지 않는다                                                                      |
| 배치   | `src/lib/flow.ts` `flowModel(scenario)` | 렌더할 때마다 데이터에서 계산. lane = 시나리오가 실제로 거치는 runtime만, column = `next`를 따라 왼쪽 → 오른쪽 |
| 보기   | `src/lib/viewport.ts`                   | pan · zoom · fit · reveal 순수 함수(screen = content × k + x, y)                                               |
| 화면   | `src/components/flow/*`                 | `usePanZoom` · `FlowToolbar` · `FlowLanes` · `FlowEdges` · `FlowNode` · `ScenarioFlow`(조립만)                 |

- **lane 순서**: 사용자 쪽에서 서버 쪽으로 — 브라우저 · 시스템 인증 브라우저 · 앱 · 앱 WebView · Next 서버 · Go API. 없는 runtime lane은 만들지 않는다
- **column**: 앞 단계에서 들어오는 `next`가 없으면 0, 있으면 가장 깊은 선행 단계 + 1. 앞 단계로 돌아가는 `next`는 깊이를 늘리지 않고 점선 루프로 그린다. 같은 lane · column의 단계는 lane 안에서 세로로 쌓는다
- **"사용자 의도 → 런타임 → 구현 → 계약/API → 검증"**: lane을 따로 두지 않고 node 안에 적었다 — 의도(제목) · runtime · 담당 · 첫 source 경로(+개수) · API/계약/테스트 개수 · 경유 시나리오. 계약 · 테스트는 단계와 다대다라 별도 lane으로 두면 runtime처럼 읽힌다
- 참조 흐름은 `mobile-history-webview`(앱 → 앱 WebView, `webview-auth-handoff` 경유)다. 네 runtime에 걸친 `webview-auth-handoff`도 같은 방식으로 그려진다. 11개 시나리오 전부 겹침 없이 배치되는지 테스트가 본다

### 선택 · route

```
/scenarios/<id>                  layout(셸 + 흐름 그림) + page(시나리오 inspector)
/scenarios/<id>/steps/<stepId>   같은 layout + page(단계 inspector)
```

- 흐름 그림은 `app/[section]/[id]/layout.tsx`에 있다. 단계 사이를 이동해도 layout이 다시 마운트되지 않아 pan · zoom이 유지된다. 오른쪽 inspector는 child page가 route에서 만든다 — **viewer 상태는 inspector 데이터에 닿지 않는다**(`usePanZoom`의 `useState`뿐, inspector는 `inspectStep(scenario, step)`)
- node는 단계 URL로 가는 진짜 `<a>`(Next `Link`, `scroll={false}`)다. 선택은 `useSelectedLayoutSegments()`로 URL에서 읽고 `aria-current="page"`로 표시한다. 새로고침 · 공유가 된다
- `DevHubShell`은 inspector 데이터 대신 `inspector` slot을 받도록 바꿨다(route page가 채운다)

### 상호작용 · 접근성

- pan: 배경 끌기(pointer capture, node · 버튼 위에서는 시작하지 않음), 휠, node에 포커스한 채 방향키. zoom: Ctrl/⌘ + 휠(pointer 기준), + −, 버튼. fit: 0, 버튼, 처음 열 때. zoom 40–200%
- transition · animation 없음 — reduced motion을 깨지 않는다
- 키보드로 화면 밖 node에 포커스하면 그 node가 보이도록 최소한만 pan한다(`revealRect`)
- node 글자는 zoom에 따라 작아질 수 있지만 link의 접근 이름에 전체 의도가 들어 있고, inspector와 아래 단계 목록에 원문이 그대로 있다
- edge SVG · lane 띠는 `aria-hidden`이다. 다음 단계는 node · 단계 목록 · inspector "다음"에 글자로 있다
- 상태: 칩 글리프 + 글자, 코드 없는 단계는 점선 테두리, 루프는 점선 화살표, 선택은 2px 테두리 — 색만으로 구분하지 않는다
- viewport는 탭 정지점이 아니다(`jsx-a11y/no-noninteractive-tabindex`). 키보드 pan · zoom은 node에서 올라오는 key 이벤트로 처리한다

### 검증

- `nx lint` · `typecheck` · `test`(90) devhub 통과. 새 테스트: `flow.spec.ts`(참조 흐름 lane · 순서 · edge, 핸드오프 4 lane, 11개 시나리오 겹침 없음 · 캔버스 안, 루프 표시, 단계 inspector), `viewport.spec.ts`(zoom 기준점 고정, fit, reveal, clamp)
- 렌더 구조는 `react-dom/server`로 확인했다(임시 spec · 임시 config, 커밋하지 않음, `useSelectedLayoutSegments`를 mock): transform layer 하나 안에 SVG(`aria-hidden`)와 node `<ol>`, node 4개가 단계 URL `<a>`, 선택 단계만 `aria-current="page"`, node 글자에 순서 · runtime · 상태 · 의도 · 담당 · 경로 · 개수 · 경유
- **`nx build devhub` · 브라우저 동작(끌기 · 휠 · 키보드 · fit 화면)은 AI 세션에서 확인하지 못했다** — 빌드는 포트 바인딩으로 실패, dev 서버 · 브라우저를 띄울 수 없다

## 33. 구현 상태 — architecture view

`/architecture` · `/architecture/<nodeId>`. 32절의 viewer를 `components/canvas/`(`CanvasViewport` · `CanvasEdges` · `usePanZoom`)로 뽑아 시나리오 흐름과 아키텍처 그림이 같은 pan/zoom 표면을 쓴다. 두 번째 graph engine · 자동 배치 · 새 의존성은 없다.

### node 10 — 코드나 실제 호출 근거가 있는 것만

36절에서 `devhub-e2e`가 더해져 지금은 node 11 · 관계 18이다. 아래 표는 이 절 시점의 기록이다.

| node                                | 종류                  | 근거                                                                              |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `web` · `mobile` · `api`            | 애플리케이션 · 제품   | Nx manifest                                                                       |
| `web-e2e`                           | 애플리케이션 · 테스트 | Nx manifest                                                                       |
| `devhub`                            | 애플리케이션 · 도구   | Nx manifest. 이 절 시점에는 관계 없음 — 36절에서 `devhub-e2e`와 관계 2개가 생김   |
| `auth-contracts` · `webview-bridge` | 라이브러리            | Nx manifest                                                                       |
| 브라우저 · PostgreSQL · Google OIDC | 외부                  | `RootLayout` · `startGoogleLogin` / `database.Open` · compose / `Client.Exchange` |

node마다 documented-by(`docs`)가 있다 — target-architecture의 영역별 절, quality-gates "E2E 범위", local-development "로컬 Postgres" 등.

### 관계 16 — 세 종류를 섞지 않는다

| 종류 (선 모양 · 글자)                  | 관계                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx 의존 5 (짧은 점선 · "Nx 의존")      | `web`/`mobile` → `auth-contracts`/`webview-bridge`(`workspace:*`), `web-e2e` → `web`(implicit)                                                                                                                                        |
| 실행 중 호출 10 (실선, 인증은 긴 점선) | 브라우저 → web 페이지 요청 · web → api / mobile → api HTTP 호출 · api → postgres 저장 · mobile → web WebView로 엶 · web → mobile bridge 메시지 · web → Google / mobile → Google / Google → api 인증 redirect · api → Google HTTP 호출 |
| 검증 1 (일점쇄선 · "검증")             | `web` verified-by `web-e2e` — Playwright가 next dev와 가짜 인증 API를 띄운다                                                                                                                                                          |

이번에 더한 관계는 모두 source 근거가 있다: 브라우저 → web(`RootLayout` · `startGoogleLogin` · `authCookies`), web → Google(`startGoogleLogin`의 `redirect(authorizeUrl)`), mobile → Google(`systemAuthBrowser`의 `openAuthSessionAsync`), web verified-by web-e2e(`playwright.config.mts` `webDev` · `fakeApi`). `browser-redirect` interaction은 `auth-redirect`로 이름을 바꿨다.

### Nx graph와 비교 (2026-09-18, `nx graph --file`)

- Nx edge 5개(`static` 4 · `implicit` 1)는 curated `workspace-dependency` 5개와 **정확히 같다**. validator가 매번 manifest(Nx가 읽는 그 원본)와 집합 일치를 검사한다
- Nx에는 `api`(Go)의 어떤 관계도, 실행 중 호출도, 검증도 없다 — **불일치가 아니라 Nx가 볼 수 없는 것**이다. 그래서 관계 종류를 나눴다
- `web-e2e` → `web`은 Nx에서 implicit 의존 한 줄이지만, 의미로는 반대 방향의 "web verified-by web-e2e"다. 두 관계를 따로 둔다
- `devhub`는 Nx에서도 edge가 없다

### 경계 3 — `src/data/boundaries.ts`

| 경계         | 가로지르는 관계                                   |
| ------------ | ------------------------------------------------- |
| WebView 경계 | WebView로 엶 · bridge 메시지                      |
| API 경계     | web → api · mobile → api · api → postgres         |
| 인증 경계    | web/mobile → Google · Google → api · api → Google |

각 경계는 존재하는 관계 · 문서 heading만 가리킨다(validator).

### 시나리오 ↔ 아키텍처

- 단계의 아키텍처 node는 **새로 적지 않고 파생한다**(`stepNodeIds`): 담당(`owner`) + source 경로가 속한 프로젝트 + API handler의 프로젝트 + 계약의 소유 lib. 예: 핸드오프 `request-code` → mobile · api · webview-bridge
- 시나리오 · 단계 inspector의 "연결 → 아키텍처에서 보기"가 `/architecture/<id>`로, node inspector의 "관련 시나리오 단계"가 단계 URL로 간다. 애플리케이션 · 라이브러리 상세에도 아키텍처 링크가 있다
- 모든 단계 → node → 같은 단계로 되돌아오는지 테스트가 본다

### 그림에서 뺀 것

제품 목표 시나리오(`finish-task-from-image`)의 단계 — 사진 입력 · 이미지 분석 · 행동 제안 · 실행(캘린더 · 영수증) · 결과 · 자동화 — 는 node가 아니다. 아키텍처 화면 맨 아래 "문서에만 있는 구성 — 그림에 없음" 목록에 상태 칩과 함께 두었다. 별도 target 그림은 만들지 않았다.

### 검증

- `nx lint` · `typecheck` · `test`(101) devhub 통과. 새 `architecture.spec.ts`: 위치가 node와 정확히 일치 · 겹침 없음, 관계 없는 node는 `standalone` 이유가 있을 때만, 외부 node는 source 근거, documented-by · 경계 heading 존재, 모든 관계가 그려짐, **어떤 edge도 끝점이 아닌 node 아래를 지나지 않음**(곡선 표본 검사 — 첫 실행에서 `mobile-opens-google`이 `api` 아래를 지나는 것을 잡아 bend를 고쳤다), 경계 관계 존재, 단계 ↔ node 왕복
- 렌더 확인(임시 spec, 커밋하지 않음): 지도 node 10개가 `/architecture/<id>` 링크, edge 글자 16개, 선택 node만 `aria-current`, api inspector → 관련 단계 링크, 핸드오프 단계 inspector → `/architecture/mobile` · `api` · `webview-bridge`
- **`nx build devhub`는 포트 바인딩으로 실패**(같은 원인). 브라우저 확인은 사용자 터미널에서 한다

## 34. 구현 상태 — repository navigation

inspector의 소스 · 문서 · 테스트 · API · 명령에서 저장소의 실제 위치로 간다. 22절 정책을 구현했다.

### 스냅샷 (`src/lib/snapshot.ts`, 서버 전용)

1. 빌드 환경 `DEVHUB_COMMIT_SHA`(40자 hex일 때만) · `DEVHUB_BRANCH`(안전한 이름일 때만)
2. 없으면 저장소 루트(`pnpm-workspace.yaml`이 있는 가장 가까운 상위 디렉터리)에서 `git rev-parse HEAD` — `execFileSync`, shell 없음, 5초 timeout, 출력 검증
3. 그래도 없으면 `unavailable` — commit은 `null`이고 가짜 SHA로 채우지 않는다. 브랜치 링크만 주고 상단 바에 "스냅샷 커밋을 알 수 없음"

같이 읽는 것: `git status --porcelain`(로컬 변경 여부 → "커밋 이후 로컬 변경 있음"), `git ls-tree -r --name-only <commit>`(스냅샷 커밋에 있는 경로). 프로세스마다 한 번만 읽는다. 데이터 파일에는 SHA가 없다.

### 링크 정책 (`src/domain/links.ts`, 순수 함수)

- `RepositoryRef.browse` 템플릿(`{base}/blob/{rev}/{path}` · `{base}/tree/{rev}/{path}` · `#L{start}-L{end}`)으로만 URL을 만든다. 호스트를 코드에 박지 않는다 — GitLab 모양 템플릿으로도 테스트했다. 링크 글자도 `webUrl`의 host(`github.com`)에서 온다
- **정본은 commit permalink**, 보조가 "최신 `<branch>`에서 보기"
- 경로는 정규 저장소 상대 경로만 받고 segment마다 `encodeURIComponent`한다(공백 · `%` · `?` · `[section]` · 한글). 루트 · 빈/`.`/`..` segment · 백슬래시 · 제어 문자 · `#` · URL은 거부한다
- revision은 40자 SHA 또는 안전한 브랜치 이름만
- line anchor는 **생성된** range가 같은 commit일 때만 붙는다. 지금 생성기가 없어 실제로 붙는 곳은 없다

### 링크를 만들지 않는 경우 (`src/lib/source-links.ts`)

| gap              | 조건                                   | 화면                                    |
| ---------------- | -------------------------------------- | --------------------------------------- |
| `invalid-path`   | 정규 경로가 아님                       | 이유 문구, 링크 없음                    |
| `missing`        | 디스크에 없음                          | 이유 문구, 링크 없음                    |
| `not-committed`  | 스냅샷 커밋에 없음(미커밋 · untracked) | 이유 문구, 링크 없음 — 누르면 404이므로 |
| `unknown-commit` | 스냅샷 커밋을 알 수 없음               | 브랜치 링크만                           |

지금 `apps/devhub/**`와 이 문서는 untracked라 `not-committed`로 표시된다. 커밋되면 링크가 생긴다.

### inspector

- 소스 · 문서 · 테스트 항목마다 "`github.com`에서 보기 @ `<short sha>`" · "최신 `main`에서 보기" · "경로 복사"(clipboard, 결과를 `role="status"`로 알림). 새 창 링크는 `rel="noopener noreferrer"`, 접근 이름에 경로와 "새 창"
- **API** 절(단계 · 시나리오에 API가 있을 때): `METHOD route`(+HEAD), handler 소스, 생성된 Swagger 문서(`apps/api/docs/swagger/swagger.json`). 개발 전용 `/swagger/*any`는 "Swagger에 없음"
- **"연결 → 이 테스트를 돌리는 명령"**: 테스트 runner에서 루트 명령으로(`vitest` · `go-test` → `pnpm test`, `playwright` → `pnpm e2e`, `node-test` → `pnpm test:hooks`) — 명령 화면에 실행 조건과 "명령 복사"
- 상단 바 · 개요에 스냅샷(`4940176` · git · 로컬 변경 있음)

### 보안

- href는 저장소 metadata(검증된 https `webUrl` · 템플릿) + 검증된 revision + 인코딩된 정규 경로로만 만든다. 사용자 입력 · query string을 href에 쓰지 않는다. validator가 `webUrl`이 https이고 query · hash · 끝 `/`가 없으며 템플릿이 `{base}/`로 시작하는지 본다
- git은 인자 배열로만 부르고(shell 없음) 실패는 `null`이다
- 로컬 에디터 deep link(`vscode://` 절대 경로)와 소스 미리보기 · 내용 복사는 만들지 않았다(Phase 2 · 3)

### 검증

- `nx lint` · `typecheck` · `test`(121) devhub 통과. 새 테스트: `links.spec.ts`(permalink · 디렉터리 · commit 없음 · generated range만 anchor · 다른 호스트 템플릿 · 공백/특수문자/한글 인코딩 · 잘못된 경로 11종 거부 · 잘못된 revision 거부), `snapshot.spec.ts`(env 우선 · 잘못된 env 무시 · git 실패 시 unavailable · dirty · 안전한 브랜치만, `linksFor`의 gap 4종), `catalog.spec.ts`(저장소 템플릿 신뢰 · runner → 명령 존재)
- 실제 저장소로 렌더 확인(임시 spec): 스냅샷 `4940176…` · git · dirty, `mobile-history-webview` inspector에 소스 · 문서 · 테스트마다 commit permalink와 main 링크, 핸드오프 `issue-code` 단계에 handler와 `swagger.json` 링크, untracked 문서 · `apps/devhub/package.json`은 `not-committed`, 없는 경로는 `missing`
- **GitHub에서 열리는지는 확인하지 못했다.** 대표 URL 6개가 익명 요청에 모두 404다. `github.com/berrypjh`는 200, `git ls-remote origin`(인증)은 HEAD `4940176`을 돌려주므로 저장소는 있고 **private**이다 — 접근 권한이 있는 로그인 세션에서만 열린다(22.3 미결 1). URL 모양은 GitHub 규칙과 같다
- `nx build devhub`는 포트 바인딩으로 실패(같은 원인)

## 35. 구현 상태 — global search

상단 바 검색 하나로 시나리오 · 단계 · 애플리케이션 · 라이브러리 · 아키텍처 구성 요소 · 개념(경계 · 런타임) · 문서 · API · 계약 · 소스 파일 · symbol · 테스트 · 명령을 찾는다. 새 dependency는 없다.

### 색인 (`src/lib/search-index.ts`)

- `catalog`에서 파생한다. 따로 적는 목록이 없다. 소스 파일 · symbol은 `src/lib/source-usage.ts`가 단계 · 관계 증거 · manifest · API handler · 계약 정의 · 테스트에 나온 경로를 모아 만든다(483개 항목)
- 항목마다 이동할 곳이 앱 안에 있다. 소스 · symbol · API · 계약 · 테스트는 새 화면 `/source?path=…`로 간다 — 그 파일을 인용하는 단계 · API · 계약 · 테스트 · 관계 · 구성 요소와 inspector(34절 링크). `path`는 `sourceUsage()`의 조회 키로만 쓰고 없으면 404다
- 개념: 경계 → `/architecture#boundary-<id>`, 런타임 → `/scenarios?runtime=<id>`

### 순위

fuzzy 없이 결정적이다. tier가 작을수록 앞이고, 같은 tier는 종류 순서 → 짧은 이름 → 이름 순이다.

| tier | 조건                                                                |
| ---- | ------------------------------------------------------------------- |
| 0    | 이름(label · id · 경로 · 파일명 · route)과 정확히 같음              |
| 1    | 이름 또는 `/` `.` `-`로 나눈 조각의 prefix                          |
| 2    | 검색어의 모든 단어가 token(camelCase · 구분자 분리)과 같거나 prefix |
| 3    | 이름 · 본문의 substring                                             |
| 4    | 관련 항목(인용하는 시나리오 · API · 계약)에서만 일치                |

NFC · 소문자로 비교한다. 목록에는 종류별 5개 · 전체 30개까지 순위 그대로 보이고, 전체 개수는 따로 알린다. 대표 검색어: `webview` → WebView 경계(0) 다음 시나리오들(1), `handoff` → `handoff.ts` · `handoff.go`(0), `session` → 계약 `Session` · `session.ts`(0), `history` → 기록 시나리오(1), `auth-contracts` → 라이브러리(0), `/v1/auth/handoff/start` → API(0), `quality-gates` → 문서 하나(0).

### 화면 · 키보드 (`src/components/global-search.tsx`)

- 공용 `SearchField`의 제안 목록(APG list-autocomplete combobox)을 그대로 쓴다. 포커스는 입력에 남고 활성 항목은 `aria-activedescendant`, ↑↓ 이동 · Enter 선택 · Escape 닫기는 SearchField가 처리한다. 처음부터 `suggestions`를 넘겨 입력 도중 역할이 바뀌지 않는다
- 추가한 것: ⌘K / Ctrl+K(다른 수식키 없이)로 입력에 포커스 · 전체 선택(`aria-keyshortcuts`), 결과 수 `role="status"`, 결과 없음 문구
- 결과 종류는 설명 앞 글자("라이브러리 · …")로 보인다. 색만으로 구분하지 않는다
- 최근 검색 · 분석은 없다

### 필터 (`src/lib/filters.ts` · `src/components/filter-bar.tsx`)

- 시나리오 목록: 트랙 · 상태 · 런타임. 서버에서 query를 허용 값으로 검증해 거른다. 남는 게 없으면 "조건에 맞는 시나리오가 없습니다"와 "필터 모두 해제"
- 아키텍처: 종류(애플리케이션 · 라이브러리 · 외부). client에서 query를 읽어(`Suspense`, fallback은 전체 그림) 노드와 양 끝이 남은 관계만 그린다. 노드 링크에 필터를 유지한다. 남는 게 없으면 빈 상태 문구
- 필터는 링크다. 선택된 값은 `aria-current` · ✓ · 굵기로 표시한다. URL에는 선택한 필터만 남는다

### 검증

- `nx lint` · `typecheck` · `test`(147) devhub 통과. 새 테스트: `search-index.spec.ts`(tier 순서 · 결정성 · 대소문자 · 빈/없는 검색어 · 대표 검색어), `search-view.spec.ts`(⌘K · Ctrl+K 판정, 종류 글자, 결과 수 문구, 서버 렌더 markup — combobox · 접근 이름 · 단축키 · status), `filters.spec.ts`, `architecture-map.spec.ts`(종류 필터 · 끊긴 관계 제거 · 링크의 필터 유지 · 빈 상태)
- 컴포넌트 렌더 테스트를 위해 `vitest.config.ts`에 JSX 변환(`oxc.jsx`)과 tsconfig 경로를 켰다. 환경은 node 그대로다
- **브라우저 키보드 동작(↑↓ · Enter · Escape · ⌘K 포커스)은 실행해 보지 못했다.** DOM 테스트 환경(jsdom 등)이 없고 설치하지 않았다. SearchField 동작은 설치된 빌드 코드를 읽어 확인했다
- `nx build devhub`는 포트 바인딩으로 실패(같은 원인)

## 36. 구현 상태 — 접근성 · DevHub E2E

그림 없이도 같은 정보를 볼 수 있게 했고, 핵심 키보드 경로를 E2E로 적었다. 새 dependency는 없다.

### 점검 결과와 고친 것

| 항목          | 전                                                        | 후                                                                                                                                           |
| ------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| landmark      | banner · 탐색기 aside · main · 상세 정보 aside            | 그대로. 상세 정보 aside에 `id` · `tabIndex=-1`(49절에서 id를 `devhub-inspector`로 바꿈)                                                      |
| 건너뛰기      | "본문으로 건너뛰기" 하나                                  | "상세 정보로 건너뛰기" 추가. 선택된 노드 바로 뒤에 "이 단계(구성 요소)의 상세 정보로 이동"                                                   |
| 그림 대안     | 시나리오는 그림 아래 짧은 단계 목록, 아키텍처는 관계 목록 | 그림 · 목록 전환(공용 `SegmentControl`, `aria-pressed`). 목록은 단계마다 실행 위치 · 담당 · 소스 · API · 계약 · 테스트 · 다음, 노드마다 관계 |
| 선택 표시     | 테두리 · 배경색 + `aria-current`                          | 글자 "· 선택됨" 추가, 그림 위 요약 줄에 "선택: …"                                                                                            |
| 화면 밖 선택  | 포커스를 받을 때만 보이게 이동                            | deep link로 열어도 선택된 노드를 보이게 이동                                                                                                 |
| 그림 요약     | 영역 이름 · 조작 안내                                     | "단계 N개 · 연결 N개 · 선택: …"를 보이는 글자로 두고 `aria-describedby`에 연결                                                               |
| 배율          | `aria-hidden` 숫자                                        | `<output>`(status)                                                                                                                           |
| 좁은 화면     | 탐색기 전체 목록이 본문 위를 차지, 상단 바가 옆으로 넘침  | `lg` 아래에서 탐색기는 "탐색기" 버튼(`aria-expanded`) 뒤로 접힌다. 본문 머리에 "상세 정보로 이동". 저장소 · 보기 줄은 줄바꿈                 |
| 대비          | —                                                         | 쓰는 글자 · 배경 토큰 쌍이 모두 4.5:1 이상(가장 낮은 것이 선택 배경 위 성공색 4.57:1)                                                        |
| 움직임 · 툴팁 | —                                                         | DevHub 자체 transition · animation 없음(공용 컴포넌트는 reduced motion을 따른다). `title` 툴팁에만 있는 정보 없음. `div` onClick 없음        |

선택하면 Next가 새 route segment의 첫 요소로 포커스를 옮긴다(`layout-router`의 scroll · focus 처리). 노드 · 목록 링크는 `scroll={false}`라 포커스가 노드에 남고, 한 번의 Tab이 상세 정보 건너뛰기로 간다. 검색 결과나 상단 보기로 다른 레이아웃에 가면 포커스는 문서 처음으로 돌아가고, 다음 Tab이 "본문으로 건너뛰기"다(42절).

### E2E 프로젝트 `devhub-e2e`

- web-e2e와 같은 모양(`package.json`의 `nx` · `type:e2e` · `implicitDependencies`)으로 만들고 `@nx/playwright:configuration`으로 설정을 생성했다. 이미 있는 `@nx/playwright` · `@playwright/test`만 쓴다
- `next dev --port 3100`만 띄운다. web-e2e의 가짜 인증 API는 가져오지 않았다
- Chromium만 돈다. macOS WebKit은 Tab이 링크를 건너뛰어 키보드 경로 검증 의미가 달라진다
- 17개: shell landmark · 건너뛰기 둘 · 좁은 화면(본문 우선 · 탐색기 접기 · 상세 정보 이동 · 가로 넘침 없음) · ⌘K · 결과 수 · 종류 글자 · 화살표와 Enter로 열기 · Escape · 결과 없음 · 노드 선택 → 상세 정보 → 소스 링크 · deep link · 배율 조절 · 시나리오 목록 · 아키텍처 목록(필터 유지) · 아키텍처 노드 선택

### 검증

- `nx lint` · `typecheck` · `test`(157) devhub, `lint` · `typecheck` devhub-e2e 통과. 새 단위 테스트: `scenario-outline.spec.ts`(모든 시나리오의 단계 · 링크, 실행 위치 · 소스 · API · 테스트 글자), `scenario-flow.spec.ts`(요약 · 선택 · 건너뛰기 · 배율 버튼 이름), `architecture-map.spec.ts`(요약 · 선택, 목록이 그림과 같은 노드 · 관계를 담는지)
- 새 프로젝트가 생기자 catalog 검증이 manifest 누락을 잡았다. `devhub-e2e` 노드와 관계 둘(implicitDependencies · 검증)을 넣었고, `devhub`는 관계가 생겨 "관계 없음" 설명을 뺐다
- 이 세션에서 E2E를 실행하지 못했다. dev 서버 포트 바인딩이 막혀 있다. `playwright test --list`로 17개가 잡히는 것까지 확인했다
- 접근성 자동 검사(axe 등)는 넣지 않았다. 필요하면 `@axe-core/playwright`를 별도로 제안한다

## 37. 구현 상태 — freshness 검증 · MVP 최종 검증

저장소가 바뀌면 DevHub가 조용히 낡지 않고 테스트가 실패하게 했다. AST 인덱서 · CI · 새 dependency는 없다.

### 먼저 고친 원인 — Nx 캐시가 낡은 통과를 재생했다

catalog 검증은 `apps/*` · `libs/*` · `docs/` · 루트 `package.json` · git 상태를 읽는데, `devhub:test`의 inputs는 자기 프로젝트 파일뿐이었다. `docs/`에 임시 md를 하나 넣고 확인했다.

| 실행                         | 결과                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `vitest run` (직접)          | `cover every markdown file under docs/` 실패         |
| `nx test devhub` (고치기 전) | `[local cache]` · 157 통과 — 낡은 결과를 그대로 재생 |
| `nx test devhub` (고친 뒤)   | 실패                                                 |
| `nx run devhub:devhub-check` | 실패                                                 |

`devhub`의 `test` · `build` · `devhub-check`를 `cache: false`로 두었다(`apps/devhub/package.json`). `build`도 같은 이유다 — 정적 페이지에 빌드 시점의 git 스냅샷(SHA · 추적 경로)이 들어가는데 inputs에 git이 없다. `pnpm verify` 스크립트는 바꾸지 않았다. `pnpm test`가 이미 devhub 테스트를 돌린다.

### `pnpm devhub:check`

루트 스크립트 `devhub:check` → `nx run devhub:devhub-check` → `vitest run src/data src/domain src/lib/snapshot src/lib/architecture.spec`. freshness spec 7개 파일만 돈다(약 2초). 같은 spec이 `nx test devhub`에도 들어 있어 `pnpm test` · `pnpm verify`에서 자동으로 돈다.

### 실행

`pnpm dev:devhub`(`nx dev devhub`) → http://localhost:3100. `dev` · `start` · `serve-static`을 3100에 고정해 `pnpm dev`가 web(3000)과 함께 띄워도 부딪히지 않고, `devhub-e2e`는 이미 떠 있는 3100 서버를 재사용한다. 그 전에는 둘 다 `next dev` 기본값 3000을 썼다.

### 규칙

| 묶음           | 규칙                                                                                                                                                                                                                                               | 위치                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| schema · graph | 컬렉션별 id 유일, 시나리오 안 단계 id 유일, 관계 양 끝 · `next` · `via` · runtime · owner · API · 계약 · 테스트 · 문서 id 존재, 경계 → 관계 id 존재                                                                                                | `catalog.spec` · `scenarios.spec` · `architecture.spec`   |
| 파일           | catalog이 인용한 **모든** 경로(manifest · 외부 근거 · handler · Swagger · 계약 · 관계 근거 · 문서 · 테스트 · 단계 source, 320건 · 고유 112개)가 정규 경로이고 디스크에 있다. `docs/**/*.md`는 빠짐없이 catalog에 있다                              | `freshness.spec` · `catalog.spec`                         |
| 문서 heading   | 인용한 heading이 글자 그대로 있다. 제품 한 문장은 인용한 heading 아래에 글자 그대로 있다                                                                                                                                                           | `scenarios.spec` · `architecture.spec` · `freshness.spec` |
| Nx project     | `nx graph --file`로 Nx가 실제로 보는 project 8개 = catalog project. manifest의 `workspace:*` · `implicitDependencies` = catalog의 Nx 의존 관계                                                                                                     | `freshness.spec` · `catalog.spec`                         |
| 명령           | 루트 script 전부가 catalog에 있다. catalog의 Nx target과 루트 script가 부르는 target(`nx run-many -t` · `nx run p:t` · `nx <target> <project>`)이 Nx가 추론한 target까지 포함해 존재한다                                                           | `freshness.spec` · `catalog.spec`                         |
| 시나리오 의미  | `implemented`는 source 필수, `partial`은 source + 공백, `documented-only` · `not-found`는 source 없음 + 부재 검색, 제품 목표 트랙은 source 없음. 단계 source에 테스트 · 문서 · e2e 파일 금지. 흐름 그림은 코드를 주장하는 단계에만 source를 그린다 | `scenarios.spec` · `freshness.spec`                       |
| API · 계약     | 항상 노출되는 route = 생성된 Swagger, 개발 전용 route는 Swagger에 없음, 계약 literal이 정의 파일에 있음                                                                                                                                            | `catalog.spec`                                            |
| 링크           | 인용한 모든 경로의 permalink · 브랜치 링크가 `RepositoryRef` 템플릿 + 스냅샷 + 인코딩된 경로에서만 나온다. 데이터에 URL · SHA · `#L` 없음                                                                                                          | `freshness.spec` · `catalog.spec` · `links.spec`          |
| 스냅샷         | env → git → unavailable 순서, 잘못된 env 무시, 실패 시 가짜 SHA 없음. DevHub 코드에 40자 SHA 없음. unavailable이면 상단 바가 "스냅샷 커밋을 알 수 없음 — main 브랜치 링크만 제공", 소스마다 "최신 main에서 보기"와 "고정 링크가 없습니다"          | `snapshot.spec` · `snapshot-view.spec` · `freshness.spec` |

규칙이 실제로 잡는지 데이터를 일부러 망가뜨려 확인하고 되돌렸다. 없는 target 이름(`api:swagger-verify`), 단계 source를 spec 파일로 바꾸기, 인용 파일 이름 바꾸기 — 셋 다 해당 규칙이 실패했고 실패 메시지에 인용한 레코드(`step webview-auth-handoff/start: …`)가 나왔다.

### symbol 검사의 한계

`symbolPattern`은 글자 검사다. `Type.method`는 Go receiver 모양(`func (x *Type) method(`)으로, 나머지는 앞뒤가 식별자 문자가 아닌 단어로 찾는다.

- false positive: 주석 · 문자열 · 다른 선언에 같은 단어가 있으면 통과한다. 선언이 지워져도 사용처가 남으면 못 잡는다
- false negative: 재export · 생성 코드 · 다른 파일에 있는 선언은 실패한다(그래서 그런 symbol은 인용하지 않았다)
- 여러 언어의 정확한 symbol index는 Phase 2다. 테스트 제목도 따옴표 안 글자로만 확인하고, 그 테스트가 통과하는지는 보지 않는다

### 제품 한 문장

개요에 "제품" 절을 더했다. `docs/product/product-principles.md` "한 문장 정의"의 문장을 그대로 인용하고(글자가 바뀌면 `freshness.spec` 실패), 현재 동작 시나리오 10개와 아직 구현되지 않은 제품 목표를 트랙별로 나눠 보여 준다.

### 알려진 공백

- `nx affected`는 DevHub가 저장소 전체를 읽는 것을 모른다. `apps/web`이나 `docs/`만 바꾸면 affected에 devhub가 없다. 인용된 파일을 바꿨으면 `pnpm devhub:check`를 따로 돌린다(`pnpm test`는 run-many라 항상 돈다). 실측 매핑과 이 안내를 repo-verify skill에 적었다
- 방향이 한쪽이다. catalog이 인용한 것이 사라지면 잡지만, 새 소스 파일 · 새 테스트 · 새 route 파일을 catalog이 모르는 것은 잡지 못한다. 예외는 Nx project · manifest 의존 · 루트 script · `docs/**/*.md` · Swagger route로, 이쪽은 양방향이다
- `next build`는 검사를 돌리지 않는다. `pnpm verify`는 test 뒤에 build를 돌리지만 `nx build devhub`만 돌리면 검사 없이 빌드된다
- `next dev`는 프로세스마다 스냅샷을 한 번 읽는다. 개발 서버를 띄운 뒤 커밋하면 다시 띄워야 새 SHA가 보인다
- Nx project 검사는 설치된 `node_modules/.bin/nx`를 부른다(daemon 끔, 약 0.3초). nx가 없으면 테스트가 실패한다 — 건너뛰지 않는다
- 저장소가 private이라 permalink는 권한 있는 로그인 세션에서만 열린다(34절)

### 최종 검증 (2026-09-19)

| 명령                                                      | 결과                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nx run-many -t lint,typecheck,test -p devhub,devhub-e2e` | 통과. devhub Vitest 169개 (16 파일)                                                                                                                                                                                                                          |
| `pnpm devhub:check`                                       | 통과. 7 파일 · 107개                                                                                                                                                                                                                                         |
| `pnpm verify`                                             | `format:check` · `lint` · `typecheck` 통과, `test`에서 멈춤 — DevHub와 무관한 기존 실패 2건: web `callback.spec.ts` 온보딩 이동(12절 #1, `apps/web` 변경 없음), api `internal/config` 5개(Nx가 `apps/api/.env`를 넣음, `NX_LOAD_DOT_ENV_FILES=false`로 통과) |
| `pnpm test:hooks`                                         | 49개 통과                                                                                                                                                                                                                                                    |
| `pnpm build`                                              | web · api는 캐시 재생, `devhub:build`는 포트 바인딩으로 실패(이 세션 제약)                                                                                                                                                                                   |
| `nx e2e devhub-e2e`                                       | 실행하지 못함 — 이 세션에서 포트 바인딩이 막혀 있다. `--list` 17개까지만 확인                                                                                                                                                                                |

### MVP 인수 — DevHub에서 답을 찾는 곳

| 질문                             | 어디서                                                               | 지금 답(예: `webview-auth-handoff` · `exchange` 단계)                                                                |
| -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. 무엇을 하려는 제품인가        | `/` 개요 "제품"                                                      | 사진과 스크린샷을 넣으면 무엇을 하려던 것인지 알아채고, 그 일을 대신 끝내주는 앱 (product-principles § 한 문장 정의) |
| 2. 실제 구현된 consumer flow     | `/` "현재 동작" · `/scenarios?track=current`                         | 10개 — 9개 구현됨, 온보딩 소개는 일부 구현                                                                           |
| 3. mobile · web · API 중 어디    | 단계 inspector "런타임 · 담당" · 흐름 lane · 목록 "실행 위치"        | Next 서버 · 담당 web                                                                                                 |
| 4. 담당 source                   | inspector "소스" · 목록 "소스"                                       | `apps/web/src/app/(auth)/auth/handoff/route.ts` 외 5개(web → api `handlers.handoffExchange` · `Handoff.Exchange`)    |
| 5. 거치는 contract · API         | 단계 inspector 개요의 API · 계약, "API" 절                           | `POST /v1/auth/handoff/exchange` · 계약 `Session` (auth-contracts)                                                   |
| 6. 관련 docs                     | 시나리오 inspector "문서"                                            | `docs/architecture/data-access.md` § WebView 로그인 핸드오프                                                         |
| 7. 관련 tests                    | inspector "테스트" · 목록 "테스트"                                   | vitest 3 · go-test 2 · playwright 3                                                                                  |
| 8. local verification command    | inspector "연결 → 이 테스트를 돌리는 명령" · `/engineering/<id>`     | `pnpm test` · `pnpm e2e`(포트 · 브라우저 필요), DevHub 자체는 `pnpm devhub:check`                                    |
| 9. GitHub permalink              | inspector 소스마다 "github.com에서 보기 @ 4940176"                   | `https://github.com/berrypjh/snapdone/blob/4940176…/apps/web/src/app/(auth)/auth/handoff/route.ts`                   |
| 10. 구현되지 않은 product target | `/` "제품 목표 — 아직 구현되지 않음" · 아키텍처 "문서에만 있는 구성" | 사진으로 할 일 끝내기 — 7단계 모두 문서에만 있음, 부재 검색으로 코드 없음 확인                                       |

## 38. 구현 상태 — 디자인 토큰 점검 · 라이트/다크

공용 UI의 `dist/AGENTS.md` 규칙(런타임 테마는 `--ds-*` CSS 변수와 `data-theme`, namespace를 동적으로 고르지 않는다)에 맞춰 점검했다.

### 토큰 사용 점검

- DevHub 코드의 `var(--ds-*)`는 모두 `styles.css`에 정의돼 있다. hex · `rgb()` · `white`/`black` 같은 원시 색은 없다. Tailwind 색 클래스는 전부 preset 키다(`--color-*: initial`로 기본 팔레트를 지웠다)
- **고친 것 — 선택 배경이 불투명했다.** `bg-background-selected`는 preset이 `rgb(var(--ds-background-selected-rgb) / 1)`로 만든다. 토큰 값은 8% 투명(`#10B98114`)인데 `-rgb` 변수에는 알파가 없어 선택 항목이 진한 초록 면이 됐다. 그 위 `text-light`는 3.03:1, `text-link`는 2.16:1이었다. 탐색기 · 상단 보기 · 필터는 `bg-(--ds-background-selected)`로, 그림의 선택 노드는 자기 면(`surface`/`default`) 위에 토큰을 `background-image`로 겹쳐 쓴다. 컴파일한 CSS에서 `background-color: var(--ds-background-selected)`를 확인했다
- 36절의 대비 수치는 투명한 선택 배경을 가정했었다. 이제 실제로 그렇다

### 라이트/다크

- `<html data-theme>`에 `light` · `dark`만 쓴다. 라이브러리가 `:root`를 라이트, `[data-theme="dark"]`를 다크로 정의하므로 `<html>`에 두면 `body` 배경까지 따라온다. `ThemeProvider`는 `<div data-theme>`로 감싸 `body` · 스크롤바가 따라오지 않고 첫 화면 전에 적용할 수 없어 쓰지 않았다
- `<head>`의 인라인 스크립트(`src/lib/theme.ts`)가 첫 paint 전에 저장된 선택, 없으면 OS 설정(`prefers-color-scheme`)을 적용한다. 저장소가 막혀도 OS 설정은 적용된다
- 상단 바 "화면 테마" — 공용 `SegmentControl`(라이트 · 다크, `aria-pressed`). 선택은 `localStorage`(`devhub-theme`)에 브라우저별로 남는다
- 라이브러리가 `color-scheme`을 두지 않아 `global.css`에서 라이트/다크에 맞춘다(네이티브 입력 · 스크롤바)
- 대비(토큰 값으로 계산): 라이트 가장 낮은 글자 쌍 4.57:1, 다크 4.72:1(선택 배경 위 `text-error`). 포커스 링은 라이트 3.19:1 이상, 다크 5.44:1 이상. 선택된 SegmentControl · 건너뛰기 링크 글자는 4.98:1(라이트) · 5.62:1(다크)

### 검증

- `nx lint` · `typecheck` · `test`(173) devhub 통과. `theme.spec.ts`: 저장된 선택 우선 · OS 설정 · 잘못된 저장값 · 저장소 차단, 스위치가 이름 있는 그룹의 두 버튼
- E2E `theme.spec.ts` 2개 추가(다크 OS에서 다크로 시작, 키보드로 전환 후 새로고침에도 유지) — 이 세션에서 실행하지 못했다
- 실제 브라우저 화면은 보지 못했다. 대비는 토큰 값 계산이다

## 39. 구현 상태 — 상세 정보 가독성 · 아이콘

상세 정보(우측)가 읽기 어렵다는 문제를 먼저 쟀다. 원인은 내용보다 반복이었다.

| `webview-auth-handoff` › `exchange` 단계           | 전   | 후                      |
| -------------------------------------------------- | ---- | ----------------------- |
| 링크                                               | 43   | 22 (목차 6 · 연결 포함) |
| 버튼                                               | 16   | 11 (파일당 복사 1)      |
| 보이는 글자 덩어리                                 | 166  | 95                      |
| "…에서 보기 · 최신 main에서 보기 · 경로 복사" 묶음 | 16번 | 0                       |

- 파일 단위로 묶었다(`src/lib/reference-groups.ts`). 소스는 프로젝트 → 파일 → symbol, 테스트는 프로젝트 → 파일 → 실행기 · 실행 조건 · 제목. 같은 파일을 여러 symbol · 테스트가 인용해도 파일 줄은 한 번이다. 프로젝트 제목 아래에서는 `apps/web/` 같은 앞부분을 반복하지 않는다
- 파일 이름이 링크다(`FileRow`) — 스냅샷 커밋 permalink, 커밋을 모르면 브랜치 링크와 "최신 main 기준" 글자. 옆에 복사 아이콘 버튼(공용 `IconButton`, 이름은 "경로 복사: <전체 경로>"). 폴더는 흐리게, symbol은 코드 칩으로
- "최신 main에서 보기"는 파일마다 두지 않고 `/source` 페이지(파일 하나)에만 둔다. 커밋 고정 링크가 정본이라는 22절 정책과 같다
- 섹션 제목에 요약을 붙였다 — 소스 "web 4 · api 2", 테스트 "vitest 3 · go-test 2 · playwright 3"
- 개요에서 비어 있는 사실(경유 · 증거 공백 · 부재 검색이 없을 때)은 보이지 않는다. 섹션이 비었을 때의 "없음 — 이유"는 그대로다
- 아이콘: 공용 UI에 아이콘 세트가 없어 `src/components/icon.tsx`에 선 아이콘을 SVG로 그렸다(새 dependency 없음). 그림의 보기 조절도 축소 · 확대를 −/+ 아이콘으로 바꿨다. "화면에 맞추기"와 같은 테두리 버튼(공용 `Button` `outlined`)에 아이콘만 넣고 이름은 `aria-label`로 "축소" · "확대" 그대로 둔다. 그리고 뜻이 아이콘만으로 전해지지 않는 "화면에 맞추기"는 글자로 뒀다. 모두 `aria-hidden`이고 `currentColor`라 라이트/다크를 따른다. 뜻은 옆 글자가 말한다 — 아이콘만으로 전하는 정보는 없다. 아이콘만 보이는 버튼은 복사 · 축소 · 확대 · 라이트/다크이고, 모두 접근 이름이 있다(복사는 상태 알림 `role="status"`도)
- 마우스 hover로 여는 방식은 쓰지 않았다(키보드 · 터치에서 열리지 않고, 안의 링크를 누르기 어렵다)

### 검증

- `nx lint` · `typecheck` · `test`(181) devhub 통과. `reference-groups.spec.ts`(파일 한 번 · symbol 모음 · 저장소 그룹 · 테스트 파일의 실행기와 조건 한 번), `inspector.spec.ts`(섹션마다 파일 링크 = 서로 다른 파일 수, 복사 버튼도 같은 수, 파일별 main 링크 없음, 요약 줄, 빈 사실 없음, 커밋을 모를 때 브랜치 링크와 글자)
- 기존 E2E의 소스 링크 선택자(`/에서 보기/`)는 새 접근 이름에도 맞는다. 브라우저 화면과 E2E는 이 세션에서 보지 못했다

## 40. 구현 상태 — 목록 보기 정돈

"그림 / 목록"의 목록도 39절과 같은 방식으로 정리했다.

### 시나리오 목록 (`flow/scenario-outline.tsx`)

- 항목마다 아이콘과 이름(`Term`, 공유 컴포넌트): 실행 위치 · 담당 · 소스 · API · 계약 · 테스트 · 다음 · 경유. "실행 위치 1"처럼 뜻 없는 개수는 뺐다
- 소스 · 테스트는 프로젝트 → 파일로 묶는다(39절의 `groupSources` · `groupTests`). 파일 이름은 DevHub 안의 `/source` 페이지 링크(`FileEntry`), 폴더는 흐리게, symbol · 계약은 칩. 테스트 실행기와 실행 조건은 파일당 한 번. GitHub 링크와 복사는 상세 정보에만 둔다
- 요약 줄은 뜻이 있을 때만: 소스는 프로젝트가 둘 이상일 때 "web 2 · api 1", 테스트는 실행기별 개수
- API · 계약 · 경유는 있을 때만 보인다. 소스 · 테스트는 비면 "없음"을 남긴다 — 제품 목표 단계에서는 그것이 정보다
- "다음"은 바로 아래 단계가 아닐 때(분기 · 되돌아감 · 건너뜀)만 보인다

WebView 로그인 핸드오프 기준: 링크 46 → 37, 전체 경로 반복 20 → 0, 빈 "없음" 줄 7 → 0. 보이는 글자 조각 수는 137 → 235로 늘었다 — 파일 이름 · 폴더 · 칩이 짧은 조각으로 나뉜 것이라 가독성 지표로 쓰지 않는다.

### 아키텍처 목록 (`architecture/architecture-outline.tsx`)

- 관계를 "나가는 관계 / 들어오는 관계"로 나눴다. 줄마다 자기 이름을 반복하지 않고, 상대 노드 이름이 링크다(필터 유지). 관계 종류 글자는 그림의 선 이름과 같다
- 종류(애플리케이션 · 제품 등)는 제목 오른쪽, 경로 · 요약은 그 아래

### 검증

- `nx lint` · `typecheck` · `test`(183) devhub 통과. 시나리오 목록: 단계마다 파일 링크 = 서로 다른 소스 · 테스트 파일 수(모든 시나리오), 제품 목표 단계는 소스 · 테스트 "없음" 둘만 있고 API · 계약이 없음, "다음"은 바로 아래가 아닐 때만. 아키텍처 목록: 제목 링크가 그림의 노드와 같음, 노드마다 링크 = 1 + 걸린 관계 수
- E2E 목록 테스트의 소스 링크 선택자를 새 접근 이름(`… — apps/…`)과 `/source` 링크로 바꿨다. 브라우저 화면과 E2E는 이 세션에서 보지 못했다

## 41. 고친 것 — 패널 끝에서 페이지 전체가 더 내려감

넓은 화면에서 패널을 끝까지 스크롤한 뒤 휠을 더 굴리면 페이지 전체가 한 번 더 내려갔다. 단계 · 시나리오처럼 상세 정보가 긴 페이지에서만 생겼다.

- 원인: 스크린리더 전용 글자(`VisuallyHidden` · `sr-only`)는 `position: absolute`다. 세 스크롤 패널(탐색기 · 본문 · 상세 정보)에 `position`이 없어서 이 글자의 기준 상자가 페이지가 됐고, 패널이 잘라 내지 못한 채 패널 아래쪽 위치에 놓여 문서 높이를 화면보다 길게 늘렸다. 상세 정보 속 숨은 글자는 개요 0개, 문서 2개, 단계 22개, 시나리오 52개였다 — 긴 페이지에서만 생긴 이유다
- 고침: 세 패널에 `relative`. 스크롤이 페이지로 넘어가는 것만 막는 `overscroll-behavior`는 쓰지 않았다 — 늘어난 문서 높이를 가릴 뿐이다
- 확인: E2E `desktop panes`(단계 · 시나리오 · 아키텍처 페이지에서 상세 정보를 끝까지 내리고 휠을 더 굴려도 문서 높이 = 화면 높이, `scrollY` 0). 이 세션에서는 실행하지 못했다

## 42. 고친 것 — 상단 보기를 누르면 "본문으로 건너뛰기"가 나타남

상단의 개요 · 시나리오 · 아키텍처 · 문서 · 엔지니어링을 누르면 좌측 상단에 "본문으로 건너뛰기"가 떴다. 의도한 동작이 아니었다.

- 원인: 이 링크들은 다른 레이아웃으로 간다. Next는 새로 그린 route의 첫 HTML 요소에 `focus()`를 거는데(`layout-router`, `sticky` · `fixed` · 크기 0인 요소만 건너뜀), 그 첫 요소가 페이지마다 그리던 셸 맨 앞의 SkipLink였다(1px `absolute`라 건너뛰지 않음). 공용 SkipLink는 `:focus`만으로도 드러나서 마우스 클릭 뒤에도 보였다. 같은 레이아웃 안의 이동(노드 · 목록, `scroll={false}`)에서는 생기지 않았다
- 고침: 건너뛰기 링크 둘을 셸에서 루트 레이아웃의 `<body>` 맨 앞으로 옮겼다. 이동 후 Next가 포커스하려는 첫 요소는 셸의 레이아웃 `div`(포커스 불가)라 아무것도 드러나지 않는다. 키보드는 이동 뒤 다음 Tab이 "본문으로 건너뛰기"다 — 처음 페이지를 열 때와 같다. 공용 SkipLink 스타일은 바꾸지 않았다
- 확인: `app/layout.spec.ts`(body가 건너뛰기 링크 둘로 시작, 셸에는 없음). E2E: 상단 보기 다섯 개를 마우스로 눌러도 건너뛰기 링크가 포커스되지 않고 1px로 숨음, 키보드로 이동한 뒤 Tab이 건너뛰기 링크. 검색 E2E의 "이동 뒤 포커스가 남는다"는 "이동 뒤 Tab이 건너뛰기 링크"로 바꿨다. 이 세션에서 E2E는 실행하지 못했다

## 43. 구현 상태 — 내비게이션 · 제목 · 테마 아이콘

아이콘은 알아보는 데 도움이 되는 곳에만 넣었다. 글자는 모두 남기고 아이콘은 장식(`aria-hidden`)이다.

| 위치                                                      | 아이콘                                                 | 이유                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 상단 보기(개요 · 시나리오 · 아키텍처 · 문서 · 엔지니어링) | 집 · 경로 · 층 · 문서 · 터미널                         | 자주 오가는 곳이라 모양으로 찾게                                                      |
| 탐색기의 개요 · 아키텍처 링크, 섹션 제목                  | 상단과 같은 모양(애플리케이션 창 · 라이브러리 책 추가) | 같은 곳은 어디서나 같은 모양                                                          |
| 제품명                                                    | 허브 모양 하나                                         | 좌측 상단 기준점                                                                      |
| 본문 제목 위 분류 줄                                      | 그 보기의 아이콘                                       | 지금 어느 보기인지. 제목(h1)에는 넣지 않았다                                          |
| 라이트 / 다크                                             | 해 · 달만 (글자 없음)                                  | 누구나 아는 모양. 버튼 이름은 `aria-label`로 "라이트" · "다크", 눌림은 `aria-pressed` |

- 넣지 않은 곳: 탐색기의 개별 항목(줄마다 같은 아이콘이 반복된다), 상세 정보 머리(아래 섹션에 이미 있다)
- 보기와 아이콘의 짝은 `src/components/view-icons.ts` 한 곳에 둔다
- 확인: `layout.spec.ts`(셸의 DevHub 아이콘이 모두 `aria-hidden`, 보기 링크 이름이 글자 그대로), `theme.spec.ts`(두 버튼이 아이콘만 보이고 이름은 "라이트" · "다크"). 화면은 이 세션에서 보지 못했다

## 44. 고친 것 — `domain/links.ts`가 바이너리 파일이 됨

- 증상: `file`이 `data`, git이 바이너리(`numstat` `- -`)로 판정했다. 커밋하면 리뷰에 내용 대신 "Binary files differ"만 보인다. 이름 일괄 변경(`grep -I`)에서도 빠져 주석에 "Atlas"가 남았다
- 원인: 경로의 제어 문자를 거르는 정규식 `CONTROL`에 NUL · 0x1F · 0x7F가 이스케이프가 아닌 날 바이트로 들어 있었다. 파일을 쓴 편집 도구가 `\u0000` 같은 이스케이프를 실제 문자로 풀어 저장했다(다시 쓸 때 같은 현상을 재현해 확인)
- 고침: 파일을 새로 쓰고 그 줄을 `/[\u0000-\u001f\u007f]/` 글자 그대로(순수 UTF-8 텍스트)로 바꿨다. 동작은 같다. 남은 "Atlas"도 고쳤다
- 재발 방지: `links.spec.ts`에 NUL · DEL이 든 경로 거부를 더했고, `devhub:check`(`freshness.spec`)가 `apps/devhub*`의 날 제어 문자를 잡는다 — 날 NUL이 든 임시 파일로 실패하는 것을 확인했다. 이번에 바꾼 파일 141개를 모두 검사해 다른 파일에는 없었다

## 45. 구현 상태 — 좌우 패널 구분선

- 탐색기: 위의 개요 · 아키텍처 묶음과 섹션(시나리오 · 애플리케이션 · 라이브러리 · 문서 · 엔지니어링) 사이에 선. 시나리오 안의 현재 동작 / 제품 목표는 한 섹션이라 선 없이 둔다
- 상세 정보: 머리(분류 · 제목 · 상태 · 목차)와 섹션(개요 · 소스 · 문서 · 테스트 · API · 연결) 사이에 선
- CSS 테두리(`divide-y` · `divide-stroke-light`, 토큰 `--ds-stroke-light`)로만 그린다. 섹션마다 제목이 있어 스크린리더가 읽는 구분자(`<hr>` · 공용 `Divider`)는 넣지 않았다. 컴파일한 CSS에서 규칙이 생성되는 것을 확인했다. 화면은 이 세션에서 보지 못했다

## 46. 구현 상태 — 엔지니어링 명령 화면

- 명령을 터미널 한 줄(`>_` 아이콘 · 테두리 상자)로 보이고, 바로 옆에 복사 아이콘 버튼(39절과 같은 `CopyButton` `icon`, 이름은 "명령 복사: <명령>", 복사하면 체크)을 둔다. 전에는 상자 아래 글자 버튼이었다
- 긴 명령은 줄바꿈해 가로로 넘치지 않는다
- 실행 조건은 경고 아이콘 + "실행 조건: 포트 필요 · 브라우저 필요", 조건이 없으면 확인 아이콘 + "조건 없음 — 어디서나 돈다". 색만으로 구분하지 않는다
- 확인: `entity-summary.spec.ts`(명령 줄 · 복사 버튼 이름 · 글자 버튼 없음 · 조건 두 경우). 화면은 이 세션에서 보지 못했다

## 47. 구현 상태 — 엔지니어링 재구성

명령 페이지는 세 줄짜리 카드 하나뿐이라 빈 공간이 많았고(설명 · 조건은 상세 정보가 한 번 더 보였다), 목록은 명령 21개를 설명 없이 한 줄씩 나열했다.

- 명령마다 용도 묶음(`CommandRef.group`)을 둔다 — 실행 5 · 검사 7 · 빌드 · 전체 검증 2 · API 작업 4 · 저장소 도구 3. 이름과 한 줄 설명은 `COMMAND_GROUP`(`lib/labels.ts`)
- 목록(`/engineering`): 묶음마다 카드. 명령은 "명령 줄(링크) · 복사 아이콘 · 설명 · 조건(있을 때만)"의 한 줄이라 페이지에 들어가지 않고 복사할 수 있다
- (48절에서 대체 — 명령마다 따로 있던 페이지는 없어졌다) 명령 페이지: 카드 1 "명령" — 명령 줄과 복사, **실제로 실행되는 내용**과 그 출처(`package.json › scripts.lint`, `apps/api/project.json › targets.migrate`), 설명, 조건. 카드 2 "같은 묶음 · …" — 같은 묶음의 다른 명령(지금 명령은 링크 대신 표시)
- 실제로 실행되는 내용은 정의 파일에서 빌드 시점에 읽는다(`lib/command-definition.ts`). 적혀 있지 않은 target(Nx 추론)은 지어내지 않고 보이지 않는다 — 지금 21개 모두 정의가 있다
- 부품은 `components/engineering/command.tsx` 한 곳
- 확인: `command-definition.spec.ts`(스크립트 · Nx target 본문, 전부 정의 있음, 추론 target은 null), `engineering/command.spec.ts`(묶음 빠짐 · 빈 묶음 없음, 목록의 묶음 제목 · 명령마다 복사, 명령 페이지의 실행 내용 · 출처 · 같은 묶음). 화면은 이 세션에서 보지 못했다

## 48. 구현 상태 — 엔지니어링은 묶음 단위로 탐색

탐색기의 엔지니어링 아래에 명령 21개가 하나씩 나열되던 것을 묶음 5개(실행 · 검사 · 빌드 · 전체 검증 · API 작업 · 저장소 도구)로 바꿨다. 명령은 묶음 안에 나열된다.

- 항목: `/engineering/<묶음>`(`run` · `check` · `build` · `api` · `workspace`). `COMMAND_GROUPS`(`lib/entities.ts`)가 catalog 명령을 `group`으로 모아 만든다. 명령마다 따로 있던 페이지는 없다
- 묶음 페이지: 묶음 설명과 명령 수, 그리고 명령마다 카드 — 명령 줄(제목)과 복사, 설명, 실제로 실행되는 내용과 출처, 조건. 카드마다 `#command-<id>` 위치가 있다
- 명령을 가리키는 링크는 모두 `commandHref`(`/engineering/<묶음>#command-<id>`) 하나로 간다: 검색 결과, 상세 정보의 "이 테스트를 돌리는 명령", 섹션 목록의 명령 줄
- 상세 정보: 묶음 단위(설명 · 명령 · 실행 조건 합집합 · 정의 파일)
- 섹션 목록(`/engineering`)은 묶음마다 명령 한 줄씩과 "<묶음> 열기" 링크
- 확인: `engineering/command.spec.ts`(모든 명령이 정확히 한 묶음, 탐색기 항목 = 묶음 5개, 모든 `commandHref`가 실제 묶음 페이지의 실제 카드를 가리킴, 묶음 페이지의 카드 · 복사 · 실행 내용 · 조건, 섹션 목록), `entity-summary.spec.ts`, `entities.spec.ts`. 화면은 이 세션에서 보지 못했다

## 49. 구현 상태 — 문서 화면

`it-tech-blog/apps/accessibility-zone`의 문서 화면(본문 + "이 페이지에서" 목차, 절 앵커, 코드 블록, 표)을 참고해 DevHub의 문서 페이지를 다시 만들었다. 전에는 문서 내용을 보여 주지 않았다(인용한 시나리오 목록과 GitHub 링크뿐). 참고 앱의 코드는 가져오지 않았다 — 그 앱은 TSX로 글을 쓰고 `lucide-react`를 쓰지만, DevHub는 저장소의 마크다운을 그대로 읽는다.

- 마크다운: `lib/markdown.ts`. 새 dependency 없이 문서가 실제로 쓰는 문법만 — 제목 · 문단 · 목록(중첩, 목록 안 코드) · 번호 목록 · 표(GFM, `\|` 이스케이프) · 코드 블록 · 인용 · 구분선, 인라인 코드 · 굵게 · 링크. HTML · 이미지는 없다(문서에 없다). 절 id는 GitHub 방식(`slug`)이라 문서끼리 이미 쓰는 `#…` 링크가 그대로 통한다
- 링크: `lib/doc-links.ts`. 카탈로그 문서는 DevHub 문서 페이지(`/documents/<id>#절`), 다른 저장소 파일은 스냅샷 고정 링크(새 창), 외부 주소는 새 창 + 아이콘 + "(새 창)", 같은 문서 절은 `#`
- 화면(`components/doc`): 읽기 폭(46rem) 본문(`.devhub-prose`, 토큰만), 절 제목(h2 위 구분선, 마우스를 올리거나 포커스하면 `#` 링크), 코드 블록(언어 라벨 + 복사 아이콘), 표(공용 `Table` · `TableScroll`, 캡션은 가장 가까운 절 제목), 인용(강조 상자). 페이지 제목은 문서의 `# 제목`, 그 아래 경로와 GitHub 링크, 끝에 "이 문서를 인용한 시나리오"
- "이 페이지에서": (51절에서 본문 안으로 옮김) 상세 정보 맨 위(DevHub는 오른쪽 칸이 상세 정보라 목차를 거기 둔다). 스크롤에 따라 읽는 절을 `aria-current="location"`으로 표시
- id 충돌을 고쳤다: `devhub.md`의 "inspector" 절 id가 상세 정보 aside의 id와 같아 "상세 정보로 건너뛰기"가 본문 절로 갔다. 앱 id를 `devhub-main` · `devhub-inspector`로 바꿨다(문서 제목은 자유 글이라 앱 쪽에 접두어)
- 확인: `markdown.spec.ts`(문법별, 카탈로그 문서 전부 해석 시 기호가 글자로 새지 않음 · 절 id 유일), `doc-links.spec.ts`, `doc-content.spec.ts`(문서 전부 렌더 — 기호 누출 없음, 절마다 id와 `#` 링크, 목차 = 절 제목, 표마다 캡션, 코드 블록마다 복사, 문서 간 링크가 DevHub 안에 머묾), `document-page.spec.ts`(문서 페이지 전체에서 id가 한 번씩 — 옛 id로 되돌리면 `devhub` 페이지가 실패하는 것을 확인), `devhub:check`의 "document links"(문서 간 링크 · 절 앵커 · 파일이 실제로 있음). 화면은 이 세션에서 보지 못했다

## 50. 구현 상태 — 반응형 칸 폭과 탐색기 서랍

- 칸 폭: `lg`에서 `15rem | 1fr | 20rem`, `xl`부터 `18rem | 1fr | 24rem`. 전에는 `lg`부터 18rem · 24rem 고정이라 1024px에서 본문이 352px로 폰(390px)보다 좁았다. 이제 1024px에서 464px, 1280px에서 608px
- 본문 여백: `sm` 미만 16px(`p-4`), 이상 24px(`p-6`). 320px에서 여백이 겹쳐 글 폭이 216px까지 줄던 것을 줄였다
- 탐색기(`lg` 미만): 본문 위에 펼쳐지던 접기 목록(`NarrowDisclosure`)을 왼쪽에서 들어오는 서랍으로 바꿨다(`explorer-drawer.tsx`). 여는 버튼은 상단 바 맨 앞 메뉴 아이콘(공용 `IconButton`, 이름 "탐색기", `aria-expanded` · `aria-controls`), 서랍 안에 "탐색기 닫기" 아이콘. 뒤는 `neutral-ne900` 50%로 어둡게, 서랍은 `shadow-4`
- 공용 UI에 drawer · dialog가 없어(`berry-react-ui find drawer|dialog|modal|sheet|overlay` 결과 없음) 직접 만들었다. 포커스를 가두는 모달이 아니라 펼침(disclosure)이다 — Escape · 닫기 버튼 · 어두운 배경 · 포커스가 서랍 밖으로 나가면 닫히고, 경로가 바뀌면(항목 선택) 닫힌다. 열 때 현재 항목(없으면 첫 링크)으로, Escape · 닫기로 닫을 때 버튼으로 포커스를 돌린다. 닫힌 서랍은 `invisible`이라 Tab에 걸리지 않는다. 움직임 줄이기 설정이면 전환 없음
- `lg` 이상은 전과 같은 왼쪽 칸이고 버튼은 없다
- 상단 바(`lg` 미만): 전에는 제품명 · 저장소 · 스냅샷 · 검색 · 보기 5개 · 테마가 줄바꿈되며 여러 줄을 차지했고 스크롤하면 사라졌다. 이제 한 줄을 화면 위에 고정한다(`sticky`) — 메뉴(탐색기 서랍) · 제품명(좁으면 말줄임) · 검색 아이콘 · 테마. 보기 nav는 숨긴다: 탐색기 서랍에 개요 · 아키텍처 · 시나리오 · 문서 · 엔지니어링이 모두 있다. 저장소 · 스냅샷 줄도 숨긴다: 개요 페이지에 같은 줄이 있다. 검색은 아이콘이나 ⌘K로 둘째 줄(전체 폭)에 열리고, 결과를 고르면 닫힌다. 고정 바가 앵커를 가리지 않게 `scroll-padding-top`(3.75rem)을 준다. `lg` 이상은 전과 같다
  - 확인: E2E `shell.spec.ts` 세 건(고정된 한 줄 · 보기 nav 숨김, 검색 열기 · ⌘K · 결과 선택 후 닫힘, 320px까지 가로 넘침 없음)과 좁은 화면 이동 테스트를 서랍 경유로 고침. 실행하지 못했다
- 상단 바(`lg` 이상): 줄바꿈(`flex-wrap`)이 남아 있어 1530px에서 테마 버튼만 둘째 줄로 내려갔다 — 제품명 · 저장소/스냅샷 · 검색 `w-96` · 보기 5개 · 테마 · 간격의 합(약 1,680px)이 화면보다 넓었다. 이제 한 줄에 고정한다(`lg:flex-nowrap`): 저장소/스냅샷 줄은 `xl`부터 보이고 모자라면 말줄임으로 먼저 줄어든다(`shrink-[4]` · `truncate`), 검색은 18rem을 기준으로 10rem~24rem 사이에서 늘고 줄며, 보기 · 테마는 줄지 않는다. 확인: E2E "stays on one row from 1024px up…"(1024 · 1280 · 1530 · 1920px, 실행 못 함)
- 좁은 화면에서 상단 "아키텍처"나 탐색기 항목으로 가면 화면이 상세 정보까지 내려가 있었다
  - 원인: Next(16.1.7)는 이동 뒤 새 **page segment**의 첫 요소로 스크롤하고(`router-reducer/ppr-navigations.js`가 leaf segment만 모은다) 그 요소에 `focus()`를 건다(`layout-router.js` `handlePotentialScroll`). 캔버스를 유지하는 두 레이아웃(`[section]/[id]` · `architecture`)은 page가 상세 정보 aside였다. `lg` 미만에서는 aside가 본문 아래라 그 위치로 스크롤됐고, 넓은 화면에서도 aside(`tabIndex=-1`)에 포커스가 가서 다음 Tab이 "본문으로 건너뛰기"가 아니었다. 42절의 "이동 후 포커스는 셸 div"는 page가 셸 전체를 그리는 route에만 맞았다
  - 고침: 상세 정보를 parallel route 슬롯 `@inspector`로 옮기고, page(`children`)는 본문 머리(`WorkspaceHeader`)만 그린다. 레이아웃은 `WorkspaceFrame` 안에 page를 맨 앞에 둔다. 두 슬롯 모두 모든 URL에 대응하고, Next 규칙대로 `default.tsx`(404)를 둔다. `useSelectedLayoutSegment(s)`는 `children` 기준이라 page 쪽 경로(`steps/[stepId]` · `[nodeId]`)를 그대로 유지했다
  - 확인: `route-segments.spec.ts`(네 page의 첫 요소가 `header` — 옛 page(aside)로 돌리면 실패하는 것을 확인), E2E `shell.spec.ts` 두 건(넓은 화면: 캔버스 보기로 이동 뒤 상세 정보에 포커스 없음 · 다음 Tab이 건너뛰기 / 좁은 화면: 이동 뒤 `scrollY` 0 · 제목이 화면 안). E2E와 `nx build devhub`는 이 세션에서 실행하지 못했다
- 넘김: 좁은 화면에서는 상세 정보가 본문 아래라, 다음 단계 · 구성 요소로 가려면 그림까지 다시 올라가야 했다. 상세 정보 첫 줄(종류 글자) 오른쪽 끝에 ‹ › 화살표 한 쌍을 둔다 — 단계는 `nav "단계 이동"`(`scenario.steps` 순서 = 흐름 번호), 구성 요소는 `nav "구성 요소 이동"`(아키텍처 목록 순서). 글자 버튼 · 글자 링크는 상세 정보 안에서 이질적이어서, 메일 · 이슈 뷰어처럼 제목 줄 끝의 아이콘 화살표로 바꿨다. 공용 `IconButton`은 `component`를 받지 않아 라우터 링크가 될 수 없으므로(`href`만 주면 전체 새로고침), `component`를 받는 공용 `Button`(sm · text · secondary, 아이콘만)에 `Link`를 얹었다. 서버 컴포넌트는 함수(`Link`)를 client 컴포넌트에 넘길 수 없어 `components/pager.tsx`는 `'use client'`다. 이웃이 없는 쪽은 같은 모양의 비활성 버튼("이전 단계 없음")으로 자리를 지킨다. 접근 이름은 "다음 단계: <의도>", 마우스를 올리면 `title`로 "다음 단계"
  - 링크는 `#devhub-inspector`를 붙여(`components/workspace.tsx` `detailsHref`), 이동 뒤 Next가 새 상세 정보로 스크롤하고 포커스한다 — 넘김 버튼 자리에 머문다
  - 구성 요소 넘김은 URL의 종류 필터(`?kind=`) 안에서 돌고 링크에 필터를 유지한다(`architecture/node-pager.tsx`, client — 정적 fallback은 전체 순서). 필터 밖 노드(관계로 들어온 경우)는 전체 순서로 넘긴다
  - 관계: 구성 요소 상세 정보의 "관계" 줄(`web → api · HTTP` 등)이 상대 노드로 가는 링크다. 같은 `detailsHref`라 구조를 따라 읽어도 상세 정보에 머문다
  - 순서 계산은 `lib/pager.ts` `pagerOf` 하나다
  - 확인: `pager.spec.ts`, `architecture/node-pager.spec.ts`(목록 순서와 같음, 필터 안 넘김 · 필터 유지, 필터 밖은 전체, 관계 링크), `inspector.spec.ts` "step pager"(화살표의 주소 · 접근 이름, 이웃 없는 쪽은 비활성), E2E `shell.spec.ts` 두 건(실행 못 함)
- 시나리오 목록 보기: 단계마다 시스템 동작 · 실행 위치 · 담당 · 소스 · API · 계약 · 테스트 · 다음 · 경유를 모두 펼쳐, 단계를 고르면 나오는 상세 정보와 내용이 같았다(21절 "목록은 단계마다 … 테스트 · 다음"을 바꾼다). 목록은 요약, 상세 정보는 근거로 나눴다(목록-상세). 목록은 흐름 그림이 보여 주는 만큼만 글로 — 번호 · 의도(단계 링크) · 상태 · "실행 위치 · 담당 · API n · 계약 n · 테스트 n" 한 줄, 바로 아래 단계가 아닌 다음 단계가 있으면 "다음 n단계". 고른 단계는 목록에서도 `aria-current` · 배경 · "· 선택됨" 글자로 표시한다(`useSelectedLayoutSegments`, client). 소스 · API · 계약 · 테스트 파일 · 경유는 상세 정보에만 있다. 목록에서만 쓰던 `FileEntry`는 지웠다. 확인: `scenario-outline.spec.ts`(모든 단계 · 요약 한 줄 · 파일 링크와 `dl` 없음 · 다음 표시 규칙 · 선택 표시), E2E `canvas.spec.ts` "shows the scenario as step summaries…"(실행 못 함)
- 문서 · 소스 페이지의 "경로 복사"(`SourceActions`)도 글자 버튼에서 경로 옆 복사 아이콘으로 바꿔 `FileRow`와 맞췄다. 접근 이름은 그대로 "경로 복사: <전체 경로>"
- 확인: 단위 테스트(당시 258개) · lint · typecheck 통과. E2E `shell.spec.ts` "opens the explorer as a drawer…"(왼쪽 끝에서 열림, 현재 항목 포커스, Escape로 닫히고 버튼으로 복귀, 닫기 버튼, 항목 선택 시 닫힘)를 더했지만 이 세션에서는 실행하지 못했다. 화면도 보지 못했다

## 51. 구현 상태 — "이 페이지에서"를 본문 안으로

상세 정보 맨 위에 두었던 목차는 좁은 화면에서 본문 아래(상세 정보는 본문 뒤에 쌓인다)로 밀려 쓰기 불편했다. 참고 문서 앱(`accessibility-zone`의 `DocLayout`)처럼 목차를 본문 영역 안에 둔다(`components/doc/document-layout.tsx`).

- 본문 영역이 넓으면(컨테이너 48rem 이상) 본문 오른쪽에 목차 열. 스크롤을 따라오고(`sticky`), 길면 그 안에서 스크롤된다
- 좁으면 본문 맨 위에 접힌 "이 페이지에서"(`<details>`, 기본 접힘, 절 수 표시). 참고 앱은 좁을 때 목차를 숨기지만, 그러면 좁은 화면에서 절로 갈 방법이 없어 접어 둔다
- 기준은 화면 폭이 아니라 본문 영역 폭(컨테이너 쿼리 `@container` · `@3xl`)이다. 좌우 칸이 화면 폭마다 다른 몫을 가져가기 때문이다
- 상세 정보의 목차 섹션과 `Inspection.outline`은 뺐다
- 문서 페이지는 가운데 열에 둔다(`DOCUMENT_COLUMN`, 최대 61rem = 본문 46rem + 목차 열). 제목(`WorkspaceHeader`의 `className`) · 경로와 링크 · 본문 · 인용한 시나리오가 같은 열이라 왼쪽 끝이 맞는다. 참고 앱의 `mx-auto` · 최대 폭 방식이다
- 확인: `doc-content.spec.ts`(본문 안에 접힌 목차와 옆 열 목차가 있고 둘 다 절 제목과 같은 항목, 접힌 목차가 본문보다 앞, 상세 정보에는 없음), E2E `document.spec.ts`(1920px에서 옆 열이 보이고 스크롤해도 보임 · 문서 열의 좌우 여백이 같음, 390px에서 접힌 목차를 키보드로 펼쳐 절로 이동), `doc-content.spec.ts`의 "document page column"(제목과 본문 묶음이 같은 열). E2E와 화면은 이 세션에서 보지 못했다

## 52. 구현 상태 — 사이트 좌우 여백 · 그림 크게 보기

참고 문서 앱(`accessibility-zone`)을 다시 보고 두 가지를 맞췄다.

- 사이트 좌우 여백: 그 앱은 셸 전체를 최대 1440px로 묶어 가운데 둔다(`max-w-[1440px] mx-auto`). DevHub는 옆 칸이 둘(18rem + 24rem)이라 같은 값이면 본문이 768px로 줄어, 그 앱이 본문에 남기는 폭(약 1160px)을 기준으로 셸을 최대 115rem(1840px)으로 묶고 가운데 둔다. 그보다 넓은 화면에서만 셸 좌우에 옅은 선(`min-[115rem]:border-x`)
- 본문 안쪽 좌우 여백: 그 앱처럼 `sm`부터 32px(`sm:px-8`, 전에는 24px). 폰(16px)과 위아래 여백은 50절 그대로
- 그림 크게 보기: 시나리오 흐름 · 아키텍처 그림의 보기 조절에 "크게 보기"(확대 모서리 아이콘, 공용 `Button` outlined, 이름 "크게 보기"). 누르면 같은 그림을 창 전체를 채우는 모달 `<dialog>`로 연다 — Escape로 닫힘, 뒤는 비활성, 닫으면 버튼으로 포커스 복귀가 브라우저 기본 동작이다. 머리에 제목과 "닫기". 창이 열린 뒤에 그림을 그려 창 크기에 맞춰 맞추기(fit)를 한다. 안에서 단계 · 노드를 고르면 창은 열린 채 선택만 바뀌고, "상세 정보로 이동" 같은 페이지 안 링크는 창을 먼저 닫고 이동한다
- 전체 화면 API(`requestFullscreen`)는 쓰지 않았다: iPhone Safari가 요소 전체 화면을 지원하지 않는다. `<dialog>`는 모든 브라우저에서 창 크기만큼 연다. 공용 UI에 dialog가 없어 브라우저 기본을 쓴다(새 dependency 없음)
- 고친 것 — "크게 보기"가 열리자마자 닫혔다(`pnpm dev:devhub`에서). App Router는 `next.config`에 `reactStrictMode`가 없으면 StrictMode를 켜고(`next/dist/build/define-env.js`), 개발 모드에서 effect를 실행 → 정리 → 재실행한다. 정리에서 부른 `dialog.close()`가 `close` 이벤트를 큐에 넣고(HTML 사양상 비동기), 그 이벤트가 다시 연 뒤에 도착해 `onClose`로 창을 내렸다. 정리에서 닫지 않고, 이미 열려 있으면 다시 열지 않는다(`openModal`). 창이 페이지에서 빠지면 브라우저가 모달 층에서 걷어 낸다. 확인: `canvas-viewport.spec.ts` "openModal"(두 번 불러도 `showModal` 한 번). E2E `canvas-expand.spec.ts`가 개발 서버에서 돌았다면 잡았을 문제다 — 이 세션에서는 실행하지 못했다
- 화살표 표식 id를 그림마다 따로(`useId`) 둔다. 크게 보기로 같은 그림이 두 번 그려질 때 `canvas-arrow` id가 겹쳤다
- 확인: `canvas/canvas-viewport.spec.ts`(크게 보기 버튼 · 처음엔 dialog 없음, 두 그림의 표식 id가 다름), E2E `canvas-expand.spec.ts`(키보드로 열어 더 큰 그림, Escape로 닫고 버튼 포커스, 닫기 버튼, 안에서 단계 선택 후에도 열림, 2560px에서 셸 1840px · 가운데). `layout.spec.ts`의 셸 첫 요소 검사를 클래스 순서와 상관없게 고쳤다. E2E와 화면은 이 세션에서 보지 못했다

## 53. 구현 상태 — 그림 조작 도구 정돈

- 그림 위의 긴 안내 문장을 걷어 냈다. 위 줄에는 요약(개수 · 선택)과 오른쪽 "도움말" 버튼만 둔다. 도움말은 누를 때 펼치는 패널이고 "조작"(`kbd` 키 목록)과 "범례"(실제 선 · 상자 모양 견본)로 나뉜다. 닫혀 있어도 그림의 `aria-describedby`에 남아 스크린 리더는 그대로 읽는다
- 범례 견본은 그림이 쓰는 dash 값을 그대로 쓴다. 시나리오는 코드 있는/없는 단계 상자와 앞 단계로 돌아가는 점선, 아키텍처는 `DASH` · `AUTH_REDIRECT_DASH`에서 만든다. 선 모양을 바꾸면 범례도 따라 바뀐다
- 확대 도구는 지도 앱처럼 그림 오른쪽 아래에 떠 있는 한 묶음("보기 조절")이다: 축소 · 배율 · 확대 | 화면에 맞추기 | 크게 보기. 모두 아이콘 버튼이고 `aria-label`과 `title`(툴팁)을 가진다. 페이지 순서상 그림의 항목보다 앞에 둬 키보드가 먼저 닿는다. "크게 보기" 창 안에서는 크게 보기 버튼이 없다
- 확인: `canvas/canvas-viewport.spec.ts`(도움말이 처음엔 `hidden` · `aria-expanded="false"`, 그림 설명에 포함, 범례 견본의 dash, 도구 묶음의 네 버튼과 100%), `flow/scenario-flow.spec.ts`(네 도구의 이름). 기존 E2E(`canvas.spec.ts` "보기 조절" 그룹 · 버튼 이름 · `status`)와 호환된다. E2E와 화면은 이 세션에서 보지 못했다

## 54. 구현 상태 — 셸과 바깥 여백의 배경 구분

- 참고 문서 앱처럼 셸 전체(상단 바 · 탐색기 · 작업 영역 · 상세 정보)를 `background-surface`로, 셸 밖 여백(`body`)을 `background-default`로 둔다. 두 토큰은 한 단계 차이(라이트 `#FFFFFF` / `#F2F4F7`, 다크 `#1D2939` / `#101828`)라 넓은 화면에서 본문 영역이 미세하게 떠 보인다
- 전에는 셸에 배경이 없어 작업 영역 · 탐색기가 바깥과 같은 회색이었고, 상단 바 · 상세 정보만 흰색이었다
- 따라 바꾼 것: 탐색기 항목 hover를 `background-default`로(상단 바 탭과 같은 방식, surface 위에서 보이도록), 아직 그리지 않은 관계 그림 자리를 캔버스와 같은 `background-default`로. 코드 블록 · 명령 칸 · 캔버스 같은 안쪽 영역은 원래 `background-default`라 surface 위에서 구분된다
- 확인: lint · typecheck · test. 화면은 이 세션에서 보지 못했다

## 55. 구현 상태 — 아키텍처 화면 정돈 · 하단 여백

- 그림과 목록을 시나리오 화면처럼 "구성 요소와 관계" 섹션 카드 안에 둔다. 종류 필터와 그림/목록 전환을 한 줄에 놓는다(`ViewSwitch`의 `tools`: 필터 왼쪽, 전환 오른쪽). 개수는 필터가 걸린 값을 보여 주는 그림 요약에만 둔다 — 섹션 제목에 두면 필터를 걸었을 때 두 숫자가 어긋난다
- 그림의 구성 요소에 종류 아이콘을 붙였다(애플리케이션 · 라이브러리는 탐색 아이콘, 외부는 지구본 `globe`, `NODE_KIND_ICON`). 저장소 밖 시스템은 점선 테두리로 그리고 범례에 "저장소 안 프로젝트 / 저장소 밖 시스템" 상자 견본을 더했다. 목록 보기의 종류 표시에도 같은 아이콘을 쓴다
- 관계 한 줄은 "A → B" 뒤에 관계 이름을 태그(`background-default`, `text-light` 약 7:1)로 붙인다. 경계는 구분선으로 나누고, 경계를 넘는 관계는 왼쪽 선으로 들여 그 경계의 근거로 읽히게 했다. 관계 목록 제목의 개수는 캡션으로 낮췄다
- "문서에만 있는 구성"은 시나리오마다 제목(시나리오 링크 · 단계 수)을 달고 단계를 그 아래 들여 둔다
- 모든 화면의 아래쪽 여백: 작업 영역 `pb-12`(3rem) · `sm:pb-16`(4rem), 상세 정보 · 탐색기 `pb-12`. 참고 문서 앱은 본문 위아래를 2rem, `lg`부터 3rem 띄운다. `<main>`은 `WorkspaceFrame` 하나뿐이라 모든 화면에 적용된다
- 확인: `architecture-map.spec.ts`(외부만 점선, 범례 상자), `architecture-sections.spec.ts`(관계 태그, 목표 시나리오 제목 링크). 기존 E2E의 필터 · 목록 · 선택 흐름은 이름과 역할을 바꾸지 않았다. E2E와 화면은 이 세션에서 보지 못했다

## 56. 구현 상태 — 온보딩 진행 · 사진 처리 카탈로그

온보딩 진행을 서버로 옮기고 web 온보딩 · 첫 사진 처리를 더한 뒤, 새로 생긴 구성 · 호출 · 계약 · 테스트를 catalog에 넣었다.

- **node** — 라이브러리 `onboarding`(`libs/onboarding`)과 외부 `image-model`(이미지 분류 모델: Claude API 또는 OpenAI 호환 서버, 근거 `ClaudeClassifier.Classify` · `OpenAIClassifier.Classify` · `loadProcessing`). 그림 자리는 `onboarding` [0, 4] · `image-model` [3, 3]
- **관계** — Nx 의존 3(`web` · `mobile` → `onboarding`, `onboarding` → `auth-contracts`)과 실행 중 호출 `api-calls-image-model`(API 경계에 넣었다). `web-calls-api` · `mobile-calls-api`에 `GET`/`PUT /v1/onboarding` · `POST /v1/processing-jobs` · `GET /v1/processing-jobs/{jobId}`를 더했고, `api-persists-to-postgres`의 근거에 온보딩 · 처리 저장소를 더했다
- **계약** — `OnboardingStep` · `LoginResponse`(auth-contracts), `Purpose` · `SavedProgress` · `ProgressUpdate` · `ProcessingJob`(onboarding)
- **시나리오** — 새 `onboarding-first-photo`(partial): 목적 선택(앱 · web) → 진행 저장 → 사진 고르기(앱 · web) → 업로드 → 분류 → 결과 기다리기(앱 · web) → 결과 보기(not-found, 결과 필드를 그리는 화면 부재 검색). `onboarding-intro`의 소개 단계가 `via`로 이 시나리오를 가리킨다. `browser-google-login`의 callback 단계에 로그 레벨(취소 Info · state 불일치 Warn · 장애 Error) 테스트를 더했다
- **validator** — 호출 근거 검사가 경로 변수를 이해한다. `{jobId}` 같은 segment는 호출 코드의 template placeholder(`${...}`)와 맞춘다. 전에는 경로를 글자 그대로 찾아 변수 있는 route를 호출 관계에 넣을 수 없었다
- 라이브러리가 셋이 되어 `devhub-e2e`의 `?kind=library` 목록 기대 개수를 3으로 고쳤다
- 확인: `nx test devhub`는 `docs/temp/temp.md`가 문서 목록에 없다는 1건만 실패한다(작업 전부터 있던 실패 — 임시 문서라 catalog에 넣지 않는다). E2E는 이 세션에서 돌리지 못했다

## 57. 고친 것 — 처음 실행한 E2E 실패 6건

42 · 50~55절에서 더했지만 실행하지 못했던 E2E를 사용자 터미널에서 처음 돌렸다. 36개 중 6개가 `--workers=1`에서도 같은 자리에서 실패했다. 임시 진단 spec으로 브라우저 상태를 찍어 원인을 확인한 뒤 고쳤다.

- **"크게 보기"를 Tab 40번 안에 못 찾음** — 페이지 맨 위부터 세면 버튼까지 59칸이다(상단 10 · 탐색기 43 · 그림 도구 6). 테스트가 틀렸다. 다른 테스트처럼 "본문으로 건너뛰기"로 본문에 들어간 뒤 센다(`enterMain`을 `support/keyboard.ts`로 옮김)
- **이동 뒤 첫 Tab이 건너뛰기 링크가 아님(3건)** — 다른 레이아웃으로 가면 셸이 통째로 바뀌어 포커스가 `body`에 남고, 키보드 시작점은 건너뛰기 링크 **뒤**에 놓였다. 다음 Tab은 개발 모드에서는 Next 개발 도구, 그 뒤는 검색창이었다. 42절의 "이동 후 다음 Tab은 건너뛰기 링크"는 성립하지 않았다. 루트 레이아웃 맨 앞에 포커스 자리(`NavigationFocus`, `tabIndex=-1`)를 두고, 이동 뒤 포커스가 `body`에 있을 때만 그 자리에 둔다. 그림에서 노드를 고르는 이동처럼 포커스가 남는 경우는 건드리지 않는다
- **1280px에서 가로 넘침** — 셸 grid에 열 정의가 없어 암묵적 `auto` 열이 상단 바의 min-content(1355px)만큼 넓어졌다. `xl`부터 보이는 저장소 줄은 `truncate`라도 min-content를 글자 전체 길이로 센다. 열을 `grid-cols-1`(`minmax(0, 1fr)`)로 정했다
- **서랍을 열어도 현재 항목에 포커스가 가지 않음** — 원인이 둘이었다. 열리는 순간 서랍은 아직 `visibility: hidden`(0.2초 전환 중)이라 `focus()`가 먹히지 않았다. 또 선택자 `'[aria-current] , a'`는 문서 순서상 먼저 나오는 "개요"를 골랐다. 열 때는 `visibility`를 전환하지 않고, 닫을 때만 밀려 나간 뒤 숨긴다. 현재 항목이 없을 때만 첫 링크를 고른다. 같은 진단에서 `motion-reduce:transition-none`이 `max-lg:transition-[…]`에 밀려 적용되지 않던 것도 확인해 `max-lg:motion-reduce:transition-none`으로 고쳤다
- 확인: 사용자 터미널(`--workers=1`)에서 네 가지를 모두 고친 뒤 전체 `nx e2e devhub-e2e`가 통과했다(E2E 36개. 원인을 찍던 임시 진단 spec은 확인 뒤 지웠다). `layout.spec.ts`는 `body`가 포커스 자리 다음에 건너뛰기 링크 둘로 시작하는지 본다

## 58. 구현 상태 — 기록 섹션

설계 판단 · 고친 문제 · 구현 결과를 이 문서에 절 번호로 쌓는 대신 `docs/records/`로 분리하고, DevHub에 `기록` 섹션(`/records`)을 더했다.

- 목록은 날짜 · 종류(설계 결정 · 고친 것 · 구현) · 제목 · 한 줄 요약을 최신순으로 보인다. 본문은 문서와 같은 렌더러로 읽는다 — 목차 · 표 · 코드 블록 · 소스 링크가 같다
- curated 데이터는 `apps/devhub/src/data/records.ts`(`RecordRef`), 본문은 `docs/records/<날짜>-<id>.md`. 등록하지 않으면 `docs/` 전수 확인이 실패한다
- 기록 한 건의 본문은 `상황` · `판단`(또는 고친 것이면 `원인` · `고침`) · `반영` · `검증`으로 쓴다. 설계 문서가 "지금 무엇이 맞는지"를 적는다면 기록은 "언제 · 무엇을 · 왜 그렇게 정했는지"를 적고, 나중에 고쳐 쓰지 않는다 — 판단이 뒤집히면 새 기록을 쓰고 이전 기록에서 링크한다
- 기록은 **자기가 다루는 것을 지목한다** — 파일(`sources`) · 그 규칙을 담은 문서(`docs`) · 그것을 지키는 테스트(`tests`). 상세 정보의 소스 · 문서 · 테스트 섹션이 시나리오와 같은 모양으로 보여 주므로, 본문을 읽지 않아도 어느 코드 · 어느 문서 이야기인지 알 수 있다
- 지목한 것은 모두 검사한다 — 경로와 symbol은 저장소와 대조하고, 문서 id · heading과 테스트 id는 카탈로그에 있는 것이어야 한다. 테스트를 지목하지 않은 기록은 빈 칸 대신 "확인 방법은 본문의 검증 절에 있다"는 이유를 보인다
- 문서와 기록이 서로를 링크하면 DevHub 안에서 열린다(링크 해석이 두 섹션을 함께 본다). 전역 검색에 `기록` 종류가 붙었다
- 검사: `docs/` 아래 마크다운 전수 확인이 문서와 기록을 함께 보고, 기록은 파일 이름이 `<date>-<id>.md`와 같은지 · 날짜가 실재하는지 · 요약이 한 줄인지 · 첫 줄이 `# 제목`인지 · 본문 링크가 모두 열리는지 본다
- 첫 기록 8건은 설계 결정 넷(제품 구성 · web의 API 호출 경로 · WebView 로그인 핸드오프 · 저장소 링크 템플릿)과 고친 것 넷(Expo Go의 React 두 벌 · 포맷 게이트 범위 · Nx의 `.env` 로딩 · 온보딩 소개 화면 접근성)이다. web · mobile · api · 도구를 고루 덮는다
- **이 절 이후의 기록은 이 문서가 아니라 `docs/records/`에 쓴다.** 28~57절은 옮기지 않았다 — 옮기려면 절마다 날짜 · 종류를 정하고 문서 안 링크를 함께 고쳐야 한다
- 확인: `devhub:typecheck` · `devhub:lint` 통과, `nx test devhub`는 56절과 같은 `docs/temp/temp.md` 1건만 실패한다(Vitest 305개 중 304개 통과). 화면과 E2E는 이 세션에서 보지 못했다

## 59. 구현 상태 — 근거 파일을 에디터에서 바로 열기

경로를 복사해 에디터에서 다시 찾는 한 단계를 없앴다. 22.2에서 제외했던 로컬 에디터 deep link를 **개발 서버 한정**으로 넣은 것이다. 제외 사유 둘을 각각 없앤 뒤에 넣은 것이라 22.2의 판단은 그대로다.

- 링크를 만드는 `editorHref`는 `NODE_ENV`가 `development`일 때만 값을 낸다. 빌드된 페이지에는 링크 요소 자체가 없어 개인 절대 경로가 산출물에 들어가지 않는다
- 어느 에디터로 열지는 `DEVHUB_EDITOR`로 고른다 — 이름(`antigravity` · `cursor` · `vscode` · `windsurf` · `zed` · `idea` · `webstorm`) 또는 `{path}`가 들어간 URL 형식. 기본값은 VS Code이고, 설정은 devhub의 로컬 env 파일에 둔다. 모르는 이름이면 기본값으로 돌아간다
- 경로는 저장소 상대 경로만 받는다(`isCanonicalPath`). 저장소 밖 경로 · `..`는 링크가 되지 않는다
- 자리는 경로가 이미 보이는 두 곳이고 **모양은 한 가지다.** 경로 줄 오른쪽에 그 경로에 딸린 행동을 아이콘 버튼으로 모은다 — 에디터, 그다음 복사. 상세 정보의 파일 줄(`FileRow`)과 문서 · 기록 · 소스 화면 머리(`SourceActions`)가 같은 묶음을 쓴다
- 아이콘만 있으므로 이름표(`에디터에서 열기: <경로>`)와 툴팁을 단다. 복사와 같은 공용 `IconButton`이고 `href`가 있으면 링크로 렌더된다
- 경로 줄 아래는 **원격 보기 전용**이다 — "github에서 보기 @ <sha> · 최신 main에서 보기"를 가운뎃점으로 묶는다. 가운뎃점은 장식이라 읽기 순서에서 빠지고, 링크가 하나뿐이면 구분자도 없다
- 검사는 모드를 **명시적으로** 말한다. 로컬 env 파일이 테스트 실행의 `NODE_ENV`를 정하므로, 모드를 적지 않은 검사는 머신에 따라 통과 여부가 갈린다
- 확인: `editor-link.spec.ts` 4건(production에서 null · development에서 절대 경로 · 환경변수 반영 · 저장소 밖 경로 거부)과 두 모드의 렌더 결과. **에디터가 실제로 열리는지는 사람이 확인해야 한다** — 이 세션에서는 dev 서버를 띄울 수 없다

## 다시 확인하는 명령

```bash
git status --short && git rev-parse HEAD && git remote -v
pnpm exec nx show projects
pnpm exec nx show project <name> --json
pnpm exec nx graph --file="$TMPDIR/graph.json"
NX_LOAD_DOT_ENV_FILES=false pnpm exec nx run-many -t test --skip-nx-cache
(cd apps/web-e2e && pnpm exec playwright test --list)
(cd apps/devhub-e2e && pnpm exec playwright test --list)
pnpm devhub:check
pnpm --dir apps/web exec berry-react-ui summary
pnpm --dir apps/web exec berry-react-ui find <query>
pnpm --dir apps/web exec berry-react-ui api <Symbol>
```
