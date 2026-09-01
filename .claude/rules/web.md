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
- 기존 primitive를 먼저 쓴다 — `Button`(primary/secondary) · `Surface`(기본/muted) · `AppShell`. 새 primitive는 실제 화면에서 필요해질 때 만든다
- semantic landmark를 쓴다. 클릭 가능한 것은 `<button>` 또는 `<a>`다

## Styling

Tailwind v4 `@theme`. 토큰은 `src/app/global.css`에 있고 값의 기준은 [foundation.md](../../docs/design/foundation.md)다.

- **역할 이름으로만 쓴다.** Tailwind 기본 팔레트 · 텍스트 크기 · radius · shadow는 `initial`로 제거돼 있어 `bg-blue-500` · `text-xl` · `rounded-xl` · `shadow-lg` 같은 클래스는 **존재하지 않는다**
- spacing은 `p-1 p-2 p-3 p-4 p-5 p-6 p-8`(4/8/12/16/20/24/32)만 쓴다. `p-7` · `p-10`은 쓰지 않는다
- radius는 `sm` · `md` · `lg` 셋뿐, shadow는 `card` 하나뿐이다
- focus는 `global.css`의 전역 `:focus-visible` 하나로 처리한다. component마다 focus 스타일을 만들지 않는다
- 토큰 값을 바꿀 때는 `foundation.md` → `global.css` → `apps/mobile/src/theme/tokens.ts` 순서로 함께 고친다

## Data

- API 주소를 아는 파일은 `src/lib/api.ts` **하나뿐이다.** component에 URL 문자열을 쓰지 않는다
- Server Component에서 호출한다. 브라우저가 Go API를 직접 부르지 않으므로 CORS 설정이 없다
- `app/api/*` route를 만들지 않는다. 브라우저 직접 호출이 필요해지면 [data-access.md](../../docs/architecture/data-access.md)의 전환 절차를 먼저 읽는다
- 환경변수는 `API_BASE_URL`이다. `NEXT_PUBLIC_` 접두사가 없는 것은 의도적이다
- 응답은 좁은 타입 가드로 확인한다. `any`를 쓰지 않는다

## Test

`vitest.config.ts`는 `environment: 'node'`, `include: ['src/**/*.spec.ts']`다. spec 파일도 `nx typecheck web`이 검사한다. React 컴포넌트를 테스트하게 되면 `jsdom`과 `@testing-library/react`를 그때 함께 추가한다.

셸 반응형 계약(768px 사이드바 전환, 320px 가로 스크롤 없음)은 `apps/web-e2e`가 고정한다.
