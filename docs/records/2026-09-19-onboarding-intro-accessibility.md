# 온보딩 소개 화면을 스크린 리더가 완료로 읽도록 수정

예시 카드의 보이는 문구와 읽히는 문구를 분리하고, 화면이 열리면 제목으로 포커스 이동. 보이는 것은 "캘린더 등록", 읽히는 것은 "캘린더 등록 완료".

## 상황

앱의 첫 화면인 온보딩 소개는 예시 카드 세 장으로 제품을 설명 — 영수증 · 6,500원 → 지출 기록 완료 같은 짝. 스크린 리더로 읽어 보니 네 가지가 어긋난 상태였다.

- 결과 문구가 "캘린더 등록" · "서울 맛집 저장"으로 종결. 눈으로는 체크 표시(✓)가 완료를 말하지만 읽히는 문장에는 그 표시가 없음. [화면 규칙](../../.claude/rules/product-ui.md)은 화면에 남는 마지막 문장이 **완료된 행동**이어야 한다고 명시
- 카드 라벨이 `Box` 안에 한 겹 더 둔 `View`에 부착. 카드를 그리는 상자와 읽히는 상자가 불일치
- 화면이 열려도 접근성 포커스가 제목으로 이동하지 않음
- iOS에서 한국어 제목과 결과 문구가 단어 중간에서 끊김

## 판단

읽히는 문장을 위해 **보이는 문장을 늘리지 않았다.** 화면에 "캘린더 등록 완료"라고 쓰면 카드가 길어지고, 시각적으로는 체크 표시가 이미 같은 말을 한다. 스크린 리더에는 그 표시가 없으니 그쪽 문장만 완결시키는 쪽이 맞다고 봤다. 대신 두 문구가 갈라지므로 예시 데이터에 나란히 배치해 한쪽만 고치는 일을 차단.

## 반영

- 예시 데이터에 `spokenResult`를 추가해 **보이는 문구와 읽히는 문구를 분리**. 카드 라벨은 `<source>, <detail>, <spokenResult>`이고 `spokenResult`는 모두 "… 완료"로 종결
- 접근성 라벨을 감싸던 `View`를 제거하고 카드 `Box`가 직접 `accessible` 요소가 되게 조정. 카드 하나가 한 번에 읽힘
- 화면이 뜨면 제목에 `AccessibilityInfo.sendAccessibilityEvent(..., 'focus')`로 포커스 이동
- 제목과 결과 문구에 `lineBreakStrategyIOS="hangul-word"` 적용 — iOS는 한국어를 글자 단위로 끊는데, 이 값이 어절 단위로 끊게 함(iOS 전용)

![iOS 기본 줄바꿈은 어절 중간에서 끊기고, hangul-word는 어절 단위로 끊긴다](../images/records/onboarding-intro-linebreak.svg)

## 검증

- 읽히는 순서와 완료 문구는 코드로만 확인. VoiceOver · TalkBack 확인은 기기에서 필요

## 참고자료

- [Text](https://reactnative.dev/docs/text) — React Native. `lineBreakStrategyIOS`는 iOS 전용이고 `none` · `standard` · `hangul-word` · `push-out`을 받음
- [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo) — React Native. `sendAccessibilityEvent(host, 'focus')`로 스크린 리더 포커스를 이동. 받을 `View`는 `accessible` 필요
