# OCR · 번역 · 제품 유형 판단 실험

`text/extract_and_translate`를 개선하기 위한 실험 계획과, Go 평가 과제로 넘길 입력이다. 연구 전용이고 점수는 Go(`pnpm eval replay`)만 낸다.

## 이름

| 이름                    | 가리키는 것                                                                                        | 답                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `image-classification`  | `Classifier.Classify`(`apps/api/internal/processing/result.go`) — 평가 계약, hash 고정             | category · facts · suggestedAction · confidence |
| `image-typing`          | 제품 `Typer.TypeImage`(`typing.go`) — 처리 경로를 정한다                                           | text · receipt · unsupported · ambiguous        |
| `text-extraction`       | 이미지 → 읽은 원문. 제품 `extract_text` 응답 모양(`readable` · `original`)                         | 원문                                            |
| `translation`           | 확정 원문 · 출발 언어 · 목표 언어 → 번역. 제품 번역 필드 모양(`translationNeeded` · `translation`) | 번역                                            |
| `extract-and-translate` | 제품 통합 동작(`action.go` `translateSpec`) — 이미지 한 번에 원문 + 번역                           | 원문 · 번역                                     |

분류 결과를 유형 판단의 정답이나 예측으로 바꾸지 않는다. 둘은 다른 지시 · 다른 계약이다.

## 비교 대상과 기준선

제품 비교 대상은 기존 통합 동작이다. 운영 모델은 `PROCESSING_MODEL` 하나를 분류 · 유형 판단 · 실행이 함께 쓰므로, 모델만 바꾸는 후보는 이 단계에서 운영에 넣지 않는다.

| 기준선                 | 입력      | 후보 설정                                                                               | 상태                                          |
| ---------------------- | --------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| 같은 이미지(제품 통합) | 이미지    | `prompts/product-extract-and-translate.md` · 운영 모델                                  | **미측정** — 실제 기존 경로 출력이 없다       |
| 독립 OCR               | 이미지    | `prompts/product-extract-text.md` · 운영 모델                                           | **미측정**                                    |
| 독립 번역              | gold 원문 | `prompts/translate-text-v1.md` · 운영 모델                                              | **미측정**                                    |
| 제품 유형 판단         | 이미지    | `prompts/product-typing.md` · 운영 모델                                                 | **미측정**                                    |
| 규칙 바닥값            | —         | OCR `empty_text_baseline` · 번역 `copy_source_baseline` · 유형 `constant_type_baseline` | 실행 가능. 모델 성능이 아니다                 |
| 분류                   | 이미지    | Go `baseline-always-other` · `baseline-nearest-case`                                    | 실행 가능(`sample-classification-boundaries`) |

`prompts/product-*.md`는 production 지시문의 연구용 복사본이다. 한 줄이라도 Go 소스와 달라지면 `tests/test_tasks.py`가 실패한다.

첫 후보는 **지시문 하나 또는 모델 하나만** 바꾼다. 지시문 후보는 `translateSpec` 하나만 바꾸는 쪽을 먼저 본다 — 다른 처리 방식과 분류 hash에 영향이 없다.

## 후보 등록

`tasks.Candidate(id, kind, ...)`와 답 얻는 방법(`Caller`)을 짝으로 쓴다.

| kind                                                  | 답 얻는 방법                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `fixed-prompt-model` · `general-llm` · `open-weights` | `provider_caller` — Claude 또는 OpenAI 호환(Ollama · vLLM)              |
| `ocr-engine` · `translation-dedicated`                | `function_caller(fn)` — `fn(CaseInput)`이 과제 schema의 dict를 돌려준다 |
| `product-integrated`                                  | `provider_caller` + `EXTRACT_AND_TRANSLATE`                             |
| `rule-baseline` · `smoke-fixture`                     | 규칙 함수 · `fixture_caller`                                            |

RAG · fine-tuning · 앙상블은 가설 후보로만 적는다. 그 기법을 썼다는 것은 채택 근거가 아니다. 채택은 Go 비교 · gate로만 한다.

## 실행 조건

- notebook 기본은 `MODE = "fixture"`(smoke 재생)이고 네트워크를 쓰지 않는다. `"dry-run"`은 모든 case가 not-run이다
- 실제 호출(`"provider"`)은 세 가지가 모두 있어야 한다: `ALLOW_EXTERNAL = True`(공급자 · 데이터 외부 전송 승인), 모든 case의 `transfer:external-ok` 태그(`research.transfer_blockers`), `MAX_CALLS`
- `MAX_CALLS`는 **case(호출) 수**다. anthropic SDK가 호출 하나에서 최대 2번 더 보내므로 HTTP 요청은 case 수의 최대 3배다(`tests/test_providers.py`가 가짜 transport로 고정). OpenAI 호환 호출은 재시도하지 않는다
- 비용 한도는 코드가 강제하지 않는다. 호출 전에 사람이 정한다

## 산출물

run 하나가 `lab/out/`(git 제외)에 남기는 파일. 정식 replay와 연구 기록은 파일이 다르다.

| 파일                      | 내용                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<runId>.run.json`        | 가설 · 바꾼 변수 · 통제 · 비교 대상 · 선택 이유, dataset · split · case id, 후보 · 답한 모델, 지시문 파일 · sha256, 코드 SHA · `uv.lock` hash · Python · 플랫폼, 호출 상한의 뜻                      |
| `<runId>.research.jsonl`  | case마다 `state`(answered · contract-error · call-failed · not-run) · `source` · `input` · 디코딩한 답 · HTTP status · 소요 시간 · 사용량과 각각의 출처. 측정하지 않은 값은 빠지고 0으로 쓰지 않는다 |
| `<runId>.jsonl` · `.json` | Go replay 기록과 자리표시 variant. text-extraction · translation만. not-run은 내보내지 않는다                                                                                                        |

공급자 원문(envelope · raw text)과 key는 파일에 쓰지 않는다. 운영 · 승인 데이터로 돌린 run은 저장소 밖 접근 제한 위치를 `OUT`으로 쓴다.

## 데이터

| dataset                            | 어디                  | 과제                 | split                       |
| ---------------------------------- | --------------------- | -------------------- | --------------------------- |
| `sample-ocr-boundaries`            | `datasets/`(Go)       | text-extraction      | dev 5 · validation 1        |
| `sample-translation-boundaries`    | `datasets/`(Go)       | translation          | dev 8 · validation 1(draft) |
| `sample-classification-boundaries` | `datasets/`(Go)       | image-classification | dev 3                       |
| `sample-image-typing`              | `lab/fixtures/`(연구) | image-typing         | dev 4 · validation 1        |

- 모두 합성(`privacy: synthetic`, CC0)이고 `software-fixture` · `research-fixture`다. benchmark가 아니다. 이미지는 `scripts/render_fixtures.py`로 그렸다
- 태그: `language:<code>` · `capture:<synthetic-render|screenshot|photo|scan>` · `quality:<clean|blurred|...>` · `layout:<...>` · `mixed-language` · `boundary:<...>` · `variant:<crop|format|rescan>` · `transfer:external-ok`
- 같은 문서의 크롭 · 재촬영 · 스캔 · 서식 변형은 `sourceGroupId` 하나로 묶는다(`en-hours` · `en-hours-crop`, `tr-date` · `tr-date-format`). Go가 split 사이 누출을 거절한다
- 일본어 · 중국어 OCR case는 `tokenizer`를 두지 않는다. 공백 단위 WER가 맞지 않아 Go가 WER를 not-applicable로, CER만 낸다. 한국어 · 영어는 `whitespace`
- 번역 reference는 사람 검토 전(`draft`)이다. replay에 `--allow-drafts`가 필요하다. validation case는 사람 검토(`method: human`) 전까지 eligible이 아니다
- held-out은 비어 있다. 최종 평가 담당자가 따로 고정하고 lab은 열지 않는다(`allow_held_out`)

빈틈 — 다음에 모을 것:

- 실촬영 · 스캔 · 흐림 · 기울어짐 · 세로쓰기(`columns-right-to-left`) · 표 레이아웃
- 영수증 · 주문서의 결제 여부 경계 사례(유형 판단 ambiguous)를 유형마다 10건 이상
- 번역 reference의 사람 검토, 금액 · 날짜 · 고유명사 · 부정 표현의 언어별 사례
- 실제 제품 경로(`extract_and_translate`)의 기존 출력

## Go 과제로 넘길 것

`image-typing`:

- 데이터 — `lab/fixtures/sample-image-typing/`(manifest · split JSONL · fixtures). case 모양은 Go dataset과 같고 정답은 `expected.imageTyping.imageType`이다
- 예측 — `lab/fixtures/sample-image-typing/research.example.jsonl`. 연구 기록 → replay 기록으로 옮길 때 `task` · `caseId` · `trial` · `state`와 원래 답 `output.imageType`(어휘 밖 값 포함)을 잃지 않는다. 제안: `ReplayRecord`에 분류 `prediction`과 같은 자리의 `{"imageType": ...}`
- 진행 조건 — Go `Task` 상수와 정답 · 예측 검증, 채점 규칙, `pnpm eval list`가 읽는 위치로 fixture 이동

원문 · 번역 결과의 식별 키:

| 결과                       | `task`                | `input`    | `caseId`     | 짝을 찾는 키                                          |
| -------------------------- | --------------------- | ---------- | ------------ | ----------------------------------------------------- |
| 확정 원문 번역(정식)       | translation           | gold-text  | 번역 case id | —                                                     |
| OCR 원문                   | text-extraction       | image      | OCR case id  | —                                                     |
| 연쇄 진단(OCR → 번역)      | translation           | ocr-output | OCR case id  | `upstream.{runId, caseId}` · `gold.{dataset, caseId}` |
| 같은 이미지 E2E(제품 통합) | extract-and-translate | image      | OCR case id  | `tasks.gold_pairs`로 번역 case                        |

OCR case와 번역 case는 같은 `sourceGroupId`이고 OCR 정답 원문이 번역 입력 원문과 같을 때 짝이다(`tasks.gold_pairs`). 연쇄 진단과 E2E 번역은 gold 원문 번역 점수와 합치지 않는다.
