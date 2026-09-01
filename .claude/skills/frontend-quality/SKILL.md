---
name: frontend-quality
description: web·mobile 화면 변경을 제품 기준으로 검수한다. 디자인 시스템 재사용, 상태 처리, 한국어 UX, 접근성, 디자인 토큰 준수를 확인한다.
when_to_use: Use after adding or changing UI in apps/web or apps/mobile, before reporting the screen as done. Also when deciding whether a new component should become a shared primitive.
argument-hint: '<dir|files> (생략 시 git 변경분의 web·mobile 화면)'
---

# frontend-quality

화면이 **동작하는지**가 아니라 **이 제품에 맞는지** 보는 단계다. 동작 검증은 `/repo-verify`가 한다.

`.claude/rules/`의 `web.md` · `mobile.md` · `ko-ui.md`가 지켜야 할 불변식을 이미 갖고 있다. 여기서는 그것들을 **어떻게 확인하는지**를 다룬다.

## 검수 순서

바꾼 화면을 열어놓고 아래를 차례로 본다. 해당 없는 항목은 건너뛰고, 건너뛴 이유를 보고에 적는다.

### 1. 재사용 — 새로 만들기 전에 있는 것을 썼는가

지금 있는 primitive는 이게 전부다.

| web                            | mobile                            |
| ------------------------------ | --------------------------------- |
| `Button` (primary / secondary) | `AppButton` (primary / secondary) |
| `Surface` (기본 / muted)       | `Surface` (기본 / muted)          |
| `AppShell`                     | `AppShell`                        |

- 새로 만든 컴포넌트가 위 중 하나로 되는 일을 다시 하고 있지 않은가
- 두 번째 화면에서도 쓸 것이 확실해진 것만 primitive로 올린다. 한 번 쓰는 것은 화면 안에 둔다
- **Modal · Sheet · Toast · Tabs · Input · Skeleton은 아직 없다.** 처음 만드는 사람이 형태를 정하게 되므로 `foundation.md`에 값을 함께 기록한다

### 2. 플랫폼 — 맞는 쪽에 맞는 방식으로 만들었는가

- web 구조를 mobile에 축소해 옮기지 않았는가. **같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다**
- 한쪽에만 만들었다면 다른 쪽 계획을 보고에 적었는가
- 플랫폼별 상세 점검은 [references/platform-checks.md](references/platform-checks.md)

### 3. 상태 — 네 가지를 다 설계했는가

**loading · empty · error · disabled.** 성공 경로만 만들고 끝내지 않는다.

- 실패했을 때 무엇이 잘못됐고 어떻게 하면 되는지 말하는가. 수동으로 할 방법을 주는가
- empty 화면이 "행동을 부르는 화면"인가, 그냥 비어 있는가
- 되돌릴 수 있는 실행에 되돌리기가 붙었는가. 되돌릴 수 없다면 실행 전에 확인을 받는가

### 4. 제품 언어 — 화면에 남는 마지막 문장이 결과인가

상세는 [references/product-ux.md](references/product-ux.md).

빠르게 볼 것: 완료 문장이 행동인가("캘린더에 등록했습니다") · 신뢰도·모델 이름·처리 로그가 화면에 없는가 · AI 개발 용어가 노출되지 않는가.

### 5. 한국어 — 실제로 넣어보고 깨지는지 봤는가

**읽어서 판단하지 말고 긴 문자열을 넣어본다.**

- 버튼 라벨과 카드 제목에 평소보다 긴 한국어를 넣었을 때 줄바꿈·말줄임이 어떻게 되는가
- web은 320px에서 가로 스크롤이 생기지 않는가 (`apps/web-e2e`가 이 계약을 고정한다)
- 존댓말 어미가 화면 안에서 섞이지 않는가

### 6. 토큰 — 정의된 값을 쓰는가

토큰 값의 기준은 [foundation.md](../../../docs/design/foundation.md) 하나다. 여기서는 **거기에 없는 값이 들어왔는지 실제로 훑는다.**

[references/product-ux.md](references/product-ux.md)의 grep 두 개를 돌리고, 걸린 것마다 **왜 토큰으로 안 되는지** 묻는다. 답하지 못하면 토큰을 쓴다. 새 값이 정말 필요하면 foundation.md에 추가하고 web·mobile 두 파일을 함께 고친다.

### 7. 접근성

[references/platform-checks.md](references/platform-checks.md)의 web·mobile 절차를 따른다. 코드로 확인 가능한 것과 실제 조작이 필요한 것이 구분돼 있다.

### 8. 확인하지 못한 것

**mobile은 이 환경에서 실행할 수 없다**(시뮬레이터 · Detox · Maestro 없음). web도 dev 서버 포트가 막혀 있어 실제 렌더링을 볼 수 없다.

그래서 위 항목 중 **눈으로 확인해야 하는 것은 코드 판독까지가 한계다.** 무엇을 코드로만 봤고 무엇을 실제로 확인했는지 구분해서 보고하고, 실행이 필요하면 사용자에게 요청한다.

## 보고

```
범위: <검수한 파일·디렉터리>

## 고친 것
- <항목 1~8 중 무엇> — <무엇을 어떻게>

## 남긴 것
- <항목> — <왜 그대로 두는 게 맞는지>

## 코드로만 확인한 것
- <실제 렌더링·조작으로 확인하지 못한 항목>
```

`코드로만 확인한 것`을 반드시 채운다. 이 환경에서는 mobile을 실행할 수 없고 web도 dev 서버를 띄울 수 없다.

## 기준 문서

값과 원칙의 원문은 [foundation.md](../../../docs/design/foundation.md)와 [product-principles.md](../../../docs/product/product-principles.md)다. 토큰 값을 바꾸게 되면 `foundation.md`를 먼저 고치고 두 플랫폼 파일을 함께 고친다.
