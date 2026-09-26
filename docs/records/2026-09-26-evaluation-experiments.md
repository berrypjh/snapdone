# 평가에 기준선 · 여러 모델 · 실험 지시 · 비슷한 사례 · 계단식과 추출값 채점을 더함

같은 dataset과 채점기 위에서 모델 · 지시 · 예시 · 호출 순서를 바꿔 보고, 모델 없는 기준선과 나란히 비교할 수 있게 함. 제품 기준(Act)에 맞춰 추천 행동의 일치뿐 아니라 그 행동을 끝낼 값을 읽었는지, confidence high를 믿고 자동 실행해도 되는지를 잼.

## 상황

- harness는 production 분류기 하나를 부르는 측정 틀만 있었음. manifest의 `promptPath` · `rag` 등은 preflight 오류였고 비교 대상은 모델 이름뿐
- 비교할 기준선이 없어 모델 수치가 좋은지 나쁜지 판단할 기준이 없었음
- facts는 기록만 하고 채점하지 않아, 일정 등록을 추천해도 날짜를 못 읽었는지 알 수 없었음
- pilot-v1은 category당 1건이라 "비슷한 사례"를 찾을 같은 category 사례가 없었음

## 판단

- **production 동작은 바꾸지 않음** — 실험 지시는 분류기의 `WithInstructions` 복사본으로만 보냄. 서버는 부르지 않고 요청 문구 · 결과 schema · `parseResult` 검증은 그대로. manifest의 `expectedContractHash`는 계속 production hash이고 실험 지시는 `promptHash`로 따로 남김
- **기준선은 모델 없는 adapter** — provider `none`, 호출 0. 호출이 없으므로 `--allow-api` · 예산을 요구하지 않고, 모델 variant와 같은 채점 · 산출물 경로를 지남
- **예시는 dev에서만** — validation · held-out은 어떤 경우에도 예시가 되지 않고, 자신과 같은 원본 묶음(`sourceGroupId`)은 뺌. case id는 모델에 보내지 않음
- **검색은 표준 라이브러리만** — 사진을 줄인 밝기 격자의 cosine. 내용 기반 검색(embedding · 글자 추출 뒤 검색)은 의존성이나 추가 호출이 필요해 하지 않고, 대신 그 한계를 수치로 남김
- **추출값은 값만 봄** — 모델이 쓰는 label은 자유 문장이라 맞추지 않음. 금액은 수, 날짜 · 시간은 숫자 묶음, 글자는 공백 무시 포함. 모호한 표기는 정답에 여러 표기를 적음
- **pass 규칙은 그대로** — 추출값 · 자동 실행은 따로 보는 지표. `classification-pass-v1`을 바꾸면 이전 run과 비교가 끊김
- **산출물 v1 안의 선택 field** — `facts` · `calibration` · `retrieval` · `cascade`와 variant 실험 설정은 없으면 없는 대로 읽힘. 옛 요약과 비교하면 새 지표는 `unavailable`
- **dev를 계획대로 채움** — `drafts/candidates.md`의 dev 후보 14건을 합성 렌더로 만들어 category당 3건. 사진은 AI 세션이 눈으로 확인(`agent-visual`)했고 validation · held-out은 여전히 사람 검토 몫

## 반영

- `apps/api/internal/evaluation/` — `variant.go`(실험 설정 · 기준선 provider) · `baseline.go` · `retrieval.go` · `facts.go` · `classification.go`(추출값 · 자동 실행 점검 · 예시 · 계단식 집계) · `compare.go`(quality 축 다섯 줄) · `artifact.go`(`summary.md` 줄)
- `apps/api/internal/evaluation/processingadapter/adapter.go` — 실험 지시 · 예시 힌트 · 계단식
- `apps/api/internal/processing/` — 두 분류기의 `WithInstructions`
- `apps/api/internal/evalcli/` — `retrieve` 명령, 기준선만이면 opt-in 불필요, replay 기록의 `retrieval` · `cascade`
- `tools/evals/` — pilot-v1 dev 21건과 facts, 모델 · 실험 · 기준선 manifest, `variants/prompts/facts-normalized.md`, replay fixture 확장
- `apps/devhub/src/lib/evaluations` · `components/evals` — 새 field decoder, 품질 표 줄, variant 실험 설정, case의 예시 · 계단식 경로

## 검증

- Go 테스트는 가짜 Transport와 기준선으로만 돌았고 provider를 부르지 않음. 계단식은 첫 답이 low일 때만 두 번 부르고 호출 · token을 합치는 것, 실험 지시와 예시가 system 지시에 실리고 case id는 실리지 않는 것을 요청 본문으로 확인
- pilot의 facts 정답이 렌더 원문에 실제로 있는지를 테스트가 대조함
- 기준선 두 개를 pilot-v1 dev에 실제로 돌림(호출 0) — 둘 다 category 정확도 14.3%, 사례 복사 기준선은 금지 행동 33.3% · high인데 틀림 90.5%. `retrieve --k 3`은 첫 예시 적중 14.3%(무작위 약 10%) · MRR 0.230으로, 사진 배치 검색이 글자 사진에서 약함을 확인
- 실제 모델 호출과 모델 성능 측정은 하지 않았음
