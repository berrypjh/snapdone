# pilot-v1 case 후보

35-case 목표(category 7 × dev 3 · validation 1 · held-out 1) 중 **아직 사진도 정답도 없는 28건**. 사진이 생기고 검토가 끝나야 `dev.jsonl` · `validation.jsonl` · `held-out.jsonl`로 옮긴다. 수를 채우려고 정답을 지어내지 않는다.

지금 있는 것은 dev 7건(category당 1건, 합성 텍스트 렌더, `agent-visual` 검토)뿐이다. validation · held-out은 **사람 검토(`human`)가 필요**하므로 AI 세션이 채울 수 없다.

## 필요한 사진의 조건

- 개인정보 없음(`drafts/rubric.md`의 privacy review)
- 같은 원본의 crop · 재압축은 같은 `sourceGroupId`로 묶고, 한 그룹은 한 split에만 둔다
- production 상한 안(7,500,000 byte, JPEG · PNG · GIF · WebP)
- 합성 렌더가 아닌 **실제 스크린샷 모양**이 validation · held-out에 최소 1건씩 있어야 pilot이 뜻을 가진다

## 후보 목록

| id 후보           | split      | category       | 사진 후보                                  | 예상 intent · action                        | 검토 |
| ----------------- | ---------- | -------------- | ------------------------------------------ | ------------------------------------------- | ---- |
| `place-02`        | dev        | `place`        | 지도 앱의 가게 상세(합성 이름)             | resolved `save_place`                       | 없음 |
| `place-03`        | dev        | `place`        | 블로그 맛집 소개 캡처(합성)                | resolved `save_place`                       | 없음 |
| `place-04`        | validation | `place`        | 실제 스크린샷 모양의 가게 정보             | resolved `save_place`                       | 없음 |
| `place-05`        | held-out   | `place`        | 실제 스크린샷 모양의 가게 정보             | resolved `save_place`                       | 없음 |
| `event-02`        | dev        | `event`        | 예약 확인 화면(합성)                       | resolved `add_to_calendar`                  | 없음 |
| `event-03`        | dev        | `event`        | 모임 초대 메시지 캡처(합성)                | resolved `add_to_calendar`                  | 없음 |
| `event-04`        | validation | `event`        | 실제 포스터 모양                           | resolved `add_to_calendar`                  | 없음 |
| `event-05`        | held-out   | `event`        | 실제 포스터 모양                           | resolved `add_to_calendar`                  | 없음 |
| `receipt-02`      | dev        | `receipt`      | 온라인 주문 내역(합성)                     | resolved `record_expense`                   | 없음 |
| `receipt-03`      | dev        | `receipt`      | 종이 영수증 사진 모양(합성)                | resolved `record_expense`                   | 없음 |
| `receipt-04`      | validation | `receipt`      | 실제 영수증 모양                           | resolved `record_expense`                   | 없음 |
| `receipt-05`      | held-out   | `receipt`      | 실제 영수증 모양                           | resolved `record_expense`                   | 없음 |
| `foreign-text-02` | dev        | `foreign_text` | 일본어 메뉴판(합성)                        | resolved `translate`                        | 없음 |
| `foreign-text-03` | dev        | `foreign_text` | 영어 이메일 본문(합성)                     | resolved `translate`                        | 없음 |
| `foreign-text-04` | validation | `foreign_text` | 실제 외국어 안내판 모양                    | resolved `translate`                        | 없음 |
| `foreign-text-05` | held-out   | `foreign_text` | 실제 외국어 안내판 모양                    | resolved `translate`                        | 없음 |
| `shopping-02`     | dev        | `shopping`     | 장바구니 화면(합성)                        | unresolved                                  | 없음 |
| `shopping-03`     | dev        | `shopping`     | 상품 비교 화면(합성)                       | unresolved                                  | 없음 |
| `shopping-04`     | validation | `shopping`     | 실제 상품 페이지 모양                      | 검토자가 정함(unresolved 예상)              | 없음 |
| `shopping-05`     | held-out   | `shopping`     | 실제 상품 페이지 모양                      | 검토자가 정함                               | 없음 |
| `work-02`         | dev        | `work`         | 회의 안내 — 일시 포함(합성)                | adjudicated `add_to_calendar` · `none` 예상 | 없음 |
| `work-03`         | dev        | `work`         | 보고서 표 캡처(합성)                       | resolved `none`                             | 없음 |
| `work-04`         | validation | `work`         | 실제 업무 문서 모양                        | 검토자가 정함                               | 없음 |
| `work-05`         | held-out   | `work`         | 실제 업무 문서 모양                        | 검토자가 정함                               | 없음 |
| `other-02`        | dev        | `other`        | 풍경 · 무늬 등 텍스트 없는 사진(합성 도형) | resolved `none`                             | 없음 |
| `other-03`        | dev        | `other`        | 앱 설정 화면(합성)                         | resolved `none`                             | 없음 |
| `other-04`        | validation | `other`        | 실제 사진 모양                             | resolved `none`                             | 없음 |
| `other-05`        | held-out   | `other`        | 실제 사진 모양                             | resolved `none`                             | 없음 |

`work-02`처럼 일시가 있는 업무 문서는 category · action이 갈리므로 검토자 둘이 보고 `adjudicated`로 정하거나 `disputed`로 남긴다.

## 옮기는 절차

1. 사진을 `fixtures/`에 넣고 `sourceGroupId` · `generation`(출처 · 도구)을 적는다
2. `drafts/rubric.md`로 privacy review를 하고 `privacyReview: reviewed`로 적는다
3. 정답(`category` · `intent` · `acceptableActions` · `forbiddenActions`)과 `ambiguity`를 적고 검토 방법(`human` · `agent-visual`)을 남긴다
4. `sha256`을 계산해 case 한 줄을 해당 split 파일에 더하고 `manifest.json`의 `cases`를 맞춘다
5. `go -C apps/api test ./internal/evaluation -run TestLoadPilotDataset -count=1`로 loader를 통과시킨다
