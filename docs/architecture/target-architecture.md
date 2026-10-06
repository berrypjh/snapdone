# Target Architecture

## 목표 구조

```
Nx Workspace (repository root)
├─ apps/web      Next.js + TypeScript
├─ apps/mobile   React Native + Expo + TypeScript
├─ apps/api      Go
├─ libs/         플랫폼 중립 공유 코드
└─ docs/         제품 · 아키텍처 문서
```

## 현재 상태

| 영역          | 상태                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nx workspace  | integrated, pnpm workspaces                                                                                                                                        |
| `apps/web`    | Next.js App Router. `(product)` 홈 · `/history`, `(auth)` 로그인 · 온보딩 · callback · 핸드오프, 브라우저 셸과 앱 WebView 모드                                     |
| `apps/mobile` | Expo. React Navigation native stack — 로그인 · 온보딩 소개 · 네이티브 홈 · WebView 콘텐츠 화면                                                                     |
| `apps/api`    | module `snapdone/api`. `/health` · 인증 · 온보딩 진행 · 사진 분류, Postgres. 평가 harness는 서버와 분리된 개발자 CLI([agent-evaluation.md](./agent-evaluation.md)) |
| `libs/`       | `webview-bridge` · `auth-contracts` · `onboarding` (모두 web · mobile이 사용)                                                                                      |
| `docs/`       | 제품 · 아키텍처 · 디자인 · 개발 · 품질                                                                                                                             |

버전은 아래 [버전 정책](#버전-정책)에 한 곳으로 모아 두었다.

프로젝트 목록과 각 프로젝트의 실제 target은 `nx show projects` · `nx show project <이름>`이 기준이다. 이 문서에 목록을 박아두지 않는다.

실행·검증 명령은 [docs/development/local-development.md](../development/local-development.md).

### 무엇이 있고 무엇이 없는가

**지금 있는 것은 인프라 · 인증 · 온보딩까지다.** 사진 처리는 온보딩 첫 사진 분류뿐이고 Act(실행)는 없다.

구현된 것:

- Nx monorepo와 세 앱의 골격
- 앱별 부트스트랩 화면 (서비스명 + 소개 문구 + 상태 문구)
- 디자인 토큰과 App Shell, web 라이트/다크 테마
- 네이티브 셸 + 웹 콘텐츠 골격 — mobile native stack, WebView 화면(로딩 · 오류 · 외부 링크), web in-app 모드, `libs/webview-bridge` 계약과 모듈 경계 lint
- Go `GET /health`, Gin HTTP 경계와 swag로 생성한 Swagger 2.0 문서
- Postgres 연결 · 마이그레이션(로컬 Docker)과 인증 저장소 · `/v1/auth/*`
- Google 로그인 화면과 세션 — mobile 네이티브 흐름, web 로그인 · HttpOnly 세션 cookie, WebView 로그인 핸드오프. **실계정 · 실기기 인수는 남아 있다**
- 온보딩 소개 → 사용 목적 → 첫 사진 → 처리 — mobile(네이티브)과 web(브라우저 단독, 파일 선택)이 같은 순서로 간다. 진행은 서버(`/v1/onboarding`)에 있어 어느 쪽에서든 이어 간다. 두 앱 모두 첫 결과 화면(사진에서 찾은 값 · 추천 작업, 실행은 하지 않음)에서 온보딩을 마치고 홈으로 간다(`POST /v1/onboarding/complete`). mobile은 완료 뒤 세션을 다시 받아 root stack이 홈으로 바뀐다
- 검증 명령과 문서

아직 구현하지 않은 것:

- 로그인 수단은 Google만 (코드만 있고 실계정 검증 전). Apple · 네이버 · 카카오는 나중에 추가
- 온보딩 첫 사진 밖의 이미지 업로드 · AI 분석 — 지금은 온보딩 첫 사진 한 장을 올려 분류 결과를 받는 데까지만 있다(사진은 저장하지 않는다)
- 장소
- 캘린더
- 영수증
- 번역
- 자동화
- production DB (Cloud SQL 미생성)
- production 배포

**이 목록은 "예정"이 아니라 "없음"이다.** 위 기능과 관련된 코드는 저장소에 존재하지 않는다.

다음 단계는 공통 앱 셸과 디자인 시스템 위에 실제 화면을 기획서 순서대로 하나씩 올리는 것이다. 테스트가 어디까지 덮고 있는지는 [quality-gates.md](../engineering/quality-gates.md).

## 제품 구성 — 네이티브 셸 + 웹 콘텐츠

**결정:** mobile이 주 제품이다. web은 브라우저 단독 서비스이면서 앱 안 WebView로도 열린다. 하이브리드 앱에서 가장 보편적인 분담을 따른다.

| 영역                                                                     | 담당                              | 이유                                                     |
| ------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------- |
| 탭 · 스택 네비게이션, 로그인, 권한, 푸시                                 | mobile 네이티브                   | 앱다운 사용감, 스토어 심사(App Store 4.2 최소 기능) 안전 |
| Capture → Understand → Route → Act 핵심 흐름 (카메라 · 사진 · 공유 시트) | mobile 네이티브                   | 네이티브 API가 필요하고 제품의 무게중심이 여기 있다      |
| 결과 상세 · 기록 · 공지 / FAQ · 약관 · 설정 일부                         | web 한 벌 → 브라우저 + 앱 WebView | 스토어 배포 없이 고치고 코드는 한 벌                     |
| 브라우저 단독 접속                                                       | web 전체                          | URL 공유, 서버 렌더링된 첫 HTML                          |

### 런타임 계약

web과 mobile은 **코드로 서로 참조하지 않는다.** 앱은 web을 URL로 연다. 둘 사이 계약은 아래 다섯 가지뿐이다.

1. **in-app 판별** — 앱이 WebView User-Agent 뒤에 `SnapdoneApp/<bridge 계약 버전>`(지금 `SnapdoneApp/1`)을 붙인다(`react-native-webview`의 `applicationNameForUserAgent`). 앱 버전이 아니라 계약 버전이라 web이 어떤 메시지를 쓸 수 있는지 안다. web은 서버에서 이 값을 읽으므로 첫 HTML부터 in-app 모드가 적용된다. 판별 함수는 web에 하나만 둔다
2. **로그인** — 일회용 코드 핸드오프. [data-access.md](./data-access.md#webview-로그인-핸드오프)
3. **메시지** — web → 앱 `window.ReactNativeWebView.postMessage(JSON)`, 앱 → web `postMessage` · `injectJavaScript`. 메시지 타입(닫기 · 결과 전달 · 오류 · 촬영/공유 요청)은 web과 mobile이 함께 쓰므로 `libs/`의 플랫폼 중립 TypeScript 계약으로 둔다
4. **링크 · 뒤로 가기** — 같은 도메인은 WebView 안에서, 외부 도메인은 시스템 브라우저로(`onShouldStartLoadWithRequest` → `Linking.openURL`). 뒤로 가기 · 닫기는 네이티브가 담당한다
5. **URL** — web 경로와 앱 딥링크(Universal Link / App Link) 경로를 같게 둔다. 공유 링크는 앱이 있으면 앱, 없으면 브라우저로 열린다

**구현된 것 (MVP 골격):** `react-native-webview` · React Navigation native stack, web `isInAppRequest()` · `InAppReady`, mobile `WebContentScreen` · `webViewNavigation`, `libs/webview-bridge`(User-Agent 토큰 · `ready` · `auth-required` · `handoff-ready` 메시지), 로그인 핸드오프(web `/auth/handoff*` · Go `/v1/auth/handoff/*`), in-app E2E.

**아직 없는 것:** 앱 → web 메시지, 딥링크 설정, 촬영 · 공유 요청 메시지. 핵심 흐름을 WebView로 옮기지 않는다.

## 각 영역의 책임

### `apps/web` — Next.js

브라우저 단독 서비스 전체와, 앱 WebView로 여는 콘텐츠 화면을 담당한다. 두 환경은 **같은 코드 한 벌**이며 in-app 모드에서는 셸만 숨긴다.

- 라우팅, 페이지 구성, 데이터 페칭 (App Router)
- 서버에서 할 수 있는 일은 Server Component에서 한다
- 브라우저 상호작용이 필요한 부분만 Client Component
- 폰 폭(320–767px) 우선 반응형 — WebView는 항상 이 폭이다
- 웹 고유의 입력 경로 — 파일 선택, 드래그 앤 드롭, 붙여넣기 (브라우저 단독 접속에서)

담지 않는 것: 웹 전용이 아닌 도메인 규칙과 검증 로직을 웹에 묶어두는 일. 아직 web에서만 쓰는 동안에는 web 안에 두고, mobile에서도 필요해지는 시점에 `libs/`로 올린다. in-app 모드에서 카메라 · 공유 시트를 web으로 구현하는 일 — 앱에 메시지로 요청한다.

### `apps/mobile` — React Native + Expo

주 제품이다. 네이티브 셸과 핵심 흐름, 그리고 web 콘텐츠를 여는 WebView 호스트를 담당한다.

- 네이티브 입력 경로 — 카메라, 사진 라이브러리, 공유 시트
- 권한 요청과 그 실패 처리
- 플랫폼 네비게이션, 시트, 알림
- Safe Area, 키보드, 접근성
- WebView 호스트 — in-app User-Agent, 로그인 핸드오프, 메시지 수신, 외부 링크 처리

담지 않는 것: web과 동일한 화면 구조를 억지로 맞추는 일. 결과는 같고 구현은 각자에 맞게 한다. web 콘텐츠 화면을 RN으로 다시 만드는 일.

**네비게이션은 React Navigation native stack이다.** `src/app/App.tsx`가 인증 · 온보딩 상태에 따라 등록할 화면을 고른다(복원 → 로그인 → 온보딩 → `Home` · `WebContent`). bottom navigation은 실제 탭이 생길 때 넣는다. 가짜 탭을 미리 만들지 않는다 ([foundation.md](../design/foundation.md)의 Mobile Shell).

### `apps/api` — Go

서버 로직과 외부 연동을 담당한다.

- 이미지 처리 파이프라인 진입점
- 모델 호출과 그 결과의 정규화
- 외부 서비스 연동 (캘린더, 저장소 등)
- 인증, 저장, 사용자 데이터

**표준 Go 프로젝트 구조를 유지한다.** Nx에 맞추려고 Go 관례를 벗어난 배치를 하지 않는다. Nx에는 target을 연결해 `build` · `test` · `vet` · `fmt`를 orchestration에 참여시킨다(`lint` target은 없다).

**Nx 연결 방식 (결정 완료):** 서드파티 Go 플러그인을 쓰지 않고 `apps/api/project.json`의 `nx:run-commands` target으로 연결한다. Nx에 first-party Go 플러그인이 없고, 서드파티를 넣으면 Go 관례를 플러그인 규약에 맞춰 변형해야 하기 때문이다. Nx는 `go` 명령을 감싸기만 하고 Go 쪽 구조에는 관여하지 않는다.

**Go module path (결정 완료):** `snapdone/api`.

remote가 정해지지 않아 도메인 없는 경로를 쓴다. remote가 생기면 그 시점에 `go mod edit -module <새 경로>`로 한 번에 바꾼다(내부 import 경로가 함께 바뀐다).

**HTTP 경계 (결정 완료):** 수명주기는 `net/http.Server`가 갖고 Gin engine은 그 `Handler`일 뿐이다. Gin은 `internal/httpserver` 안에서만 쓴다. DB는 pgx 직접 접근이고 ORM · repository 계층은 두지 않는다. API 문서는 swag로 생성한 Swagger 2.0이다. 세부 규칙은 `.claude/rules/api.md`.

**빌드 산출물:** `dist/apps/api/api`. 소스 디렉터리에 바이너리를 남기지 않으며 `dist/`는 git ignore 대상이다.

### `libs/` — 공유 코드

**지금 lib은 `webview-bridge` · `auth-contracts` · `onboarding` 셋이다.** 모양과 경계 규칙은 `.claude/rules/libs.md`.

라이브러리는 재사용이 실제로 발생한 뒤에 만든다. 두 번째 사용처가 나타나기 전에는 코드를 쓰는 앱 안에 둔다.

**들어올 수 있는 것**

- domain type
- pure business logic
- formatter (날짜, 금액, 전화번호 — ko-KR 규칙)
- validation
- constants
- API contract 관련 TypeScript 코드

**들어오면 안 되는 것**

- DOM component, React Native component
- CSS, 스타일 시스템
- browser API, native API 접근
- platform navigation
- platform-specific modal / sheet

한 파일이 `document`나 `react-native`를 import한다면 그것은 `libs/`에 있을 코드가 아니다.

이 문서에 미래 라이브러리 이름을 미리 나열하지 않는다. 만들어질 때 이름이 정해진다.

### `docs/` — 문서

- `docs/product/` — 제품 판단 기준
- `docs/architecture/` — 구조와 경계
- `docs/design/` — 디자인 토큰 조합과 App Shell
- `docs/development/` — 로컬 실행 · 환경변수
- `docs/engineering/` — 검증 · 의존성 · 보안

구현 결정이 문서와 어긋나면 둘 중 하나를 고친다. 어긋난 채로 두지 않는다.

## 의존 방향

```
apps/web ─┐
          ├─→ libs/*        (허용)
apps/mobile ┘

libs/* ─→ apps/*            (금지)
libs/* ─→ libs/*            (순환 금지)

apps/web ─→ apps/mobile     (금지)
apps/mobile ─→ apps/web     (금지)
```

- `libs/`는 어떤 app도 알지 못한다
- app 사이의 직접 참조는 없다. 공유가 필요하면 `libs/`로 올린다
- `apps/api`는 Go이므로 TypeScript `libs/`를 코드로 공유하지 않는다

## Web · Mobile · API 사이의 계약

`apps/api`(Go)와 TypeScript 앱들은 언어가 다르므로 타입을 직접 공유할 수 없다. 계약은 생성되거나 명시적으로 선언되어야 한다.

지금은 타입을 손으로 두며, 호출 경로 · CORS 판단 · 생성 전략을 도입할 시점은 [data-access.md](./data-access.md)에 있다.

## Nx가 담당하는 것

- project graph와 의존 관계 파악
- 태스크 캐싱
- 세 앱에 걸친 `build` · `test` · `lint` 일관 실행

`nx affected`는 아직 쓰지 않는다. CI가 없어 기준 커밋을 잡을 곳이 없고, 스크립트는 전부 `nx run-many`다. CI가 생기면 base SHA를 "main의 마지막 성공 커밋"으로 두고 도입한다.

Nx는 orchestration 계층이다. 각 플랫폼의 빌드 도구(Next.js, Expo, Go toolchain)를 대체하지 않는다.

## 버전 정책

아래는 전부 실제 설치된 것을 읽은 값이다.

| 항목         | 버전                              |
| ------------ | --------------------------------- |
| Node         | 24.14.0                           |
| pnpm         | 10.30.3                           |
| Nx           | 23.1.1 (`nx`와 모든 `@nx/*` 동일) |
| Next.js      | 16.1.7                            |
| React        | 19.2.3 (정확히 고정, 아래 참고)   |
| Expo SDK     | 56.0.19                           |
| React Native | 0.85.3                            |
| Go           | 1.26.6                            |
| TypeScript   | 6.0.3                             |
| Tailwind CSS | 4.3.3                             |
| ESLint       | 9.39.5                            |
| Prettier     | 3.9.6                             |
| Vitest       | 4.1.10                            |
| Playwright   | 1.62.1                            |

`nx`와 모든 `@nx/*` 플러그인은 **정확히 같은 버전**이어야 한다. 플러그인 dependency가 exact pin이라 하나만 어긋나면 중복 설치와 그래프 오류가 난다.

**React는 `19.2.3`으로 정확히 고정한다** (root · `apps/web` 모두, `^` 금지). react-native 렌더러와 버전이 다르면 `Incompatible React versions`로 멈춘다. web도 같은 React를 쓴다. 네이티브 모듈 버전(`react-native-svg` 등)도 `expo/bundledNativeModules.json` 값을 따른다. **사본이 갈리면 안 되는 패키지는 `pnpm-workspace.yaml`의 `overrides`에 적어** 앱이 `"*"`로 적어도 워크스페이스 전체가 한 버전으로 해석되게 한다.

**Expo는 SDK 56에 고정한다.** `@nx/expo`가 아직 SDK 57을 생성·마이그레이션하지 못한다 (nrwl/nx#36443).

버전 변경은 `nx migrate`로만 한다. 개별 `pnpm add`로 올리지 않는다.
