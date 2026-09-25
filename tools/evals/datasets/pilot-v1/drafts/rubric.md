# pilot-v1 annotation rubric

`guideline: pilot-v1-rubric`가 가리키는 지침. 정답을 적는 사람과 검토하는 사람이 같은 기준을 쓰기 위한 것이고, 모델 prompt에는 넣지 않는다.

## category

production 계약(`processing.DescribeContract().Categories`)의 값만 쓴다. 사진이 **주로** 무엇인지로 정한다.

| category       | 이렇게 보이면                                           | 아니면                                        |
| -------------- | ------------------------------------------------------- | --------------------------------------------- |
| `place`        | 가게 · 장소 이름과 주소 · 영업시간 · 지도 · 위치 정보   | 결제 기록이 주면 `receipt`                    |
| `event`        | 공연 · 예약 · 모임 · 포스터 — 날짜 · 시간 · 장소가 있음 | 이미 결제한 내역이면 `receipt`                |
| `receipt`      | 결제 · 영수증 · 주문 내역 — 품목 · 합계 · 결제 수단     | 가격표 · 상품 소개는 `shopping`               |
| `foreign_text` | 본문이 주로 외국어 텍스트                               | 외국어가 상표 · 한두 단어뿐이면 내용으로 정함 |
| `shopping`     | 상품명 · 가격 · 구매 버튼 · 배송 정보                   | 결제 완료면 `receipt`                         |
| `work`         | 업무 문서 — 회의 · 할 일 · 보고 · 사내 안내             | 일정 하나가 주면 `event`                      |
| `other`        | 위 어디에도 맞지 않음                                   |                                               |

## intent와 action

행동은 production 계약의 값(`save_place` · `add_to_calendar` · `record_expense` · `translate` · `none`)만 쓴다. **하나로 강제하지 않는다.**

- **`resolved`** — 사진만 보고 사용자가 하려는 일이 하나로 정해짐. `acceptableActions`는 그 하나
- **`adjudicated`** — 둘 이상이 모두 맞다고 검토자가 판정. `acceptableActions`에 전부 적고 `notes`에 이유를 씀
- **`unresolved`** — 사진만으로 의도를 정할 수 없음. `acceptableActions`는 비우고 routing은 채점하지 않음
- **`forbiddenActions`** — 절대 나오면 안 되는 행동. **run 전에** 정하고, 결과를 보고 고치지 않는다

## ambiguity

- **`none`** — 검토자 둘이 같은 답을 낼 것이 분명함
- **`low`** — 다른 답이 나올 수 있으나 `notes`로 설명이 됨
- **`high`** — 판정이 갈릴 수 있음. 채점에 쓰지 않고 `disputed`나 `drafts/`로 보냄

## difficulty

- **`easy`** — 텍스트가 크고 정보가 한 종류
- **`medium`** — 정보가 섞여 있거나 일부가 잘림
- **`hard`** — 흐림 · 회전 · 손글씨 · 여러 화면이 겹침

## privacy review — 사람의 책임

코드는 `privacyReview: reviewed`라는 값만 본다. 실제로 봤는지는 검토자의 책임이다.

- 실제 사람의 이름 · 전화번호 · 계좌 · 주소 · 얼굴 · 차량 번호가 없다
- 실제 가게 · 단체를 특정하는 정보가 없다(합성 이름만)
- 스크린샷이면 알림 · 상태 표시줄 · 다른 앱의 내용이 잘렸다
- 위 조건을 만족하면 `privacy`를 `synthetic` · `no-personal-data` · `redacted` 중 맞는 것으로, `privacyReview`를 `reviewed`로 적는다

## review method

- **`agent-visual`** — AI 세션이 렌더한 합성 사진을 눈으로 확인한 것. **dev에서만** 채점에 쓴다
- **`human`** — 사람이 사진과 정답을 함께 본 것. validation · held-out은 이것만 채점에 쓴다

검토를 마치면 `annotation.review`를 `reviewed`로 바꾸고, 판정이 갈리면 `disputed`로 남긴다. 정답을 고치면 `revision`을 올린다.
