# DevHub

DevHub(저장소 구조 · 시나리오 탐색 web app)의 조사와 설계 결정을 담은 문서다.

- **Part I (1–15절) Discovery** — DevHub를 만들기 전에 **로컬 저장소의 실제 상태**를 조사한 기록. 다음 단계는 저장소를 다시 추측하지 않고 여기서 출발한다
- **Part II (16–27절) Design** — Part I을 근거로 정한 목적 · 범위 · 도메인 모델 · 상태 의미 · IA · 링크 정책 · 데이터 소유 · 접근성 · 의존성 · 단계 경계
- **Part III (28절) 구현** — 구현하면서 Part II와 다르게 정한 것, 검사 규칙, 알려진 한계

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

| 경로                                                                   | 상태                                                                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/temp/`                                                           | 없음. 화면 기획서 원문도 로컬에 없다 (15절)                                                                                        |
| `apps/api/.env` · `apps/api/.env.dev.local`                            | 존재. Nx가 `apps/api/.env`를 태스크 환경에 넣어 `nx test api`의 `internal/config` 테스트를 깨뜨릴 수 있다 (`local-development.md`) |
| `apps/web/.env` · `apps/mobile/.env`                                   | 존재. web은 문서가 안내하는 `.env.local`이 아니라 `.env`다                                                                         |
| `apps/*/dist` · `libs/*/dist` · `apps/web/.next` · `apps/mobile/.expo` | 빌드 · 타입 산출물                                                                                                                 |

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
    src/app/(product)/        AppShell 아래 — / (홈) · /history · /settings/processing (모두 보호)
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
| WebView 안 이동  | web origin + `WEB_VIEW_PATHS`(`/` `/history` `/settings/processing` `/login` `/onboarding` `/auth/handoff*`)만 load, 외부 https는 `Linking.openURL`, 나머지 block                                           | `apps/mobile/src/lib/web.ts` `webViewNavigation`                     |
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
| app entry                | Implemented     | mobile `index.js` → `src/app/App.tsx` `App`; web `src/app/layout.tsx` + `(product)/page.tsx`                                                                                                                                                                                                                                       | E2E `home.spec.ts`; mobile `home/loadHome.spec.ts`                                                                                                            | 두 홈 모두 온보딩 뒤 처리한 사진(general 작업) 유무로 빈 홈 · 최근 처리 홈                                    |
| session restore          | Implemented     | mobile `createAuthController().start/restore/retryRestore/revalidate`, `AuthRestoring`, `AuthRestoreFailed`, `AppState` active 시 재검증; web `getSession()`(요청마다 Go 확인)                                                                                                                                                     | mobile `controller.spec.ts` · `model.spec.ts`; E2E `auth.spec.ts` "treats a session cookie Go no longer accepts"                                              | `target-architecture.md` 네비게이션 절                                                                        |
| browser Google auth      | Implemented     | `startGoogleLogin`(Server Action) → Go `/v1/auth/oauth/start` → Google → Go callback → web `/auth/callback` `handleOAuthCallback` → cookie                                                                                                                                                                                         | web unit 9파일; E2E `login.spec.ts` · `auth.spec.ts` · `auth-faults.spec.ts`(가짜 API); Go `oauth_test.go`                                                    | 실계정 Google 인수는 남아 있다(`target-architecture.md`). 신규 사용자 진입 경로는 12절 #1에서 고쳤다          |
| mobile Google auth       | Implemented     | `createGoogleSignIn`(proof → `oauthStart` → `openAuthSessionAsync` → `finishGoogleSignIn` → `exchange`), cold start 복귀 `resumeFromLaunchUrl`                                                                                                                                                                                     | `google.spec.ts` · `callback.spec.ts` · `storage.spec.ts`; **런타임 검증 없음**                                                                               | `EXPO_PUBLIC_AUTH_REDIRECT_URI`가 비면 비활성 (`.env.example` 기본값이 빈 값)                                 |
| onboarding               | Partial         | web `/onboarding` · `/onboarding/purpose` · `/onboarding/first-image`, mobile `OnboardingFlow` — 둘 다 소개 → 목적 선택 → 첫 사진 → 사진 확인 → 처리. 진행은 `GET` · `PUT /v1/onboarding`(서버 `profiles`)에 있고 규칙은 `libs/onboarding`이 함께 준다. 온보딩을 끝내는 API는 **Not found** (진행 저장은 `complete`를 받지 않는다) | E2E `auth-accessibility.spec.ts`(레이아웃) · `onboarding.spec.ts`; Go `onboarding_test.go`; mobile `model.spec.ts`(`destinationFor`) · `onboarding/*.spec.ts` | `local-development.md`: 로컬에서는 `profiles.onboarding_step`을 직접 바꿔야 홈에 닿는다                       |
| WebView entry            | Implemented     | `HomeScreen` "설정 변경" → `navigate('WebContent', { path: '/settings/processing', title: '사진 종류별 기본 처리' })` → `WebContentScreen`; web `AppShell inApp`, `InAppReady`                                                                                                                                                     | E2E `in-app.spec.ts`(UA 흉내); mobile `web.spec.ts` · `webHandoff.spec.ts`                                                                                    | 홈의 진입점은 `/settings/processing` 하나. `/history`는 허용 경로에만 있고 진입점 없음                        |
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
| `home.spec.ts`               | 빈 홈 · 최근 처리 홈 · 기록 읽기 실패 · 320px · 로그인 redirect                    |
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
| 6   | `.claude/rules/web.md` "보호 page는 page 안에서 `requireSession(returnTo)`", `foundation.md` "제품 화면(홈 · 기록)"                                                  | (해결) `/`는 `requireSession('/')`을 부르는 보호 page다. `InAppReady`는 없다(앱 홈은 네이티브). redirect allowlist에는 `/`가 있다                                                                                                                                                                                                                                                                                                      | 의도(공개 홈)인지 누락인지 docs에 없다 — 15절                                                                     |
| 7   | `data-access.md` 표: `apps/mobile/src/lib/api.ts` "`/health` 호출"                                                                                                   | `fetchHealth`는 정의 · 테스트만 있고 mobile 앱 코드에서 호출하지 않는다 (`pnpm health`는 web의 것을 부른다)                                                                                                                                                                                                                                                                                                                            | 표현 차이. 동작 문제는 아니다                                                                                     |
| 8   | `local-development.md` 환경변수 표: web 실제 파일은 `apps/web/.env.local`                                                                                            | 이 머신에는 `apps/web/.env`가 있다 (로컬 상태, 내용 미확인)                                                                                                                                                                                                                                                                                                                                                                            | 로컬 드리프트. Next는 둘 다 읽는다                                                                                |
| 9   | `.nvmrc` Node 24.14.0                                                                                                                                                | 이 세션의 `node --version` v24.20.0                                                                                                                                                                                                                                                                                                                                                                                                    | 로컬 드리프트                                                                                                     |
| 10  | `apps/mobile/app.json` — 문서화된 결정 없음                                                                                                                          | `name: "Mobile"` · `slug: "mobile"` · `scheme: "mobile"` · android `com.berrypjh.mobile` 생성기 기본값에 가깝다. 딥링크 계약(런타임 계약 5)을 받칠 설정이 없다                                                                                                                                                                                                                                                                         | 제품 식별자 미정. Planned 딥링크와 함께 결정 필요                                                                 |

## 13. Gap Analysis

### 제품 (docs 대비 source)

- **핵심 루프 대부분이 없다.** Capture · Understand는 온보딩 첫 사진 한 장에만 있다 — 앱 · web이 사진을 올리면 api가 설정된 모델로 분류한다(`/v1/processing-jobs`). Route · Act · Learn은 source · DB 스키마 · endpoint · 의존성에 흔적이 없다. 현재 제품 가치 흐름은 "로그인 → 온보딩(첫 사진 처리 뒤 막힘) → 부트스트랩 홈 → 빈 기록"이다 — 이후 온보딩 부분 해결(아래 항목). Route는 추천을 보이는 데까지, Act · Learn은 여전히 없다
- 앱 · web 온보딩은 첫 사진 처리 뒤 "다음 단계는 준비 중입니다."에서 끝난다. 결과 화면과 완료 endpoint가 없어 실제 사용자는 홈에 닿지 못한다 — 해결. 두 앱에 첫 결과 화면(찾은 값 · 추천 작업, 실행하지 않음)과 `POST /v1/onboarding/complete`가 생겨 홈까지 간다. 지금 상태는 DevHub의 `onboarding-intro` · `onboarding-first-photo` 시나리오
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

- 제품 앱(`web` · `mobile` · `api`)과 섞이지 않게 **개발용 도구**임을 이름이 말한다. 사용자 제품 이름("이미지 액션 라우터")이나 `web` 접두사를 쓰지 않는다
- 루트 `docs/`(마크다운 문서)와 헷갈리는 `docs` · `devdocs`, 이미 있는 `tools/`와 겹치는 `tools`는 쓰지 않는다
- 새 앱은 `nx run-many`의 대상이 되므로 `pnpm lint` · `typecheck` · `test` · `build` · `verify` 범위가 늘어난다. `web-e2e`처럼 implicit dependency를 두지 않는 한 다른 프로젝트의 affected에는 영향이 없다

## 15. Open questions

Part II에서 답한 질문은 결정 절을 적어 두었다. 남은 질문은 27절 끝에 모았다.

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
| 1   | 홈에서 "설정 변경"을 누르면 WebView가 열린다      | mobile-app     | `apps/mobile/src/screens/HomeScreen.tsx` · `HomeScreen`; `apps/mobile/src/screens/WebContentScreen.tsx` · `WebContentScreen`; `apps/mobile/src/auth/webHandoff.ts` · `initialWebContent`                                                   | —                                                                     |
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
4. Part I 15절 미결 6 · 7 · 8

# Part III — 구현

## 28. 구현에서 바뀐 설계

Part II와 다르게 구현한 것과 지금도 유효한 결정만 적는다. 단계별 구현 경과는 git 이력에, 이후의 설계 판단은 `docs/records/`에 있다.

### 모델 · 데이터

- **`SourceRef`에 `repository` 필드 없음** — 저장소가 하나이고 catalog가 그 저장소를 소유한다. 저장소가 둘이 되면 넣는다
- **`Project` 대신 `ApplicationRef` · `LibraryRef`** — `kind`로 구분. `web-e2e`는 `role: 'test'`인 application
- **신뢰도 등급(19.3) 미도입** — 검증 수준은 `TestRef.requires`(`database` · `port-binding` · `browser-binaries`)와 시나리오의 `EvidenceGap`으로 드러난다
- **시나리오 track 셋** — `current` · `product-target`(상태는 documented-only · planned · not-found만, step에 source 금지) · `developer`(저장소 안에서 돌리는 흐름, runtime `go-cli`)
- **`src/generated/` · collector 없음** — validator가 manifest · `swagger.json` · `nx graph --file`을 직접 읽는다
- **카탈로그는 제품만 담는다** — `devhub` · `devhub-e2e`와 이 문서는 노드 · 문서 · 기록 · 테스트 어디에도 없다. 저장소 전체와 대조하는 검사는 이 범위를 `test-support/scope.ts`로 안다
- **부재 검색어로 `action`을 쓰지 않는다** — `transaction`(OAuth transaction)에 걸려 아무것도 증명하지 못한다

### 화면 (20 · 21 · 22절 대비)

- **route는 탐색기 섹션과 1:1** — `/architecture`(그림) 외에 `/scenarios` · `/applications` · `/libraries` · `/documents` · `/records` · `/evals`, 파일 하나는 `/source?path=…`. 엔지니어링 섹션은 없앴다
- **상세 정보는 parallel route 슬롯 `@inspector`** — page(`children`)가 본문 머리를 먼저 그려, 이동 뒤 Next의 스크롤 · 포커스가 본문으로 간다
- **그림은 읽기 전용이지만 pan · zoom이 있다**(21절 "상호작용 없음"을 바꿈) — 노드는 단계 · 구성 요소 URL로 가는 진짜 링크, 그림/목록 전환, "크게 보기"는 브라우저 `<dialog>`. 배치는 렌더할 때 데이터에서 계산하고 좌표를 데이터에 두지 않는다
- **목록은 요약, 근거는 상세 정보** — 시나리오 목록은 단계마다 한 줄, 소스 · API · 계약 · 테스트 파일은 상세 정보에만
- **"이 페이지에서" 목차는 본문 안** — 본문 영역 폭(컨테이너 쿼리) 기준으로 옆 열 또는 접힌 목록
- **건너뛰기 링크는 루트 layout `<body>` 맨 앞** — 다른 레이아웃으로 이동한 뒤 포커스가 `body`에 남으면 `NavigationFocus` 자리로 옮긴다
- **로컬 에디터 링크는 개발 서버에서만**(22.2 제외 사유 해소) — `editorHref`는 `NODE_ENV=development`에서만 값을 내므로 빌드 산출물에 개인 경로가 없다. 에디터는 `DEVHUB_EDITOR`로 고른다
- **일반 개발 도구 UI는 공용 `@berrypjh/devhub-ui`** — 이 앱은 무엇을 보여 줄지(카탈로그 · 평가 · 아키텍처)만 갖는다. 규칙은 `.claude/rules/devhub.md`
- **평가 화면(`/evals`)은 관찰만** — 판정 · 채점은 Go 산출물 값을 그대로 쓴다. 규칙은 `.claude/rules/devhub.md`

### 실행 · 캐시

- **포트 3100 고정** — `dev` · `start` · `serve-static`. web(3000)과 함께 떠도 부딪히지 않는다
- **`test` · `build` · `devhub-check`는 `cache: false`** — 저장소 전체와 git 스냅샷을 읽는데 Nx inputs로 표현되지 않아, 캐시가 낡은 통과를 재생했다
- **`pnpm devhub:check`** — freshness spec만 도는 빠른 검사. 같은 spec이 `nx test devhub`에도 있어 `pnpm test`에서도 돈다

### 검사 규칙

| 묶음           | 규칙                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema · graph | 컬렉션별 id 유일, 관계 양 끝 · `next` · `via` · runtime · owner · API · 계약 · 테스트 · 문서 id 존재                                                           |
| 파일           | catalog이 인용한 모든 경로가 정규 경로이고 디스크에 있다. `docs/**/*.md`는 빠짐없이 catalog에 있다                                                             |
| 문서           | 인용한 heading이 글자 그대로 있다. 문서 · 기록의 링크 · 앵커 · 파일이 실제로 있다. 제품 한 문장은 인용한 heading 아래에 글자 그대로 있다                       |
| Nx project     | Nx가 실제로 보는 project = catalog project. manifest 의존 = catalog의 Nx 의존 관계. 루트 script가 부르는 target이 있다                                         |
| 시나리오 의미  | `implemented`는 source 필수, `partial`은 source + 공백, `documented-only` · `not-found`는 source 없음 + 부재 검색. 단계 source에 테스트 · 문서 · e2e 파일 금지 |
| API · 계약     | 항상 노출되는 route = 생성된 Swagger, 경로 변수(`{jobId}`)는 호출 코드의 template placeholder와 맞춘다. 계약 literal이 정의 파일에 있다                        |
| 링크 · 스냅샷  | 링크는 `RepositoryRef` 템플릿 + 스냅샷 + 인코딩된 경로에서만. 데이터에 URL · SHA · `#L` 없음. 스냅샷은 env → git → unavailable, 실패 시 가짜 SHA 없음          |
| 소스 파일      | `apps/devhub*`에 날 제어 문자가 없다 — 있으면 git이 바이너리로 본다                                                                                            |

### 알려진 한계

- **symbol 검사는 글자 검사** — 주석 · 문자열에 같은 단어가 있으면 통과하고, 재export · 생성 코드의 선언은 실패한다
- **검사가 한 방향** — 인용한 것이 사라지면 잡지만, catalog이 모르는 새 소스 · 테스트 · route는 잡지 못한다. Nx project · manifest 의존 · `docs/**/*.md` · Swagger route만 양방향
- **`nx affected`가 DevHub를 모름** — 인용된 파일을 바꿨으면 `pnpm devhub:check`를 따로 돌린다
- **`next build`는 검사를 돌리지 않는다** — `nx build devhub`만 돌리면 검사 없이 빌드된다
- **`next dev`는 프로세스마다 스냅샷을 한 번 읽는다** — 커밋한 뒤에는 다시 띄워야 새 SHA가 보인다
- **저장소가 private** — permalink는 권한 있는 로그인 세션에서만 열린다

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
