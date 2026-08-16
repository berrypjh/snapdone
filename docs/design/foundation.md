# Design Foundation

이 문서는 **토큰 값의 유일한 기준**이다. 값을 바꿀 때는 여기를 먼저 고치고, 그 다음 두 플랫폼 파일을 함께 고친다.

| 플랫폼 | 구현 파일                                            |
| ------ | ---------------------------------------------------- |
| Web    | `apps/web/src/app/global.css` (Tailwind v4 `@theme`) |
| Mobile | `apps/mobile/src/theme/tokens.ts`                    |

두 파일은 같은 값을 각자의 방식으로 적는다. 공용 라이브러리로 묶지 않는다 — 자세한 이유는 마지막 절.

## Design Principles

제품은 AI를 쓰지만 **AI 서비스처럼 보이지 않는다.** 생활형 생산성 도구처럼 보여야 한다.

**금지**

purple/blue gradient 남발 · neon glow · glassmorphism · sparkle · robot · AI badge 남발 · SF dashboard

**지향**

- 흰색/중립 배경, 색은 의미가 있을 때만
- 명확한 hierarchy — 크기보다 굵기와 색으로 구분
- accent는 하나. primary 파랑 외에 장식용 색을 추가하지 않는다
- border는 얇게 (1px, 모바일은 hairline)
- shadow는 카드 하나에만, 거의 보이지 않을 정도로
- 넉넉한 whitespace
- 읽기 쉬운 한국어

## Color

**역할 이름으로만 쓴다.** Tailwind 기본 팔레트는 `--color-*: initial`로 제거했으므로 `bg-blue-500` 같은 클래스는 존재하지 않는다. 이건 실수 방지 장치다.

| 역할              | 값        | 쓰는 곳                     |
| ----------------- | --------- | --------------------------- |
| `background`      | `#ffffff` | 페이지 바닥                 |
| `surface`         | `#ffffff` | 카드, 올라온 면             |
| `surface-muted`   | `#f6f7f9` | 사이드바, 보조 블록         |
| `text-primary`    | `#17191c` | 본문, 제목                  |
| `text-secondary`  | `#4a4f57` | 설명문                      |
| `text-muted`      | `#868c96` | 캡션, 상태 문구             |
| `border`          | `#e4e7ec` | 구분선, 카드 테두리         |
| `primary`         | `#1b64da` | 주요 동작                   |
| `primary-hover`   | `#1857c0` | web hover                   |
| `primary-pressed` | `#14489e` | web active / mobile pressed |
| `on-primary`      | `#ffffff` | primary 위 글자             |
| `success`         | `#0f7b4f` | 완료                        |
| `warning`         | `#b26b00` | 주의                        |
| `danger`          | `#c7362f` | 실패, 파괴적 동작           |
| `focus`           | `#1b64da` | 포커스 링                   |

`success` / `warning` / `danger`는 아직 화면에서 쓰이지 않는다. 이름을 미리 고정해 둔 것이며, 각 상태가 실제로 생길 때 이 값을 쓴다.

**gradient는 정의하지 않는다.** 필요하다고 느껴지면 그 화면 설계를 다시 본다.

## Typography

한국어 기준이다. 마케팅 히어로용 60~80px 제목은 없다. **크기 차이는 작게 두고 굵기와 색으로 위계를 만든다.**

| 역할          | 크기 | line-height | 굵기 |
| ------------- | ---- | ----------- | ---- |
| page title    | 24px | 1.4 (34px)  | 600  |
| section title | 18px | 1.5 (27px)  | 600  |
| card title    | 16px | 1.5 (24px)  | 600  |
| body          | 15px | 1.7 (26px)  | 400  |
| body small    | 14px | 1.7 (24px)  | 400  |
| caption       | 13px | 1.6 (21px)  | 400  |
| button        | 15px | 1.2 (18px)  | 600  |

Web은 비율(`1.7`), Mobile은 절대값(`26`)으로 쓴다. React Native가 비율을 받지 않기 때문이며, 위 표의 괄호 값이 그 환산 결과다.

**line-height를 줄이지 않는다.** 한글은 라틴 문자보다 세로로 꽉 차서 1.5 미만이면 답답해진다.

폰트는 **시스템 폰트**를 쓴다. 외부 폰트 패키지를 설치하지 않았다.

```
-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif
```

### 한국어 줄바꿈

Web `body`에 `word-break: keep-all`을 건다. 이게 없으면 한글이 어절 중간에서 끊긴다.

긴 한국어 문장을 넣었을 때 버튼·카드 제목이 깨지지 않는지 매번 확인한다.

## Spacing

**4px scale.** 이 값들만 쓴다.

```
4  8  12  16  20  24  32
```

Web은 Tailwind 기본 `--spacing`(0.25rem)을 그대로 두었으므로 `p-1 p-2 p-3 p-4 p-5 p-6 p-8`이 위 값에 정확히 대응한다. **`p-7`, `p-10` 같은 다른 단계는 쓰지 않는다.**

Mobile은 `space[1] … space[8]`로 같은 값을 쓴다.

### 고정 치수

여백이 아니라 **구성 요소의 크기**는 위 scale과 별개다. 지금 쓰는 값은 넷뿐이다.

| 대상           | 값                                   |
| -------------- | ------------------------------------ |
| 사이드바 너비  | 240px (`w-60`)                       |
| 헤더 높이      | Web 56px (`h-14`) / Mobile 56px      |
| 본문 최대 너비 | Web `max-w-3xl` (48rem)              |
| 최소 터치 타깃 | 44px (`min-h-11` / `minTouchTarget`) |

## Radius

세 단계뿐이다. Tailwind 기본 radius는 `--radius-*: initial`로 제거했다.

| 이름 | 값   | 쓰는 곳         |
| ---- | ---- | --------------- |
| `sm` | 6px  | 작은 태그, 인풋 |
| `md` | 10px | 버튼            |
| `lg` | 14px | 카드, Surface   |

component마다 다른 radius를 쓰지 않는다.

## Border / Shadow

- border는 `1px solid border` 하나. Mobile은 `StyleSheet.hairlineWidth`
- shadow는 `card` 하나뿐이다 — `0 1px 2px rgb(23 25 28 / 0.06)`. Tailwind 기본 shadow는 제거했다
- **깊이는 shadow가 아니라 border와 배경색으로 만든다.** 떠 있는 느낌이 필요하면 먼저 `surface-muted`를 검토한다

## Focus

Web은 전역 규칙 하나로 처리한다. component마다 focus 스타일을 따로 쓰지 않는다.

```css
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
```

Mobile은 터치 기반이라 focus 링 대신 pressed 상태와 `accessibilityRole`로 처리한다.

## Web Shell

`apps/web/src/components/app-shell.tsx`. `layout.tsx`가 모든 페이지를 이걸로 감싼다.

```
┌──────────┬─────────────────────────────┐
│ sidebar  │ header (h-14)               │
│ (w-60)   ├─────────────────────────────┤
│ md 이상  │ main                        │
│ 에서만   │   max-w-3xl, 가운데 정렬    │
└──────────┴─────────────────────────────┘
```

- 사이드바는 `md`(48rem) 이상에서만 보인다. 그 아래에서는 사라지고 헤더가 제품명을 대신 표시한다
- 본문 너비는 `max-w-3xl`. 한국어 본문이 한 줄에 너무 길어지지 않는 폭이다
- **사이드바에 아직 메뉴가 없다.** 실제 route가 생기기 전까지 깨진 링크를 만들지 않는다. 제품명만 둔다
- 헤더는 데스크톱에서 비어 있다. 자리를 잡아둔 것이다

## Mobile Shell

`apps/mobile/src/components/AppShell.tsx`.

```
┌─────────────────────────┐
│ safe area (top)         │
├─────────────────────────┤
│ header (56px)           │
├─────────────────────────┤
│ ScrollView              │
│   paddingHorizontal 20  │
│                         │
│ (bottom nav 자리)       │
└─────────────────────────┘
```

- **데스크톱 사이드바를 모바일에 복제하지 않는다.** 헤더 + 스크롤 본문 구조다
- `SafeAreaView`의 `edges`는 `['top','left','right']`. **bottom을 일부러 뺐다** — 나중에 bottom navigation이 하단 inset을 직접 가져가야 이중 패딩이 안 생긴다
- `android.edgeToEdgeEnabled: true`이므로 Safe Area 처리는 선택이 아니라 필수다
- **가짜 탭을 만들지 않는다.** 실제 화면이 생길 때 bottom navigation을 넣는다

## Primitives

지금 있는 것은 이게 전부다.

| Web                            | Mobile                            |
| ------------------------------ | --------------------------------- |
| `Button` (primary / secondary) | `AppButton` (primary / secondary) |
| `Surface` (기본 / muted)       | `Surface` (기본 / muted)          |

**Modal · Dropdown · Tabs · Toast · Bottom Sheet · Form wrapper는 만들지 않았다.** 실제 화면에서 필요해질 때 만든다.

### Button 상태

|                  | Web                        | Mobile                                         |
| ---------------- | -------------------------- | ---------------------------------------------- |
| default          | `bg-primary`               | `backgroundColor: primary`                     |
| hover            | `bg-primary-hover`         | 없음 (터치)                                    |
| focus            | 전역 `:focus-visible`      | 없음                                           |
| active / pressed | `bg-primary-pressed`       | `pressed` → `primaryPressed`                   |
| disabled         | `opacity-45`, hover 무효화 | `opacity: 0.45`, `accessibilityState.disabled` |

터치 타깃은 양쪽 모두 **최소 44px**(`min-h-11` / `minTouchTarget`)이다.

## ko-KR 원칙

- UI 텍스트는 한국어. 존댓말, 어미 통일
- 영어 AI 개발 용어를 화면에 노출하지 않는다 (`프롬프트`, `추론`, `confidence`, `routing` 등은 내부 용어)
- 한국어는 같은 뜻의 영어보다 길다. 버튼 라벨과 카드 제목에서 줄바꿈·말줄임을 항상 확인한다
- 날짜 `2026. 8. 16.` / 금액 `12,000원` / 전화번호 `010-1234-5678`

자세한 제품 판단 기준은 [docs/product/product-principles.md](../product/product-principles.md).

## 왜 토큰을 공유 라이브러리로 묶지 않았나

Web은 CSS 커스텀 프로퍼티가, Mobile은 JS 객체가 필요하다. 하나의 TS 모듈에서 양쪽을 뽑으려면 CSS 생성 단계를 붙여야 하는데, 토큰이 20여 개인 지금 그 빌드 복잡도는 값어치를 못 한다.

대신 **이 문서를 기준으로 삼고 두 파일에 같은 값을 적는다.** 두 구현 파일 상단에 서로를 가리키는 주석이 있다.

드리프트 위험은 실재한다. 토큰이 늘어나거나 실제로 어긋나는 일이 생기면 그때 `libs/design-tokens`를 만들고 web CSS를 생성하는 쪽으로 옮긴다. 지금 미리 만들지 않는 이유는 [target-architecture.md](../architecture/target-architecture.md)의 `libs/` 정책과 같다.
