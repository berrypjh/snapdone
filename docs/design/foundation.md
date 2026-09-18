# Design Foundation

**Web의 토큰 값은 공용 디자인 시스템 `@berrypjh/react-ui`가 기준이다.** 공용 라이브러리가 로컬 규칙보다 우선하며, 이 문서는 snapdone이 그 값을 어떤 이름으로 조합해 쓰는지 적는다. 값 자체를 여기서 바꾸지 않는다 — 바꿔야 하면 공용 라이브러리에 요청한다.

| 플랫폼 | 값의 출처                                                                                  | 구현 파일                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Web    | `@berrypjh/react-ui/styles.css`(CSS 변수) · `@berrypjh/react-ui/tailwind`(Tailwind preset) | `apps/web/tailwind.config.mjs` · `apps/web/src/app/global.css` · `apps/web/src/app/layout.tsx`               |
| Mobile | `@berrypjh/react-native-ui` 테마 토큰(`useTheme` · `getColor` · `theme.tokens.*`)          | `apps/mobile/src/app/App.tsx` · `apps/mobile/src/theme/text.ts` · `apps/mobile/src/theme/navigationTheme.ts` |

Web과 Mobile은 **같은 공용 토큰 값**을 쓴다. web은 CSS 변수(rem), mobile은 숫자(px)로 받는다. 두 플랫폼 모두 라이트/다크를 따른다.

## Design Principles

- 흰색/중립 배경, 색은 의미가 있을 때만
- 명확한 hierarchy — 크기보다 굵기와 색으로 구분
- accent는 공용 primary 하나. 장식용 색을 추가하지 않는다
- border는 얇게 (1px, 모바일은 hairline)
- shadow는 카드 하나에만
- 넉넉한 whitespace
- 읽기 쉬운 한국어

## Web 연결 구조

```
layout.tsx
  import '@berrypjh/react-ui/styles.css'   :root / [data-theme=…] 의 --ds-* 변수
  import './global.css'
    @import 'tailwindcss'
    @config '../../tailwind.config.mjs'    presets: [@berrypjh/react-ui/tailwind]
    @theme { --color-*: initial; … }       Tailwind 기본 팔레트 · 크기 · radius · shadow 제거
    @utility typo-*                        --ds-* 타이포 변수 조합
  <html suppressHydrationWarning>          data-theme은 head 스크립트가 첫 paint 전에 넣는다
    <head><script>{themeInitScript}</script>   src/lib/theme.ts
    <body>
      (product)/layout.tsx → AppShell → header의 ThemeSwitch (공용 Switch)
      (auth)/layout.tsx    → 셸 없는 main 하나 (로그인 · 온보딩)
```

- **theme은 light / dark 두 가지이고 `<html data-theme>` 하나가 소유한다.** light는 공용 `:root`, dark는 공용 `[data-theme="dark"]` 값이다. body와 모든 공용 컴포넌트가 `<html>` 아래라 한 속성으로 함께 바뀐다
- 처음 방문하면 **시스템 설정(`prefers-color-scheme`)을 따르고**, 헤더의 "다크 모드" 스위치로 고르면 `localStorage`(`snapdone-theme`)에 저장해 그 선택이 이긴다. 선택이 없을 때는 시스템 설정이 바뀌면 즉시 따라간다
- 서버는 방문자의 theme을 모르므로 `data-theme`을 렌더하지 않는다. head 스크립트가 hydration 전에 넣어 **깜빡임이 없고**, 그 차이 때문에 `<html>`에만 `suppressHydrationWarning`을 둔다. JS가 없으면 `:root`(light)로 보인다
- `ThemeProvider`는 쓰지 않는다. 고정 `mode`의 `<div data-theme>`는 사용자 선택과 다른 두 번째 theme 주인이 된다. SSR에서 system mode를 처리하는 공용 API가 없다는 점은 upstream 요청 대상이다
- `color-scheme`을 theme에 맞춰 스크롤바 · 기본 form control도 함께 바뀐다
- Mobile은 시스템 설정을 따른다 — `useColorScheme()` → 공용 `ThemeProvider mode`, `app.json` `userInterfaceStyle: "automatic"`. 앱 안 전환 스위치는 아직 없다
- **공용 컴포넌트는 `@berrypjh/react-ui`에서 바로 import한다.** 1.1.1부터 hook을 쓰는 컴포넌트 모듈이 `'use client'`를 스스로 보존하므로 앱에 client 경계 파일을 두지 않는다

## Color

**공용 토큰 이름으로만 쓴다.** Tailwind 기본 팔레트는 `--color-*: initial`로 제거했으므로 `bg-blue-500` 같은 클래스는 존재하지 않는다.

| 쓰는 곳                   | Web class / CSS                                                | 공용 변수                                   | light 값                           |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| 페이지 바닥               | `body` `background-color`                                      | `--ds-background-surface`                   | `#FFFFFF`                          |
| 카드, 올라온 면           | `bg-background-surface`                                        | `--ds-background-surface`                   | `#FFFFFF`                          |
| 사이드바, 보조 블록       | `bg-background-default`                                        | `--ds-background-default`                   | `#F2F4F7`                          |
| 본문, 제목                | `body` `color` · `text-text-default`                           | `--ds-text-default`                         | `#101828`                          |
| 설명문 · 캡션 · 상태 문구 | `text-text-light`                                              | `--ds-text-light`                           | `#475467`                          |
| 구분선, 카드 테두리       | `border-stroke-light`                                          | `--ds-stroke-light`                         | `#D0D5DD`                          |
| 주요 동작                 | 공용 `Button variant="contained"` (로그인 "Google로 계속하기") | `--ds-primary-btn-*`                        | `#047857`                          |
| 포커스 링                 | 전역 `:focus-visible`                                          | `--ds-stroke-primary`                       | `#059669`                          |
| 완료 · 주의 · 실패        | `text-text-success` · `-warning` · `-error`                    | `--ds-text-success` · `-warning` · `-error` | `-error`만 로그인 오류 문구에서 씀 |

공용 토큰에 "muted text" 역할이 따로 없어 설명문과 캡션을 모두 `text-text-light`로 쓴다. `text-text-secondary`는 공용 라이브러리에서 **갈색 계열**이라 설명문에 쓰지 않는다.

## Typography

크기 차이는 작게 두고 굵기와 색으로 위계를 만든다. Web은 `global.css`의 `typo-*` utility로만 글자 스타일을 준다.

| 역할                | Web utility               | 공용 변수 접두사            | size / line-height / weight |
| ------------------- | ------------------------- | --------------------------- | --------------------------- |
| page title          | `typo-heading-h4`         | `--ds-heading-h4-*`         | 24 / 32 / 700               |
| card title · 제품명 | `typo-body-medium-strong` | `--ds-body-medium-strong-*` | 16 / 24 / 600               |
| body                | `typo-paragraph-default`  | `--ds-paragraph-default-*`  | 16 / 28 / 400               |
| caption             | `typo-caption-default`    | `--ds-caption-default-*`    | 14 / 20 / 400               |
| button              | `typo-body-medium-strong` | `--ds-body-medium-strong-*` | 16 / 24 / 600               |

**line-height는 공용 값을 따른다.** caption은 20/14 ≈ 1.43으로 한국어 기준(1.5 이상)보다 낮다 — 공용 라이브러리 우선 원칙에 따라 그대로 쓰고, 보편 기준 여부는 shared-stack upstream 과제로 올렸다.

폰트는 공용 변수의 font stack을 쓴다. **Pretendard는 설치하지 않았으므로** 실제로는 `'Apple SD Gothic Neo'` → `'Malgun Gothic'` → `system-ui`로 떨어진다.

```
Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif
```

### 한국어 줄바꿈

Web `body`에 `word-break: keep-all` · `overflow-wrap: break-word`를 건다. 이게 없으면 한글이 어절 중간에서 끊긴다.

## Spacing

**4px scale.** Web은 Tailwind 기본 `--spacing`(0.25rem) 숫자 단계를 쓴다.

```
4  8  12  16  20  24  32   →  p-1 p-2 p-3 p-4 p-5 p-6 p-8
```

**주의 — preset spacing 이름이 Tailwind 크기 이름을 가린다.** 공용 preset이 `spacing.sm … 7xl`을 추가하므로 `max-w-3xl`은 48rem이 아니라 `--ds-spacing-3xl`(2.5rem)이 된다. 본문 폭은 Tailwind 컨테이너 변수를 직접 참조한다.

### 고정 치수

| 대상           | 값                                    |
| -------------- | ------------------------------------- |
| 사이드바 너비  | 240px (`w-60`)                        |
| 헤더 높이      | Web 56px (`h-14`) / Mobile 56px       |
| 본문 최대 너비 | Web `max-w-(--container-3xl)` (48rem) |
| 최소 터치 타깃 | 44px (web `min-h-11`)                 |

## Radius

Tailwind 기본 radius는 `--radius-*: initial`로 제거했고 공용 preset 이름만 남는다.

| 이름         | Web 값 (`--ds-radius-*`) | Mobile 값 (`theme.tokens.radius`) | 쓰는 곳         |
| ------------ | ------------------------ | --------------------------------- | --------------- |
| `rounded-sm` | 6px                      | `sm` 6                            | 작은 태그, 인풋 |
| `rounded-md` | 8px                      | `md` 8                            | 버튼            |
| `rounded-lg` | 16px                     | `lg` 16                           | 카드            |

## Border / Shadow

- border는 `border-semanticBorder-divider`(`--ds-semantic-border-divider`, 1px) + `border-stroke-light`. 셸 구분선은 `border-r` · `border-b`(1px). Mobile은 `StyleSheet.hairlineWidth`
- shadow는 카드에만 `shadow-xs`(`--ds-shadow-xs`). Tailwind 기본 shadow는 제거했다
- **깊이는 shadow가 아니라 border와 배경색으로 만든다.** 떠 있는 느낌이 필요하면 먼저 `bg-background-default`를 검토한다

## Focus

Web은 전역 규칙 하나로 처리한다. component마다 focus 스타일을 따로 쓰지 않는다.

```css
:focus-visible {
  outline: var(--ds-semantic-border-default) solid var(--ds-stroke-primary);
  outline-offset: 2px;
}
```

Mobile은 터치 기반이라 focus 링 대신 pressed 상태와 `accessibilityRole`로 처리한다.

## Web Shell

`apps/web/src/components/app-shell.tsx`. `app/(product)/layout.tsx`가 제품 화면(홈 · 기록)을 이걸로 감싼다. 로그인 · 온보딩(`app/(auth)`)은 셸 없이 가운데 `main` 하나(`max-w-(--container-md)`)다.

```
┌──────────┬─────────────────────────────┐
│ sidebar  │ header (h-14)               │
│ (w-60)   ├─────────────────────────────┤
│ md 이상  │ main                        │
│ 에서만   │   max-w-(--container-3xl)   │
└──────────┴─────────────────────────────┘
```

- 사이드바는 `md`(48rem) 이상에서만 보인다. 그 아래에서는 사라지고 헤더가 제품명을 대신 표시한다
- 본문 너비는 48rem. 한국어 본문이 한 줄에 너무 길어지지 않는 폭이다
- 사이드바에 `nav aria-label="주요 메뉴"`로 **실제 route만** 둔다 — 홈 · 기록. 항목 높이는 `min-h-11`(44px). 없는 route로 가는 링크를 만들지 않는다
- 767px 이하에는 사이드바가 없으므로, 페이지 안 링크로 같은 route에 닿게 한다 (홈의 "기록 보기")
- 헤더 오른쪽에는 "다크 모드" 스위치와, 로그인했을 때만 "로그아웃" 버튼이 있다
- **폰 폭(320–767px)이 기본 사용 폭이다.** 같은 web이 앱 WebView로도 열리고 WebView는 항상 이 폭이다 ([target-architecture.md](../architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠))
- **앱 WebView(in-app 모드)에서는 셸을 그리지 않는다.** 네이티브가 헤더 · 뒤로 가기를 가지므로 web 헤더 · 사이드바를 숨기고 `main` 본문만 렌더링한다. 판별은 서버에서 User-Agent로 하므로 첫 HTML부터 적용된다 (`AppShell inApp`). SkipLink도 없다 — 건너뛸 셸이 없다
- in-app 화면과 네이티브 화면은 **같은 공용 토큰과 같은 시스템 theme**을 따른다. in-app 모드에는 헤더(다크 모드 스위치)가 없으므로 WebView 안의 web은 시스템 설정만 따른다

## Mobile Shell

`apps/mobile/src/app/App.tsx`(native stack) + `src/components/AppShell.tsx`(네이티브 화면 본문).

```
┌─────────────────────────┐
│ native stack header     │  제목 · 뒤로 가기 · top safe area
├─────────────────────────┤
│ Home: AppShell          │
│   ScrollView            │
│   padding spacing.lg/xl │
│   Stack gap="xl"        │
│ WebContent: WebView     │  web /history (셸 없는 in-app 모드)
│                         │
│ (bottom nav 자리)       │
└─────────────────────────┘
```

- **데스크톱 사이드바를 모바일에 복제하지 않는다.** 헤더 + 스크롤 본문 구조다
- 헤더는 native stack이 그린다. 색은 `navigationTheme`이 공용 토큰에서 만든다 — 배경 `background.surface`, 제목 `text.default`, 뒤로 가기 `text.primary`, 구분선 `stroke.light`. 글꼴은 플랫폼 기본이다. WebView 화면 제목은 web의 `ready` 메시지가 바꾼다. 홈 헤더 오른쪽에 "로그아웃"(`components/auth/LogoutButton`)이 있다
- 복원 · 로그인 · 온보딩 소개 화면은 native header 없이 `components/auth/AuthShell`이 상하좌우 inset을 모두 가진다
- `AppShell`의 `SafeAreaView` `edges`는 `['left','right']`다. top은 header가 가져간다. **bottom을 일부러 뺐다** — 나중에 bottom navigation이 하단 inset을 직접 가져가야 이중 패딩이 안 생긴다
- `android.edgeToEdgeEnabled: true`이므로 Safe Area 처리는 선택이 아니라 필수다
- **가짜 탭을 만들지 않는다.** 실제 화면이 생길 때 bottom navigation을 넣는다

### Mobile 토큰 쓰는 법

| 역할             | 코드                                                                    | web 대응                  |
| ---------------- | ----------------------------------------------------------------------- | ------------------------- |
| 화면 바닥 · 카드 | `getColor(theme, 'background.surface')` · `Box bg="background.surface"` | `bg-background-surface`   |
| 본문 · 제목 색   | `getColor(theme, 'text.default')`                                       | `text-text-default`       |
| 설명문 · 캡션 색 | `getColor(theme, 'text.light')`                                         | `text-text-light`         |
| 구분선 · 테두리  | `getColor(theme, 'stroke.light')` + `StyleSheet.hairlineWidth`          | `border-stroke-light`     |
| 본문 글자        | `textStyle(theme.tokens.typography.paragraph.default)`                  | `typo-paragraph-default`  |
| 캡션 글자        | `textStyle(theme.tokens.typography.caption.default)`                    | `typo-caption-default`    |
| 강조 글자        | `textStyle(theme.tokens.typography.body.mediumStrong)`                  | `typo-body-medium-strong` |
| 간격             | `theme.tokens.spacing.lg`(16) · `xl`(24) · `2xl`(32), `Stack gap`       | `p-4` · `p-6` · `p-8`     |

토큰 경로는 `pnpm --dir apps/mobile exec berry-react-native-ui token <path|prefix>`로 확인한다.

## Primitives

**Web에는 로컬 primitive가 없다.** 공용 라이브러리 컴포넌트를 `@berrypjh/react-ui`에서 바로 가져와 조합한다. 앱이 소유하는 것은 제품 셸 `AppShell`과 기능별 제품 조합(`components/auth/` · `in-app-*` · `theme-switch`)뿐이다.

| 쓰는 것                                            | 어디서                                  | 무엇에                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Box` `p="xl" bg="background.surface" radius="lg"` | `app/(product)/page.tsx`                | 카드 면. border(`border-semanticBorder-divider border-stroke-light`)와 `shadow-xs`는 class로 더한다 — `Box`에 border · shadow prop이 없다 |
| `Stack gap="xl"`                                   | `app/(product)/page.tsx`                | 제목 묶음과 카드를 세로로 쌓는다 (기본 방향 `column`)                                                                                     |
| `SkipLink targetId="main-content"`                 | `components/app-shell.tsx`              | 첫 키보드 정지점 "본문으로 건너뛰기". `<main id="main-content" tabIndex={-1}>`이 포커스를 받는다                                          |
| `Switch`                                           | `components/theme-switch.tsx`           | 헤더의 "다크 모드". 라벨이 접근 이름이다                                                                                                  |
| `Button variant="contained"`                       | `components/auth/google-login-form.tsx` | 로그인 "Google로 계속하기"                                                                                                                |
| `Button variant="text" size="sm"`                  | `components/app-shell.tsx`              | 헤더 "로그아웃"                                                                                                                           |

- `main` · `aside` · `header`는 `Box`로 바꾸지 않는다. 시맨틱 랜드마크가 우선이다
- 셸의 반응형 방향(`flex-col md:flex-row`)은 `Stack`에 반응형 prop이 없어 class로 둔다
- 버튼은 공용 `Button`을 쓴다. 로컬 primary는 `variant="contained" color="primary"`에 대응하고, 로컬 secondary를 공용 `color="secondary"`(보조 palette)로 자동 대응시키지 않는다

**Mobile도 로컬 primitive가 없다.** `@berrypjh/react-native-ui`에서 가져와 조합한다.

| 쓰는 것 (mobile)                                                           | 어디서                         | 무엇에                   |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| `ThemeProvider mode`                                                       | `app/App.tsx`                  | 시스템 라이트/다크       |
| `Stack gap="xl"`                                                           | `components/AppShell.tsx`      | 화면 본문 세로 배치      |
| `Box p="xl" bg="background.surface" radius="lg"` + hairline `stroke.light` | `screens/HomeScreen.tsx`       | 상태 문구 카드           |
| `Button variant="outlined"`                                                | `screens/HomeScreen.tsx`       | "기록 보기"              |
| `Button variant="contained"`                                               | `screens/WebContentScreen.tsx` | WebView 오류 "다시 시도" |

**Modal · Dropdown · Tabs · Toast · Bottom Sheet · Form wrapper는 만들지 않았다.** 필요해지면 공용 라이브러리 컴포넌트를 바로 import해 쓴다.

터치 타깃은 **최소 44px**이다. web은 `min-h-11`, mobile에서 직접 만드는 누를 수 있는 것도 44px을 지킨다. 공용 `Button` 크기는 라이브러리가 소유한다.

## ko-KR 원칙

- UI 텍스트는 한국어. 존댓말, 어미 통일
- 영어 AI 개발 용어를 화면에 노출하지 않는다 (`프롬프트`, `추론`, `confidence`, `routing` 등은 내부 용어)
- 한국어는 같은 뜻의 영어보다 길다. 버튼 라벨과 카드 제목에서 줄바꿈·말줄임을 항상 확인한다
- 날짜 `2026. 8. 16.` / 금액 `12,000원` / 전화번호 `010-1234-5678`

자세한 제품 판단 기준은 [docs/product/product-principles.md](../product/product-principles.md).
