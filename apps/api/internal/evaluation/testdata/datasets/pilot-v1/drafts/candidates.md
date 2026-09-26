# pilot-v1 case 후보

35-case 목표(category 7 × dev 3 · validation 1 · held-out 1) 중 **아직 사진도 정답도 없는 14건**. 사진이 생기고 검토가 끝나야 `validation.jsonl` · `held-out.jsonl`로 옮긴다. 수를 채우려고 정답을 지어내지 않는다.

dev 21건(category당 3건)은 채웠다 — 합성 텍스트 렌더(`fixtures/sources/*.txt` + `render.swift`)와 도형 한 장(`shapes.go`), `agent-visual` 검토, 읽어야 할 값(facts) 포함. 후보에서 달라진 것: `work-02`는 회의록이 주이고 끝에 다음 회의 일시가 있어 `adjudicated` `none` · `add_to_calendar`(canonical `none`), `foreign-text-03`은 날짜 · 장소가 없는 영어 환영 메일. validation · held-out은 **사람 검토(`human`)가 필요**하므로 AI 세션이 채울 수 없다.

## 필요한 사진의 조건

- 개인정보 없음(`drafts/rubric.md`의 privacy review)
- 같은 원본의 crop · 재압축은 같은 `sourceGroupId`로 묶고, 한 그룹은 한 split에만 둔다
- production 상한 안(7,500,000 byte, JPEG · PNG · GIF · WebP)
- 합성 렌더가 아닌 **실제 스크린샷 모양**이 validation · held-out에 최소 1건씩 있어야 pilot이 뜻을 가진다

## 후보 목록

| id 후보           | split      | category       | 사진 후보                      | 예상 intent · action           | 검토 |
| ----------------- | ---------- | -------------- | ------------------------------ | ------------------------------ | ---- |
| `place-04`        | validation | `place`        | 실제 스크린샷 모양의 가게 정보 | resolved `save_place`          | 없음 |
| `place-05`        | held-out   | `place`        | 실제 스크린샷 모양의 가게 정보 | resolved `save_place`          | 없음 |
| `event-04`        | validation | `event`        | 실제 포스터 모양               | resolved `add_to_calendar`     | 없음 |
| `event-05`        | held-out   | `event`        | 실제 포스터 모양               | resolved `add_to_calendar`     | 없음 |
| `receipt-04`      | validation | `receipt`      | 실제 영수증 모양               | resolved `record_expense`      | 없음 |
| `receipt-05`      | held-out   | `receipt`      | 실제 영수증 모양               | resolved `record_expense`      | 없음 |
| `foreign-text-04` | validation | `foreign_text` | 실제 외국어 안내판 모양        | resolved `translate`           | 없음 |
| `foreign-text-05` | held-out   | `foreign_text` | 실제 외국어 안내판 모양        | resolved `translate`           | 없음 |
| `shopping-04`     | validation | `shopping`     | 실제 상품 페이지 모양          | 검토자가 정함(unresolved 예상) | 없음 |
| `shopping-05`     | held-out   | `shopping`     | 실제 상품 페이지 모양          | 검토자가 정함                  | 없음 |
| `work-04`         | validation | `work`         | 실제 업무 문서 모양            | 검토자가 정함                  | 없음 |
| `work-05`         | held-out   | `work`         | 실제 업무 문서 모양            | 검토자가 정함                  | 없음 |
| `other-04`        | validation | `other`        | 실제 사진 모양                 | resolved `none`                | 없음 |
| `other-05`        | held-out   | `other`        | 실제 사진 모양                 | resolved `none`                | 없음 |

`work-02`처럼 일시가 있는 업무 문서는 category · action이 갈리므로 검토자 둘이 보고 `adjudicated`로 정하거나 `disputed`로 남긴다.

## 옮기는 절차

1. 사진을 `fixtures/`에 넣고 `sourceGroupId` · `generation`(출처 · 도구)을 적는다
2. `drafts/rubric.md`로 privacy review를 하고 `privacyReview: reviewed`로 적는다
3. 정답(`category` · `intent` · `acceptableActions` · `forbiddenActions`)과 `ambiguity`를 적고 검토 방법(`human` · `agent-visual`)을 남긴다
4. `sha256`을 계산해 case 한 줄을 해당 split 파일에 더하고 `manifest.json`의 `cases`를 맞춘다
5. `go -C apps/api test ./internal/evaluation -run TestLoadPilotDataset -count=1`로 loader를 통과시킨다
