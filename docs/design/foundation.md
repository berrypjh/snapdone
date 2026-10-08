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
      (product)/layout.tsx → AppShell (헤더 · 사이드바 · 하단 탭)
      (auth)/layout.tsx    → 셸 없는 main 하나 (로그인 · 온보딩)
```

- **theme은 light / dark 두 가지이고 `<html data-theme>` 하나가 소유한다.** light는 공용 `:root`, dark는 공용 `[data-theme="dark"]` 값이다. `color-scheme`도 함께 바뀌어 스크롤바 · 기본 form control이 따라온다
- **처음에는 시스템 설정(`prefers-color-scheme`)을 따른다.** 내 정보(`/me`)의 "다크 모드" 스위치로 고르면 `localStorage`(`snapdone-theme`)에 저장해 그 선택이 이긴다
- 서버는 theme을 모르므로 `data-theme`을 렌더하지 않는다. head 스크립트가 hydration 전에 넣어 깜빡임이 없고, 그래서 `<html>`에만 `suppressHydrationWarning`을 둔다
- `ThemeProvider`는 쓰지 않는다. 고정 `mode`의 `<div data-theme>`는 두 번째 theme 주인이 된다
- Mobile은 시스템 설정을 따른다 — `useColorScheme()` → 공용 `ThemeProvider mode`, `app.json` `userInterfaceStyle: "automatic"`. 앱 안 전환 스위치는 없다
- **공용 컴포넌트는 `@berrypjh/react-ui`에서 바로 import한다.** 패키지가 `'use client'`를 보존하므로 앱에 client 경계 파일을 두지 않는다

## Color

**공용 토큰 이름으로만 쓴다.** Tailwind 기본 팔레트는 `--color-*: initial`로 제거했으므로 `bg-blue-500` 같은 클래스는 존재하지 않는다.

| 쓰는 곳                   | Web class / CSS                                                | 공용 변수                                   | light 값  |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------- | --------- |
| 페이지 바닥               | `body` `background-color`                                      | `--ds-background-surface`                   | `#FFFFFF` |
| 카드, 올라온 면           | `bg-background-surface`                                        | `--ds-background-surface`                   | `#FFFFFF` |
| 사이드바, 보조 블록       | `bg-background-default`                                        | `--ds-background-default`                   | `#F2F4F7` |
| 본문, 제목                | `body` `color` · `text-text-default`                           | `--ds-text-default`                         | `#101828` |
| 설명문 · 캡션 · 상태 문구 | `text-text-light`                                              | `--ds-text-light`                           | `#475467` |
| 구분선, 카드 테두리       | `border-stroke-light`                                          | `--ds-stroke-light`                         | `#D0D5DD` |
| 주요 동작                 | 공용 `Button variant="contained"` (로그인 "Google로 계속하기") | `--ds-primary-btn-*`                        | `#047857` |
| 포커스 링                 | 전역 `:focus-visible`                                          | `--ds-stroke-primary`                       | `#059669` |
| 완료 · 주의 · 실패        | `text-text-success` · `-warning` · `-error`                    | `--ds-text-success` · `-warning` · `-error` | —         |

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

**line-height는 공용 값을 따른다.** caption은 20/14 ≈ 1.43으로 한국어 기준(1.5 이상)보다 낮다 — 공용 라이브러리 우선 원칙에 따라 그대로 쓴다.

폰트는 공용 변수의 font stack을 쓴다. web은 root layout이 Pretendard 가변 글꼴(dynamic subset)을 CDN에서 불러오고, 실패하면 다음 글꼴로 떨어진다. mobile은 글꼴 파일이 없어 시스템 글꼴이다.

```
Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif
```

### 한국어 줄바꿈

Web `body`에 `word-break: keep-all` · `overflow-wrap: break-word`를 건다. 없으면 한글이 어절 중간에서 끊긴다.

## Spacing

**4px scale.** Web은 Tailwind 기본 `--spacing`(0.25rem) 숫자 단계를 쓴다.

```
4  8  12  16  20  24  32   →  p-1 p-2 p-3 p-4 p-5 p-6 p-8
```

**주의 — preset spacing 이름이 Tailwind 크기 이름을 가린다.** 공용 preset이 `spacing.sm … 7xl`을 추가하므로 `max-w-3xl`은 48rem이 아니라 `--ds-spacing-3xl`(2.5rem)이 된다. 본문 폭은 Tailwind 컨테이너 변수를 직접 참조한다.

### 고정 치수

| 대상           | 값                                       |
| -------------- | ---------------------------------------- |
| 사이드바 너비  | 240px (`w-60`)                           |
| 헤더 높이      | Web 56px (`h-14`) / Mobile 56px          |
| 본문 최대 너비 | Web `max-w-(--container-3xl)` (48rem)    |
| 본문 좌우 여백 | Web `px-4`(16px), `md` 이상 `px-6`(24px) |
| 최소 터치 타깃 | 44px (web `min-h-11`)                    |

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

`apps/web/src/components/app-shell.tsx`가 제품 화면(`app/(product)`)을 감싼다. 로그인 · 온보딩(`app/(auth)`)은 셸 없이 가운데 `main` 하나(`max-w-(--container-md)`)다.

```
┌──────────┬─────────────────────────────┐
│ sidebar  │ header (h-14)               │
│ (w-60)   ├─────────────────────────────┤
│ md 이상  │ main                        │
│ 에서만   │   max-w-(--container-3xl)   │
└──────────┴─────────────────────────────┘
```

- **폰 폭(320–767px)이 기본 사용 폭이다.** WebView는 항상 이 폭이다 ([target-architecture.md](../architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠))
- **셸 폭** — 최대 1440px, 가운데 정렬. 바깥은 `background.default`라 넓은 화면에서 양옆 여백이 구분된다(그때만 셸 양옆에 `stroke.light` 선). 창이 좁아지면 여백이 먼저 사라진다
- **본문** — 최대 48rem(한국어 한 줄이 너무 길지 않은 폭). 아래 여백은 main의 `py-8`(앱 안 `py-6`)에 `pb-5xl`(64px)이 더해져 마지막 버튼 · 카드가 화면 끝이나 하단 탭에 붙지 않는다. 로그인 · 온보딩 화면도 같다
- **고정 헤더** — 헤더(56px)와 넓은 화면의 사이드바는 고정, 본문만 스크롤된다. 포커스가 헤더 · 하단 탭 아래로 숨지 않게 `scroll-padding`을 그 높이만큼 둔다
- **메뉴는 실제 route만** — `md`(48rem) 이상은 사이드바(`nav aria-label="주요 메뉴"`, 홈 · 기록, 항목 `min-h-11`), 767px 이하는 **하단 탭**(홈 · 기록 · 내 정보, `aria-current`). 앱도 같은 구성의 네이티브 탭이다
- **하위 화면의 뒤로 가기** — 처리 결과 · 사진 처리 · 처리 설정은 모든 폭에서 헤더 왼쪽이 "‹ 화면 제목"(앱의 화면 헤더와 같음)이다. 브라우저 뒤로 가기가 아니라 정한 상위 화면(기록 · 홈 · 내 정보)으로 간다. 탭 화면의 헤더 왼쪽은 폰 폭에서만 제품명이다
- **내 정보(`/me`)** — 기본 처리 설정 · 다크 모드 · 로그아웃을 모은다. 넓은 화면의 헤더 오른쪽에는 로그인했을 때 "내 정보" 링크 하나, 로그인 전에는 다크 모드 스위치가 있다
- **홈 목록은 3개까지** — 최근 처리 · 확인이 필요한 처리는 `HOME_LIST_LIMIT`(3)개만 보이고 나머지는 "전체 보기"(기록)다
- **앱 WebView(in-app 모드)에서는 셸을 그리지 않는다.** 네이티브가 헤더 · 뒤로 가기를 가지므로 `main` 본문만 렌더링한다. 서버가 User-Agent로 판별해 첫 HTML부터 적용된다. SkipLink도 없다
- in-app 화면은 네이티브 화면과 **같은 공용 토큰과 같은 시스템 theme**을 따른다. 내 정보를 열지 않으므로 시스템 설정만 따른다

## Mobile Shell

`apps/mobile/src/app/App.tsx`(native stack) → `src/app/MainTabs.tsx`(하단 탭) + `src/components/AppShell.tsx`(네이티브 화면 본문).

```
┌─────────────────────────┐
│ header                  │  제목 · top safe area (탭 화면은 탭 헤더, 세부 화면은 stack 헤더 + 뒤로 가기)
├─────────────────────────┤
│ Home: AppShell          │
│   ScrollView            │
│   padding spacing.lg/xl │
│ History: WebView        │  web /history (셸 없는 in-app 모드)
│ Me: AppShell            │
├─────────────────────────┤
│ 홈 · 기록 · 내 정보      │  하단 탭 · bottom safe area
└─────────────────────────┘
  세부 화면(사진 흐름 · 처리 결과 WebContent)은 탭 위 stack에 쌓인다
```

- **데스크톱 사이드바를 모바일에 복제하지 않는다.** 헤더 + 스크롤 본문 구조다
- 헤더는 native stack이 그리고, 색은 `navigationTheme`이 공용 토큰에서 만든다. WebView 화면 제목은 web의 `ready` 메시지가 바꾼다
- native header가 없는 화면(복원 · 로그인 · 온보딩 소개)은 `components/auth/AuthShell`이 상하좌우 inset을 모두 가진다
- `AppShell`의 `SafeAreaView` `edges`는 `['left','right']`다. top은 header가 가져간다. **bottom은 하단 탭이 가진다** — 이중 패딩이 생기지 않게 `AppShell`은 비워 둔다
- `android.edgeToEdgeEnabled: true`이므로 Safe Area 처리는 선택이 아니라 필수다
- **하단 탭은 실제 화면만 둔다** — 홈 · 기록(web 기록 WebView) · 내 정보. 기록 탭의 처리 결과 링크는 탭 위 `WebContent`로 쌓여 네이티브 뒤로 가기로 기록에 돌아온다

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

**Web에는 로컬 primitive가 없다.** 공용 라이브러리 컴포넌트를 `@berrypjh/react-ui`에서 바로 가져와 조합한다. 앱이 소유하는 것은 제품 셸과 기능별 제품 조합뿐이다.

| 쓰는 것                                            | 무엇에                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Box` `p="xl" bg="background.surface" radius="lg"` | 카드 면. border(`border-semanticBorder-divider border-stroke-light`)와 `shadow-xs`는 class로 더한다 — prop이 없다 |
| `Stack gap="xl"`                                   | 제목 묶음과 카드를 세로로 쌓는다                                                                                  |
| `SkipLink targetId="main-content"`                 | 첫 키보드 정지점 "본문으로 건너뛰기"                                                                              |
| `Switch`                                           | 내 정보의 "다크 모드"(로그인 전에는 헤더). 라벨이 접근 이름이다                                                   |
| `Button variant="contained"`                       | 로그인 "Google로 계속하기"                                                                                        |
| `Button variant="text" size="sm"`                  | 내 정보 "로그아웃"                                                                                                |

- `main` · `aside` · `header`는 `Box`로 바꾸지 않는다. 시맨틱 랜드마크가 우선이다
- 셸의 반응형 방향(`flex-col md:flex-row`)은 `Stack`에 반응형 prop이 없어 class로 둔다
- 버튼은 공용 `Button`을 쓴다. 로컬 primary는 `variant="contained" color="primary"`에 대응하고, 로컬 secondary를 공용 `color="secondary"`(보조 palette)로 자동 대응시키지 않는다

**Mobile도 로컬 primitive가 없다.** `@berrypjh/react-native-ui`에서 가져와 조합한다.

| 쓰는 것 (mobile)                                                           | 무엇에                   |
| -------------------------------------------------------------------------- | ------------------------ |
| `ThemeProvider mode`                                                       | 시스템 라이트/다크       |
| `Stack gap="xl"`                                                           | 화면 본문 세로 배치      |
| `Box p="xl" bg="background.surface" radius="lg"` + hairline `stroke.light` | 홈 · 내 정보 영역 카드   |
| `Button variant="outlined"`                                                | "설정 변경"              |
| `Button variant="contained"`                                               | WebView 오류 "다시 시도" |

**아이콘은 lucide다** — web `lucide-react`, mobile `lucide-react-native`. 공용 패키지에 아이콘이 없어서다. 아이콘은 장식이라 web은 `aria-hidden`을 붙이고 뜻은 옆 글자가 전한다. 색은 web이 `currentColor`, mobile이 `getColor(theme, …)`다.

**Modal · Dropdown · Tabs · Toast · Bottom Sheet · Form wrapper를 로컬로 만들지 않는다.** 필요하면 공용 라이브러리 컴포넌트를 바로 쓴다.

직접 만드는 누를 수 있는 것은 **최소 44px**이다(web `min-h-11`). 공용 `Button` 크기는 라이브러리가 소유한다.

## ko-KR 원칙

언어 · 표기 형식 규칙은 [product-principles.md의 한국 사용자 UX 원칙](../product/product-principles.md#한국-사용자-ux-원칙)이 기준이다. 버튼 라벨 · 카드 제목의 줄바꿈 · 말줄임은 화면마다 확인한다.
