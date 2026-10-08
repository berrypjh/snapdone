# 온보딩 사용 목적 단계 제거

온보딩 소개 다음의 사용 목적 선택 화면을 없앰. 고른 목적은 저장만 되고 어디에서도 쓰이지 않았음. 단계는 intro → first-image → complete가 됨.

## 상황

- 목적 선택지 8개 중 4개(맛집 / 카페 · 쇼핑 · 여행 · 일정 / 공연)는 처리 기능이 없었음. 바로 앞 소개 화면은 실행하지 않는 일을 약속하지 않음
- 고른 목적은 서버에 저장되지만 처리 · 처리 방식 · 홈 어디에서도 읽지 않음. 다시 들어왔을 때 미리 체크해 두는 데만 쓰임
- 지금 처리하는 사진(영수증 · 외국어 · 문서)만 남겨도, 목적으로 바뀌는 결과가 사실상 없음 — 영수증 · 외국어는 이미 서버 기본 처리 방식과 같음

## 판단

- **선택지 축소 대신 단계 제거** — 답이 결과를 바꾸지 않는 질문은 온보딩을 길게 할 뿐임. 목적별 기능이 생기면 그때 다시 물음
- **데이터도 함께 제거** — API `purposes` 필드, `profiles.onboarding_purposes` 컬럼, 단계 값 `purpose`를 모두 없앰. 쓰이지 않는 데이터를 계약에 남기지 않음
- **목적 단계에 있던 사용자는 첫 사진에서 이어 감** — migration이 `purpose`를 `first-image`로 옮김. 첫 사진 전에 다시 물을 것이 없음

## 반영

- Go — `onboarding.Progress`는 단계만, 저장할 수 있는 단계는 intro · first-image(`Validate` · `CanMove`). `OnboardingRequest` · `OnboardingResponse`에서 `purposes` 제거
- migration `0009_remove_onboarding_purpose.sql` — 단계 이동, 목적 컬럼 · 제약 삭제, 단계 CHECK에서 `purpose` 제거
- `libs/auth-contracts` `ONBOARDING_STEPS`에서 `purpose` 제거. `libs/onboarding`의 목적 규칙(`purposes.ts`) 삭제, 진행 계약은 단계만
- web — `/onboarding/purpose` page · 목적 양식 · 목적 Server Action 삭제. 시작하기가 바로 `/onboarding/first-image`로 보냄
- mobile — 목적 화면 · route 삭제. 온보딩 진행은 단계만 가짐
- web E2E fake API가 같은 계약을 따름

## 검증

- Go 단위 테스트 — `purpose` 단계 저장은 400(`invalid_onboarding`), intro → first-image 이동 허용
- lib · web · mobile 단위 테스트 — 진행 계약은 단계만 읽고, 없앤 `purpose` 단계는 거절
- web E2E — 시작하기 뒤 바로 첫 사진 화면
- migration은 DB 테스트에서 적용만 확인. `purpose` 단계 사용자를 옮기는지는 자동 테스트가 없음
