# 사진 분류 평가 harness를 Go core와 CLI로 구현

provider · model · prompt가 바뀌어도 같은 dataset과 같은 채점기로 사진 분류 결과를 비교하는 harness. production 분류기를 그대로 부르고, 실제 provider 호출은 명시적 opt-in과 호출 예산이 있을 때만.

## 상황

- 사진 분류 seam은 `processing.Classifier.Classify(ctx, image, mediaType) (Result, error)` 하나. 지시 · schema · 허용 값은 package private
- 행동 실행(Act) · OCR · 번역은 production에 없음. `suggestedAction`은 enum 값이고 executor가 아님
- 모델을 바꿔 보려면 비교 기준이 있어야 하는데 dataset · 채점기 · 산출물이 없었음

## 판단

- **코어는 `apps/api` 안 Go 패키지** — production 생성자를 그대로 부를 수 있는 유일한 위치. 별도 module은 `internal`을 import하지 못하고, Node 스크립트는 서버 · DB가 필요함
- **enum · 지시를 베끼지 않음** — production에 read-only `DescribeContract`만 더하고 평가는 거기서 읽음. 지시가 바뀌면 hash가 바뀌어 manifest가 거절됨
- **없는 값을 0으로 만들지 않음** — `Measure`가 availability와 값을 함께 가짐. 실패 · timeout · 미실행은 정확도 분모에 남고 정답 0
- **정답을 모델에 보내지 않음** — adapter 입력 타입에 expected · annotation 필드가 없음
- **live 호출은 gate 뒤에만** — `--allow-api`와 `--max-api-calls`가 없으면 adapter를 만들지 않음. 예산은 SDK 재시도까지 셈
- **종합 점수 없음** — quality · reliability · latency · cost 네 축과 실행 수를 따로 둠. 비교 결론은 서술이고 통계적 유의성을 주장하지 않음
- **synthetic pilot을 golden으로 부르지 않음** — dev 7건은 합성 텍스트 렌더이고 validation · held-out은 사람 검토가 없어 비어 있음

## 반영

- `apps/api/internal/processing/contract.go` — `DescribeContract`
- `apps/api/internal/evaluation/` — wire 계약 · dataset loader · adapter와 observer transport · 분류 evaluator · runner · 산출물 · 비교 · text-extraction · translation evaluator
- `apps/api/cmd/eval/` — list · validate · plan · run · replay · report · compare
- `apps/api/project.json` — `eval` · `eval-check` target, `test` input에 `tools/evals`
- `tools/evals/` — pilot-v1 dataset · variant manifest 예시 · replay fixture · README
- `docs/architecture/agent-evaluation.md` — 설계 · 계약 · 운영 규칙

## 검증

- Go 테스트는 가짜 Transport만 쓰고 provider를 부르지 않음. plan · validate · replay · report · compare가 adapter를 만들지 않는 것을 생성자 · Transport 호출 수로 확인
- 빌드한 바이너리의 종료 코드(0 · 2 · 3)와 Nx 인자 전달(`nx run api:eval -- list`)을 실제 실행으로 확인
- replay 두 variant의 비교에서 일부러 바꾼 category · action이 newly failed로, timeout · failed가 newly errored로 나타남
- 실제 provider 호출과 모델 성능 측정은 하지 않았음
