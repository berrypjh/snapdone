# 플랫폼별 검수 절차

`.claude/rules/web.md`와 `mobile.md`가 무엇이 옳은지를 정한다. 이 문서는 **그것을 어떻게 확인하는지**를 다룬다.

이 환경에서는 dev 서버 포트가 막혀 있고 시뮬레이터가 없다. 아래 항목 대부분은 **코드 판독으로 확인**하고, 실행이 필요한 것은 표시해 두었다.

---

# Web (`apps/web`)

## Server / Client 경계

```bash
grep -rn "'use client'" apps/web/src
```

- 현재는 셋이다 — `components/theme-switch.tsx`(change 핸들러 · `useSyncExternalStore` · `localStorage`), `components/auth/google-login-form.tsx`(`useActionState`), `components/in-app-message.tsx`(WebView `postMessage`). 새로 생겼다면 그 컴포넌트에 실제로 브라우저 상호작용(이벤트 핸들러 · `useState` · `useEffect` · 브라우저 API)이 있는지 확인한다
- **`layout.tsx`와 `page.tsx`에는 붙이지 않는다.** 필요한 leaf 컴포넌트로 내린다
- Client Component에서 `process.env.API_BASE_URL`을 읽고 있지 않은가 — 서버 전용 값이라 브라우저에서 `undefined`가 된다

## Semantic HTML

- 새 영역이 `<div>`가 아니라 맞는 요소인가 — `<header>` `<main>` `<aside>` `<nav>` `<section>` `<ul>/<li>` `<form>`
- landmark가 중복되지 않는가. `<main>`은 페이지당 하나다
- 제목 레벨이 건너뛰지 않는가 (`h1` → `h3`)
- 클릭 가능한 것이 `<div onClick>`이 아닌가

```bash
grep -rn 'onClick' apps/web/src --include='*.tsx' | grep -vE '<button|<a '
```

## 키보드와 포커스

- 마우스로만 되는 동작이 없는가. 열고 닫는 것, 선택하는 것이 키보드로 되는가
- 포커스 스타일을 컴포넌트에서 지우지 않았는가

```bash
grep -rnE 'outline-none|focus:outline-none|outline: *none' apps/web/src
```

포커스는 `global.css`의 전역 `:focus-visible` 하나로 처리한다. 컴포넌트가 이걸 덮으면 키보드 사용자가 위치를 잃는다.

- 모달·시트를 만들었다면 포커스가 그 안에 갇히고 닫을 때 원래 위치로 돌아오는가 (아직 이런 컴포넌트가 없으므로 처음 만드는 사람이 정한다)

## 반응형

브레이크포인트는 **`md`(768px) 하나**다. 그 외 단계를 새로 도입하려면 이유가 있어야 한다.

확인할 폭:

| 폭        | 확인할 것                                                            |
| --------- | -------------------------------------------------------------------- |
| 1280px    | 사이드바가 보이고 본문이 `max-w-(--container-3xl)`(48rem)로 묶이는가 |
| 768px     | 경계에서 사이드바가 보이는가                                         |
| 767px     | 사이드바가 사라지고 헤더가 제품명을 대신 표시하는가                  |
| **320px** | **가로 스크롤이 생기지 않는가** — 한국어가 길어 실제로 터진다        |

`apps/web-e2e/src/app-shell.spec.ts`가 이 폭들과 SkipLink 키보드 이동을 고정한다. `max-w-3xl`은 공용 preset spacing 이름에 가려 2.5rem이 되므로 쓰지 않는다. 셸을 바꿨으면 **실행이 필요하다**(`pnpm e2e` — 사용자에게 요청).

고정 폭(`w-[380px]` 같은 것)을 새로 넣지 않았는가 확인한다. 320px에서 넘친다.

## 브라우저 런타임

- 서버에서 실행되는 코드에 `window` · `document` · `localStorage`가 없는가
- 이미지에 크기가 지정돼 있는가. 레이아웃이 밀리지 않는가
- 콘솔 출력이 남아 있지 않은가

```bash
grep -rn 'console\.' apps/web/src
```

앱 소스에 `console.*`를 남기지 않는다.

---

# Mobile (`apps/mobile`)

**이 앱은 실행해서 확인할 방법이 없다.** 시뮬레이터 · Detox · Maestro가 모두 없으므로 아래는 전부 코드 판독이고, 실기기 확인이 필요한 것은 사용자에게 요청한다.

## Safe Area

- `SafeAreaView`의 `edges`를 바꾸지 않았는가. `AppShell`은 `['left','right']`다 — top은 native stack header가 가지고, **`bottom`은 일부러 빠져 있다**(bottom navigation이 하단 inset을 직접 가져가야 이중 패딩이 안 생긴다). header가 없는 인증 화면의 `AuthShell`만 네 방향을 모두 가진다
- 새 화면이 `AppShell` · `AuthShell` 밖에서 자기 `SafeAreaView`를 또 만들지 않았는가
- `android.edgeToEdgeEnabled: true`이므로 하단 콘텐츠가 시스템 제스처 영역에 깔리지 않는지 본다

## Status Bar

- `<StatusBar />`는 `App.tsx`에 하나만 있다. 화면마다 추가하지 않는다
- `<StatusBar />`는 기본 `auto`라 라이트/다크 배경에 맞는 아이콘 색을 고른다. `userInterfaceStyle`은 `automatic`이다 — `light`로 되돌리면 다크 theme이 켜지지 않는다

## 터치 타깃

```bash
grep -rnE 'height: *[0-9]|minHeight|paddingVertical' apps/mobile/src
```

누를 수 있는 것의 실제 높이가 **44px 이상**인가. `Text`를 `Pressable`로 감싸기만 하고 패딩을 안 준 경우가 흔하다. 아이콘 버튼은 시각 크기가 24여도 히트 영역이 44여야 한다.

## 키보드

입력이 생겼다면:

- 키보드가 입력창을 가리지 않는가 (`KeyboardAvoidingView` 또는 스크롤 오프셋)
- iOS와 Android의 동작이 다르다. `behavior`를 플랫폼별로 지정했는가
- `ScrollView`의 `keyboardShouldPersistTaps`가 필요한가. `AppShell`은 이미 `"handled"`다

## 스크롤과 목록

- 항목 수가 늘 수 있는 목록을 `ScrollView` + `map`으로 만들지 않았는가. 그런 경우 `FlatList`를 쓴다
- `AppShell`이 이미 `ScrollView`다. **그 안에 세로 `ScrollView`를 중첩하지 않는다**
- 목록 항목에 안정적인 `key`가 있는가 (인덱스 아님)

## 권한

- 권한을 **필요한 순간에** 요청하는가. 앱 시작 시점이 아니다
- 요청 전에 왜 필요한지 설명하는 화면이 있는가
- 거부했을 때의 경로가 있는가. 거부가 막다른 길이 되지 않아야 한다
- `app.json`에 필요한 선언을 추가했는가 (iOS usage description, Android permission)

## iOS / Android

한쪽만 보고 완료로 보고하지 않는다. 갈라지는 지점:

| 항목               | 차이                                        |
| ------------------ | ------------------------------------------- |
| 그림자             | iOS는 `shadow*`, Android는 `elevation`      |
| 하단 여백          | Android edge-to-edge에서 제스처 바가 겹친다 |
| 키보드 회피        | `behavior`가 다르다 (`padding` vs `height`) |
| 폰트 렌더링        | 같은 `fontSize`도 줄 높이가 다르게 보인다   |
| `Pressable` 피드백 | Android는 ripple, iOS는 opacity             |

## 스크린 리더

- 누를 수 있는 것에 `accessibilityRole="button"`이 있는가
- 비활성 상태를 `accessibilityState={{ disabled }}`로 알리는가
- 아이콘만 있는 버튼에 `accessibilityLabel`이 한국어로 있는가
- 제목에 `accessibilityRole="header"`가 있는가
- 장식용 이미지가 스크린 리더에 읽히지 않는가

## 콘솔

```bash
grep -rn 'console\.' apps/mobile/src
```

앱 소스에 남기지 않는다.
