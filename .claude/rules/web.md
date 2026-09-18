---
paths:
  - 'apps/web/**'
---

# web (`apps/web`)

Next.js App Router. 소스는 `src/`, alias는 `@/*` → `./src/*`.

## Component

- **App Router만 쓴다.** `pages/`를 만들지 않는다
- **Server Component가 기본이다.** `'use client'`는 브라우저 상호작용이 실제로 필요한 컴포넌트에만 붙인다. 루트 `layout.tsx`에는 붙이지 않는다
- 파일 이름은 **kebab-case**(`app-shell.tsx`), export는 PascalCase
- **로컬 primitive를 만들지 않는다.** 공용 `@berrypjh/react-ui` 컴포넌트(`Box` · `Stack` · `SkipLink` · `Switch` 등)를 가져와 조합한다. 앱이 소유하는 것은 제품 셸 `AppShell`뿐이다
- `main` · `aside` · `header`를 `Box`로 바꾸지 않는다. `SkipLink`는 `<main id="main-content" tabIndex={-1}>`을 가리킨다
- semantic landmark를 쓴다. 클릭 가능한 것은 `<button>` 또는 `<a>`다

## 브라우저 · 앱 WebView 공용

같은 코드가 브라우저 단독 서비스와 앱 WebView 양쪽에서 열린다 ([target-architecture.md](../../docs/architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠)).

- **폰 폭(320–767px)을 기본으로 설계한다.** WebView는 항상 이 폭이다
- in-app 판별은 User-Agent의 `SnapdoneApp/` 하나로, **판별 함수 한 곳**에서만 한다. 컴포넌트가 User-Agent를 직접 읽지 않는다
- in-app 모드에서는 셸(헤더 · 사이드바)만 숨긴다. 화면 내용을 환경별로 따로 만들지 않는다
- 카메라 · 사진 · 공유 시트를 web에서 구현하지 않는다. in-app 모드에서는 앱에 메시지로 요청한다
- 앱과 주고받는 메시지는 `libs/`의 계약 타입만 쓴다. 문자열 메시지를 흩어 쓰지 않는다
- 로그인 토큰을 URL · JS 전역으로 받지 않는다. 핸드오프는 [data-access.md](../../docs/architecture/data-access.md#webview-로그인-핸드오프)
- 판별은 `src/lib/in-app.ts`의 `isInAppRequest()`(서버, User-Agent) 하나다. `(product)` layout이 읽어 `AppShell inApp`으로 넘긴다 — 앱 안에서는 header · sidebar · SkipLink 없이 `main`만 렌더한다
- WebView로 열리는 페이지는 `<InAppReady title="…" />`로 앱에 준비 완료와 제목을 알린다. 브라우저에서는 아무 일도 하지 않는다
- 앱 모드 계약은 `apps/web-e2e/src/in-app.spec.ts`가 앱 User-Agent로 고정한다
- 앱 안 `/login`은 Google 버튼 대신 안내를 보이고 `auth-required`를 보낸다. 앱이 `/auth/handoff/start` → ready(`handoff-ready`) → `/auth/handoff`로 세션을 넘긴다(`src/lib/auth/handoff.ts`). 메시지는 `<InAppMessage message={…} />`로 보낸다

## 인증

- root layout은 html · theme · CSS만 둔다. 제품 화면은 `app/(product)`(AppShell), 로그인 화면은 `app/(auth)`(nav 없는 단일 main)
- 보호 page는 page 안에서 `requireSession(returnTo)`를 부른다. layout · proxy만으로 인가를 끝내지 않는다
- 로그인 뒤 돌아갈 경로는 `src/lib/auth/redirect.ts` allowlist에 추가한다
- credential · preauth 값을 props · Server Action 반환값 · 브라우저 저장소에 싣지 않는다. cookie는 `src/lib/auth/cookies.ts`의 `authCookies()` 이름 · 속성만 쓴다
- mutation Server Action은 `isAllowedOrigin`(`WEB_ORIGIN` 정확 비교)을 먼저 확인한다

## Styling

Tailwind v4 + `@berrypjh/react-ui`. 색 · 타입 스케일 · radius · shadow는 **shared preset**(`@berrypjh/react-ui/tailwind`, `tailwind.config.mjs` → `global.css`의 `@config`)과 `@berrypjh/react-ui/styles.css`(layout에서 한 번 import)가 준다. 로컬에 raw 값을 두지 않는다. 기준은 [foundation.md](../../docs/design/foundation.md)다.

- **shared 토큰 이름으로만 쓴다** — `bg-background-surface` · `text-text-default` · `border-stroke-light` · `rounded-lg` · `shadow-xs`. Tailwind 기본 팔레트 · 크기 · radius · shadow는 `initial`로 제거돼 있어 `bg-blue-500` 같은 클래스는 존재하지 않는다
- 글자 스타일은 `global.css`의 `typo-*` utility(`typo-heading-h4` · `typo-paragraph-default` · `typo-body-medium-strong` · `typo-caption-default`)로만 쓴다. shared CSS 변수를 조합한 것이다
- **preset spacing 이름이 Tailwind 크기 이름을 가린다** — `max-w-3xl`은 48rem이 아니라 `--ds-spacing-3xl`(2.5rem)이 된다. 본문 폭은 `max-w-(--container-3xl)`로 쓴다
- spacing은 `p-1 p-2 p-3 p-4 p-5 p-6 p-8`(4/8/12/16/20/24/32)만 쓴다
- focus는 `global.css`의 전역 `:focus-visible` 하나로 처리한다
- shared 컴포넌트는 `@berrypjh/react-ui`에서 바로 import한다. 1.1.1부터 hook을 쓰는 컴포넌트 모듈이 `'use client'`를 스스로 보존하므로 앱에 client 경계 파일을 두지 않는다
- theme은 **`<html data-theme>` 하나가 소유한다** (light = 공용 `:root`, dark = 공용 `[data-theme="dark"]`). 저장된 선택이 없으면 시스템 설정을 따르고, `src/lib/theme.ts`의 head 스크립트가 첫 paint 전에 적용한다. 전환 UI는 헤더의 `ThemeSwitch`(공용 `Switch`) 하나다
- 고정 `mode`를 가진 `ThemeProvider`로 감싸지 않는다 — `<div data-theme>`가 사용자 선택과 다른 두 번째 theme 주인이 된다. 색은 CSS 변수가 바꾸므로 컴포넌트에서 theme을 분기하지 않는다

## 공용 UI API 조회

컴포넌트 · prop · 토큰을 기억이나 추측으로 쓰지 않는다. **설치된 버전**에서 아래 순서로 좁힌다. 위 단계에서 답이 나오면 내려가지 않는다.

1. 플랫폼 확인 — web은 `@berrypjh/react-ui`
2. 사용 규칙 · 함정 — `node_modules/@berrypjh/react-ui/dist/AGENTS.md`(export `@berrypjh/react-ui/agents`)
3. 후보 심볼 — `pnpm --dir apps/web exec berry-react-ui find <query>`
4. 정확한 prop — `pnpm --dir apps/web exec berry-react-ui api <Symbol>`
5. 토큰 — `pnpm --dir apps/web exec berry-react-ui token <path|prefix>`
6. 그래도 부족할 때만 public d.ts (`@berrypjh/react-ui` types)

- 설치된 bin을 쓴다. **bare `npx @berrypjh/react-ui`는 쓰지 않는다** — 레지스트리 latest를 끌어와 설치 버전과 다른 답을 줄 수 있다
- 조회 결과가 비어 있는 것은 **source를 읽거나 복사할 사유가 아니다.** 없는 API는 없는 것으로 보고, 필요하면 upstream에 요청한다
- private `@berrypjh/ui-core` · `@berrypjh/design-tokens` · `/src` · 내부 `dist` 경로를 import하지 않는다

## Data

- API 주소를 아는 파일은 `src/lib/api.ts` **하나뿐이다.** component에 URL 문자열을 쓰지 않는다
- 서버에서 호출한다 — 읽기는 Server Component, mutation은 Server Action · Route Handler. 브라우저가 Go API를 직접 부르지 않으므로 CORS 설정이 없다. 인증 endpoint 호출은 `src/lib/auth/api.ts`에 모은다
- `app/api/*` route를 만들지 않는다. 브라우저 직접 호출이 필요해지면 [data-access.md](../../docs/architecture/data-access.md)의 전환 절차를 먼저 읽는다
- 환경변수는 `API_BASE_URL`이다. `NEXT_PUBLIC_` 접두사가 없는 것은 의도적이다
- 응답은 좁은 타입 가드로 확인한다. `any`를 쓰지 않는다

## Test

`vitest.config.ts`는 `environment: 'node'`, `include: ['src/**/*.spec.ts']`다. spec 파일도 `nx typecheck web`이 검사한다. React 컴포넌트를 테스트하게 되면 `jsdom`과 `@testing-library/react`를 그때 함께 추가한다.

셸 반응형 계약(768px 사이드바 전환, 320px 가로 스크롤 없음)은 `apps/web-e2e`가 고정한다.
