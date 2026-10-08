# Agent Evaluation

provider · model · prompt가 바뀌어도 **같은 dataset과 같은 evaluator**로 사진 분류 결과를 비교하는 harness의 설계 문서.

- **구현** — `internal/evaluation`(계약 · runner · 채점 · 산출물 · 비교 · gate) · `internal/evalcli`(CLI)
- **탐색** — Python notebook(`tools/evals/lab`)
- **보기** — DevHub
- **쓰는 법** — [tools/evals/README.md](../../tools/evals/README.md)

## 구현 현황

| 범위                                                                                                      | 상태                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DescribeContract` · wire 계약 · dataset loader · adapter · 분류 evaluator · runner · 산출물 · 비교 · CLI | **구현 · offline 검증됨**                                                                              |
| pilot-v1 dataset(`apps/api/internal/evaluation/testdata/datasets/pilot-v1`)                               | dev 21건(합성, category당 3건, agent-visual 검토). validation · held-out 0건. **benchmark-ready 아님** |
| text-extraction · translation                                                                             | 계약 · offline evaluator · replay만. **production adapter unsupported**(호출 0회)                      |
| 실제 provider 호출 · 모델 성능 측정                                                                       | **하지 않음**                                                                                          |
| 실험 설정 — 기준선 · 실험 지시 · 비슷한 사례 예시 · 계단식 · 추출값 · 자동 실행 점검                      | **구현 · offline 검증됨**([실험 설정](#실험-설정))                                                     |
| Python lab — 탐색 · 지시문 · 모델 실험 · 임계값 후보. 원시 예측(`ReplayRecord`)만 Go로 넘김               | **구현 · offline 검증됨**. 채점 · gate · 산출물은 Go. gate 파일 · production 설정을 쓰지 않음          |
| 실제 행동 실행(Act) 측정 · fine-tuning · CI paid eval · Unicode NFC · judge                               | **후속**(Phase 2). 코드 없음                                                                           |

- **모델 이름은 저장소 파일에 두지 않음** — 실행 때 `--variant anthropic:<model>` · `openai:<model>`로 고름. 실험은 모델 없는 설정(`tools/evals/experiments/`)에 `<설정>@<공급자>:<model>`로 얹음
- **예시 manifest** — 모델 id가 `"placeholder": true`라 live에서 거절됨
- **실제 호출** — `--allow-api` 필수. key 환경변수는 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY`

## 현재 구현 상태

`Capture → Understand → Route → Act → Learn`의 코드 대조 결과. **분류의 `suggestedAction`은 executor가 아니라 enum 값 하나**이고 평가 계약으로만 남음. 제품 처리 방식 실행은 분류와 별개로 유형 판단 → 처리 방식 선택 → `Act`(migration `0007_processing_outcome` · `0008_processing_selection`).

| 단계       | 상태                  | 있는 것                                                                                                                                     | 없는 것                                                                                |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Capture    | Partially implemented | 사진 한 장(온보딩 첫 사진 · 홈 사진 추가). `MAX_IMAGE_BYTES`(7,500,000) · JPEG · PNG · GIF · WebP                                           | 공유 시트 · 앱 안 카메라 · 붙여넣기 · 여러 장                                          |
| Understand | Already implemented   | `POST /v1/processing-jobs` → `Processor.run` → `Classifier.Classify` → `processing_jobs.result`. `PROCESSING_PROVIDER` · `PROCESSING_MODEL` | 결과는 category · facts · suggestedAction · confidence 네 필드뿐                       |
| Route      | Implemented (product) | `Typer.TypeImage`가 제품 유형 판단, `decide`가 저장된 처리 방식 선택                                                                        | 유형 판단의 평가 task 없음 — harness는 `Classify`만 잼                                 |
| Act        | Partially implemented | `Actor.Act`가 고른 처리 방식(text 4 · receipt 3) 실행 → `processing_jobs.outcome`                                                           | 앱 밖 행동(캘린더 등록 · 지출 앱 저장) 없음. Google OAuth scope는 `openid` 하나        |
| Learn      | Not implemented       | 없음                                                                                                                                        | 자동화 · 반복 패턴 저장 없음                                                           |
| OCR · 번역 | Implemented (product) | production `Act`의 `extract_text` · `extract_and_translate` · 요약                                                                          | harness의 text-extraction · translation adapter는 unsupported([이후 과제](#이후-과제)) |

## 평가 seam

harness가 붙는 자리는 Go `internal/processing`의 인터페이스 하나.

```go
// apps/api/internal/processing/claude.go
type Classifier interface {
	Classify(ctx context.Context, image []byte, mediaType string) (Result, error)
}
```

- **구현체** — `NewClaudeClassifier` · `NewOpenAIClassifier`. HTTP client는 `NewHTTPClient()`(2분 상한 · 1 MiB 응답 상한 · redirect 미추적)
- **결과 계약** — `Result{Category, Facts, SuggestedAction, Confidence}`. `parseResult`가 공급자와 무관하게 재검사
- **prompt 변경 = 커밋 변경** — 지시 · schema는 package private 상수 · 함수. harness는 계약 hash로 구분
- **공급자 선택** — `cmd/server`의 `newClassifier`는 재사용 불가라 평가는 `processingadapter.Factory`가 같은 provider 상수로 같은 생성자 호출

### production에 더하는 것 — `DescribeContract` 하나

`internal/processing/contract.go`의 read-only 함수 하나. `Classify` · `Result` · `parseResult` · HTTP contract · DTO · swagger는 그대로.

```go
// 분류기가 모델에 강제하는 계약의 읽기 전용 묘사. 평가가 enum · 지시 · schema를 베끼지 않고 여기서 읽는다.
type Contract struct {
	Instructions string
	Request      string
	Schema       map[string]any
	Categories   []string
	Actions      []string
	Confidence   []string
	// Instructions · Request · Schema JSON의 sha256 hex. 지시나 schema가 바뀌면 달라진다.
	Hash string
}

func DescribeContract() Contract
```

- **복사본** — 돌려준 값을 바꿔도 분류기의 enum · schema는 그대로(`TestDescribeContractIsACopy`)
- **enum 중복 금지** — 평가 패키지는 category · action · confidence 목록을 갖지 않고 `Contract` 값으로 검사
- **공급자 일치** — 두 공급자 요청의 지시 · schema가 descriptor와 같음(`TestDescribeContractMatchesProviderRequests`)
- **평가 metadata는 processing에 두지 않음**

## 위치 · 언어 결정

**결정: Go-only 코어 `apps/api/cmd/eval` + `apps/api/internal/evaluation`, 데이터 · 산출물은 `tools/evals`.**

| 안                             | 판정 · 이유                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| A. tools-only (Node 스크립트)  | 탈락. Go 생성자를 부를 수 없어 서버 · DB · 로그인 세션이 필요                                                   |
| B. 새 Nx project (`apps/eval`) | 탈락. 별도 Go module은 `snapdone/api/internal/*` import 불가. 소비처도 하나뿐                                   |
| **C. API package (선택)**      | internal 경계 안이라 실제 constructor 사용. `api`의 `nx:run-commands` target 하나. production 바이너리에 미포함 |
| D. DevHub core                 | 탈락. DevHub는 TS이고 제품 앱을 import하지 않음. 결과를 읽어 보여 주는 역할만                                   |

- **의존 방향** — `cmd/eval`(bootstrap) → `evalcli`(CLI, Gin · pgx 미사용) → `processingadapter` → `evaluation`(공급자를 모름)
- **`tools/evals`** — dataset · variant manifest(모델 이름 불필요한 것만) · 실험 설정 · 산출물(`results/`, git ignore). 코드 없음

## 과제

`Task`는 셋. live 실행은 image-classification만, 나머지는 replay로만 채점.

| task                   | 입력                                         | expected                                                    | 예측                                               | 기본 policy(다른 규칙)                                        | live               |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `image-classification` | 사진(path · mediaType · sha256, byte는 파일) | `{ category, intent, acceptableActions, forbiddenActions }` | `ClassificationPrediction`(production 결과를 옮김) | `classification-pass-v1`                                      | processing adapter |
| `text-extraction`      | 사진 · 선택 language                         | `{ text, readingOrder, tokenizer?, fields? }`               | `{ text, fields? }`                                | `text-pass-v1`                                                | 없음 — replay만    |
| `translation`          | gold 원문 · sourceLanguage · targetLanguage  | `{ references, criticalSpans? }`                            | `{ text, targetLanguage? }`                        | `translation-reference-v1`(unscored) · `translation-exact-v1` | 없음 — replay만    |

- **routing은 evaluator** — 분류 한 호출에서 `category` · `routing` 두 check. 별도 API 호출 task 아님
- **facts** — 기록만, 채점하지 않음(표기가 자유). confidence는 분포만 집계
- **텍스트 정답** — `text: null`은 정답 없음(거절), `text: ""`는 "텍스트 없음"이 정답
- **정답 격리** — adapter 입력 `AdapterInput{Task, MediaType, Image, Text}`에 `Expected` · `Annotation` 없음. `AdapterInputOf`가 사진 sha256 대조

### task 연결 — `internal/evaluation/task.go`

task별 `policies`(첫 번째가 기본) · `score` · `summarize` · `compare`는 `taskScorings` 한 표가 정함. runtime 등록 · reflection · plugin 없음.

### 새 task 추가

zero-touch가 아니라 정해진 목록 수정. 빠뜨리면 컴파일 · `TestEveryTaskHasScoring` · 산출물 계약 테스트가 잡음.

1. `contract.go` — `Task` 상수 · `tasks` · `Input` · `Expected` branch와 검증
2. `result.go` — `Prediction` 모양과 검증
3. `<task>.go` — case 판정 · trial 요약 · 비교 축
4. `task.go` — `taskScorings` 항목 하나
5. `aggregate.go`의 `TrialQuality` branch · `artifact.go`의 `summary.md` 표
6. `dataset.go` — 사진 task 여부 · readiness 기준
7. live가 있으면 adapter와 `variant.go`의 `adapterTasks`, 없으면 replay만(`ReplayRecord` 검증)
8. 산출물 v1 — `artifact_contract_test.go`의 golden · `frozenKeys`, DevHub `apps/devhub/src/lib/evaluations`의 decoder · 타입

## adapter — production 분류기 호출과 관측

`internal/evaluation/processingadapter`. DB · `config.Load` · 서버 없이 production 생성자 호출.

- **의존 방향** — 평가 core는 `internal/processing` · `processingadapter`를 import하지 않음. `evalcli`가 factory를 `Deps.NewAdapter`로 주입
- **예측 모양** — `ClassificationPrediction`은 production `Result`와 JSON byte 단위로 같음
- **production 변경 없음** — 지시 · parser · payload를 복사하지 않음. timeout · 응답 상한 · redirect · SDK 재시도는 감싸인 client 그대로
- **관측** — 요청은 그대로, production이 읽는 응답 본문만 옆에 복사(상한 1 MiB). 추가 요청 · 읽기 없음
- **비밀 보호** — key는 생성 시 환경변수에서 읽고 산출물에 쓰지 않음. `Observation`에 헤더 · 본문 · 오류 원문 없음. key가 응답에 나오면 `[redacted]`
- **세 판정은 따로** — `Raw.Syntax`(JSON 문법) · `Raw.Shape`(descriptor schema) · `Raw.Parser`(production `parseResult`). 서로 덮지 않음
- **실패 분류** — 증거가 있을 때만 class 부여(`budget-denied` · `timeout` · `transport` · `http-status` · `refusal` · `truncation` · `contract` 등), 없으면 `unknown`
- **예산** — `CallBudget.Allow()`가 거절하면 base Transport 미실행. credential 실린 요청이 나가지 않음
- **미지원 task** — `Skipped` + `unsupported-task`, 호출 0회

| 관측 항목       | anthropic                                                         | openai 호환                                                       |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| 모델 텍스트     | `content[].text`                                                  | `choices[0].message.content`                                      |
| effective model | `model`                                                           | `model`(없으면 `unavailable`)                                     |
| stop reason     | `stop_reason`                                                     | `finish_reason`, `refusal`이 있으면 `refusal`                     |
| usage           | `usage.input_tokens` · `output_tokens`                            | `usage.prompt_tokens` · `completion_tokens`(없으면 `unavailable`) |
| request id      | `request-id` 헤더                                                 | `x-request-id` 헤더                                               |
| 재시도          | SDK가 408 · 409 · 429 · 5xx를 최대 2회 재시도. 마지막 응답만 관측 | 재시도 없음(1회)                                                  |

## 측정 축

네 축을 **따로** 집계. 하나의 점수로 합치지 않음.

| 축          | 측정                                                                 | 출처                                                           |
| ----------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Quality     | 아래 [분류 metric](#분류-metric--internalevaluationclassificationgo) | `Observation`의 `ClassificationPrediction`과 raw 판정          |
| Reliability | 호출 수 · 오류 수 · 오류 class                                       | `Observation.Failure` · `Attempts`. trial 반복으로 흔들림 확인 |
| Latency     | 호출별 wall time의 p50 · p95 · max                                   | `Observation.ElapsedMs` · attempt별 `elapsedMs`                |
| Cost        | 호출 수 · 전체 wall time · token(응답 봉투에 있을 때)                | 봉투의 usage. 없으면 `unavailable`, 금액 환산 없음             |

### 분류 metric — `internal/evaluation/classification.go`

`EvaluateClassification` — provider를 부르지 않는 순수 함수.

- **분모 정책** — 고른 case 전부(`Selected`). 실패 · timeout · 미실행 · 계약 밖 결과는 오답으로 세고 `__invalid__` bucket. 성공 응답만으로 나누지 않음
- **불완전 run** — 관측 없는 case가 있으면 `NotRun > 0` · `Complete: false`, official summary 아님

| metric                      | 공식                                                               | 분모                            | 분모 0                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------- | -------------------------------------- |
| category accuracy           | category 일치 수 / Selected                                        | Selected                        | `not-applicable`                       |
| per-label P · R · F1        | TP · FP · FN(gold 기준). support = gold 수                         | 예측 수 · gold 수               | P · R 각각 `not-applicable`            |
| macro F1                    | gold support > 0인 label의 F1 평균                                 | support 있는 label 수           | `not-applicable`, `missingLabels` 명시 |
| macro coverage              | 계약의 모든 category에 gold가 있으면 `full`, 아니면 `subset`       | —                               | —                                      |
| canonical action EM         | 예측 == canonical(`acceptableActions[0]`) 수 / canonical 있는 case | resolved + adjudicated          | `not-applicable`                       |
| accepted action accuracy    | 예측 ∈ acceptableActions 수 / canonical 있는 case                  | 같음                            | `not-applicable`                       |
| joint EM                    | category 일치 ∧ 예측 == canonical / canonical 있는 case            | 같음. facts · confidence 미포함 | `not-applicable`                       |
| pass rate                   | policy pass 수 / Selected                                          | Selected                        | `not-applicable`                       |
| critical rate               | forbidden 추천 수 / 관측된 risk case                               | risk 관측 수                    | `not-applicable`                       |
| critical-or-unobserved rate | (forbidden 추천 + 관측 못 함) / risk case                          | risk case 수                    | `not-applicable`                       |

- **F1** — gold 있고 예측 없는 label은 F1 0(평균 포함). gold 없는 label은 `not-applicable`, 평균 제외, `missingLabels`에 기록
- **canonical과 accepted** — adjudicated는 `acceptableActions[0]`이 canonical, 나머지는 accepted 대안. unresolved는 행동 미채점, `unresolved` 수만
- **진단값(점수 아님)** — confidence slice별 category accuracy · non-none 비율, `other` recall, `none` precision · recall. confidence는 확률이 아니라 ECE · Brier 없음. 대신 [자동 실행 점검](#추출값과-자동-실행-점검)
- **risk** — `forbiddenActions`가 있는 case만. 실패 · timeout · 미실행은 `unobserved`. timeout이 위험률을 낮추지 못하게 `criticalOrUnobservedRate`도 냄
- **raw 판정 집계** — `rawSyntax` · `rawShape` · `parser`를 `Tally{valid, invalid, unobserved}`로. schema가 틀려도 production이 받았으면 accuracy에 포함
- **pass `classification-pass-v1`** — category 일치 ∧ (canonical 있으면) 예측 ∈ acceptableActions ∧ (risk case면) 예측 있고 forbidden 아님. `requireSchemaValid: true` policy면 `schema-valid` check 추가
- **하지 않는 것** — 행동 실행이 없어 "routing 완료율" 없음. 추천 행동 일치와 행동 완료 가능률까지만

## 데이터와 산출물

### wire 계약 — `internal/evaluation`

모든 JSON을 **엄격하게** 읽음 — 모르는 필드 · 뒤따르는 값 · 미지원 `schemaVersion` · enum 누락 · union 불일치는 오류.

#### 값의 유무 — `Measure`

없는 값이 0으로 읽히는 길을 타입으로 차단. `value`는 pointer라 0과 null이 다름.

```json
{ "availability": "measured", "value": 0 }
{ "availability": "unsupported", "value": null, "reason": "Classify does not return usage" }
```

| availability     | value | reason | 뜻                                 |
| ---------------- | ----- | ------ | ---------------------------------- |
| `measured`       | 있음  | 없음   | 쟀음. 0도 값                       |
| `partial`        | 있음  | 있음   | 일부만 쟀음                        |
| `unavailable`    | null  | 있음   | 잴 수 있어야 하는데 이번에 못 얻음 |
| `unsupported`    | null  | 있음   | 이 공급자 · seam이 주지 않음       |
| `not-measured`   | null  | 있음   | 재지 않기로 함                     |
| `not-applicable` | null  | 선택   | 이 task · case에 뜻이 없음         |

짝이 틀리면 거절. `value: 0`은 `omitempty`로 사라지지 않음.

#### dataset — `tools/evals/datasets/<name>/` (`manifest.json` `schemaVersion` 1)

```
manifest.json       이름 · version · task · tier · split 파일과 case 수 · category당 목표
dev.jsonl           지시를 고치며 반복해서 보는 몫
validation.jsonl    고른 뒤 확인하는 몫 — 사람 검토만 채점
held-out.jsonl      마지막에만 보는 몫 — 사람 검토만 채점, AllowHeldOut 없이 열리지 않음
fixtures/           사진
(테스트 fixture pilot-v1에만 fixtures/sources/ — 합성 사진의 원본과 렌더 스크립트, drafts/ — 후보와 정답 지침. loader가 읽지 않음)
```

- **tier** — `software-fixture`(형식 예시) · `synthetic-pilot`(합성, benchmark 아님) · `golden-benchmark`(사람 검토 정답). 점수의 뜻은 tier가 정함
- **manifest** — `splits.<split>.cases`가 실제 줄 수와 다르면 거절. 목표 수를 채우려고 정답을 지어내지 않음
- **loader 거절 대상** — URL · 절대 경로 · `..` · symlink escape · 7,500,000 byte 초과 · 내용 형식과 `mediaType` · 확장자 불일치 · sha256 불일치 · 잘못된 UTF-8 · 빈 줄 · 뒤따르는 JSON · 중복 id · split · task 불일치
- **누출 검사** — 같은 sha256이나 같은 `provenance.sourceGroupId`가 split 사이에 걸치면 거절. crop · 재압축은 사람이 같은 group으로 묶음. **near-duplicate 탐지 없음**
- **selection hash** — id 순 정렬 case의 `id · JSONL 원문 · 사진 byte` sha256. 파일 순서와 무관

#### dataset case — JSONL 한 줄 (`schemaVersion` 1)

```json
{
  "schemaVersion": 1,
  "id": "event-01",
  "revision": 1,
  "task": "image-classification",
  "split": "dev",
  "tags": ["synthetic", "event"],
  "difficulty": "easy",
  "notes": "",
  "provenance": {
    "sourceGroupId": "pilot-v1-event-01",
    "license": "CC0-1.0",
    "privacy": "synthetic",
    "privacyReview": "reviewed",
    "generation": "fixtures/sources/render.swift로 그림"
  },
  "annotation": {
    "review": "reviewed",
    "method": "agent-visual",
    "ambiguity": "none",
    "guideline": "pilot-v1-rubric"
  },
  "input": {
    "image": { "path": "fixtures/event-01.png", "mediaType": "image/png", "sha256": "<hex>" }
  },
  "expected": {
    "classification": {
      "category": "event",
      "intent": "resolved",
      "acceptableActions": ["add_to_calendar"],
      "forbiddenActions": ["record_expense", "translate"]
    }
  }
}
```

- **id** — 소문자 · 숫자 · `-`만, dataset 전체에서 유일
- **revision** — expected를 고치면 올림. 결과의 `caseRevision`이 채점한 정답을 가리킴
- **provenance** — `privacy`(`synthetic` · `no-personal-data` · `redacted`) · `privacyReview`(`draft` · `reviewed`). 이름 · 전화번호 · 계좌번호가 있는 사진은 넣지 않음(모델 facts가 산출물에 남음)
- **annotation** — `review`(`draft` · `reviewed` · `disputed`) · `method`(`human` · `agent-visual`) · `ambiguity`(`none` · `low` · `high`)
- **input** — 사진 task는 `image`, translation은 `text`. task와 다른 branch는 거절
- **expected.classification** — `intent`가 `resolved`면 `acceptableActions` 하나, `adjudicated`면 둘 이상, `unresolved`면 없음. `forbiddenActions`는 run 전에 확정. 두 목록은 비어도 `[]`로 존재
- **expected.classification.facts**(선택) — `{id, label, kind, acceptedValues, requiredFor}`. `kind`는 `text` · `amount` · `date` · `time`. 규칙은 [추출값과 자동 실행 점검](#추출값과-자동-실행-점검)

#### text-extraction — 계약과 offline metric (`internal/evaluation/text.go`)

standalone 계약과 replay 전용 evaluator. live adapter는 `unsupported`(호출 0회 · `skipped`). 분류의 `facts`를 이어 붙여 예측으로 쓰지 않음.

- **expected.textExtraction** — `text` · `readingOrder` · 선택 `tokenizer`(`whitespace`만) · 선택 `fields[]{id, aliases, acceptedValues, important}`
- **정규화 `text-ws-v1`** — 줄바꿈 통일 · Unicode 공백 연속을 하나로 · 양끝 trim. 구두점 · 대소문자 · 숫자는 보존
- **Unicode 정규화 `none`** — NFC와 NFD는 다른 문자열. stdlib로 NFC를 직접 구현하지 않음([이후 과제](#이후-과제))
- **metric(case)** — raw EM · normalized EM · CER(rune Levenshtein) · WER(`tokenizer: whitespace`인 case만) · field accuracy · important field recall. CER > 1을 자르지 않음
- **빈 정답** — CER · WER `not-applicable`, `hallucinatedChars` · `hallucinatedWords`와 EM만. 정답 `null`은 dataset 오류
- **field** — key는 `id`나 `aliases`와 정확히 일치, 값은 공백 정규화 뒤 `acceptedValues` 중 하나. 계약 없는 case는 `unsupported`
- **metric(corpus)** — `corpusCer`(Σedits / Σref runes)와 `meanCaseCer`(case 평균)를 구분. WER도 같음
- **`fieldStats`** — field id별 `support` · `evaluated` · `correct` · `wrong` · `missing` · `accuracy`. field 계약 case가 없으면 생략
- **pass `text-pass-v1`** — normalized EM ∧ (field 계약이 있으면) 전부 맞음. 허용 오차 없음
- **상한** — 텍스트 10,000 rune. 정답 초과는 dataset 오류, 예측 초과는 CER `unavailable`
- **replay 예시** — `tools/evals/datasets/sample-text-extraction` · `predictions/sample-text-extraction.jsonl`. software check이고 benchmark 아님

#### translation — 계약과 reference 비교 (`internal/evaluation/translation.go`)

gold 원문 → 번역문 task의 계약과 deterministic reference 비교. 의미 품질의 ground truth 아님. 분류의 `translate` 추천은 번역 성공으로 세지 않음.

- **input.text** — `sourceText`(사람이 확정한 원문 · OCR 출력 아님) · `sourceLanguage` · `targetLanguage` 필수. 선택 `sourceImage`는 provenance일 뿐 adapter에 실리지 않음
- **expected.translation** — `references[]`(1개 이상) · 선택 `criticalSpans[]{id, kind, accepted[]}`
- **언어 감지 없음** — `languageMetadataMatch`는 선언값 일치일 뿐
- **EM** — raw · normalized(`text-ws-v1`). 일치한 reference 기록
- **critical span 경계** — 값 양옆 rune이 같은 부류면 불일치(`12` vs `120` · `12.5`, `Seoul` vs `Seoulite`). 한글 · 한자 · 가나는 조사가 붙어도 일치(`서울에서`). 형태소 분석 아님
- **pass policy** — 기본 `translation-reference-v1`은 `unscored`(의역이 EM에 실패할 수 있음). `--policy translation-exact-v1`이면 normalized EM ∧ span 전부 보존
- **unsupported** — semantic similarity · BLEU · chrF는 `unsupported`, judge는 `not-measured`. 자체 간이 점수를 표준 이름으로 표시하지 않음. 총점 없음

#### Phase 2 — judge 계약(문서만)

LLM judge · 사람 평가는 미구현, pseudo 구현도 두지 않음. 구현 시 지킬 것:

- **기록** — judge provider · 모델 · prompt hash · rubric hash · trial 수 · case별 판정 · usage · latency
- **blind** — variant id · 모델 이름을 judge에 숨김. 순서 무작위화 seed 기록
- **human reference** — 사람 평가 없이 judge 점수를 ground truth로 쓰지 않음
- **deterministic check 우선** — critical span · 언어 metadata · EM은 항상 계산, judge가 덮지 않음
- **비교 가능성** — judge 모델 · prompt hash · rubric hash가 다른 run의 judge 점수는 비교하지 않음

#### 채점 자격과 readiness

**검토 사실은 값을 적은 사람의 책임**이고 코드는 값만 봄.

- **eligible** — `annotation.review: reviewed` · `provenance.privacyReview: reviewed` · `ambiguity`가 `high` 아님 · dev 외 split은 `method: human`. 아니면 `LoadedCase.Blockers`가 이유 제공
- **Select** — `AllowDrafts` 없이 자격 없는 case가 있으면 거절(id와 이유만 출력). 빈 split은 항상 거절 — **빈 split의 100%는 성공이 아님**. `held-out`은 `AllowHeldOut` 필수
- **`BenchmarkReady`** — tier `golden-benchmark` ∧ 모든 case eligible ∧ 목표 충족일 때만. 아니면 `Reasons`
- **정답 격리** — prompt · few-shot · RAG corpus는 validation · held-out과 그 사진을 읽지 않음. 개발 중 held-out 내용 출력 금지. exporter · fine-tuning 경로 없음

#### case result — `cases.jsonl` 한 줄 (`schemaVersion` 1)

실행(`execution`)과 채점(`quality`)을 분리. 호출이 끝나지 않으면 `quality.outcome`은 `not-evaluated`, `prediction`은 null — failed도 0점도 아님.

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "invocationId": "...",
  "caseId": "event-poster-01",
  "caseRevision": 1,
  "variantId": "...",
  "trial": 1,
  "task": "image-classification",
  "execution": { "status": "completed", "attempts": 1, "error": null },
  "quality": {
    "outcome": "failed",
    "checks": [
      { "name": "category", "outcome": "passed" },
      { "name": "routing", "outcome": "failed" }
    ]
  },
  "prediction": {
    "classification": {
      "category": "event",
      "facts": [],
      "suggestedAction": "none",
      "confidence": "medium"
    }
  },
  "expected": { "classification": { "category": "event", "suggestedAction": "add_to_calendar" } },
  "metrics": {
    "category-match": { "availability": "measured", "value": 1 },
    "routing-match": { "availability": "measured", "value": 0 }
  },
  "durationMs": { "availability": "measured", "value": 812 },
  "usage": {
    "inputTokens": { "availability": "unsupported", "value": null, "reason": "..." },
    "outputTokens": { "availability": "unsupported", "value": null, "reason": "..." }
  },
  "cost": { "amount": { "availability": "not-measured", "value": null, "reason": "..." } }
}
```

위는 모양 예시이고 실측값 아님.

- **execution.status** — `completed` · `failed` · `timed-out` · `skipped`. failed · timed-out만 `error` 보유
- **execution.error** — `class`(`timeout` · `provider` · `contract` · `transport` · `other`) · `message`(512자 이하, `Bearer ` · `base64,` 포함 시 거절)
- **quality · prediction** — completed일 때만. check 하나라도 `failed`면 `outcome: failed`
- **metrics** — 이름별 `Measure`. `{}`는 허용, 누락은 거절
- **model**(선택) — `{requested, answered}`. variant 요약의 `models`가 요청과 다른 모델(예: 거절 뒤 대체)의 응답 수를 셈
- **usage · cost** — token은 응답 봉투 값(없으면 `unavailable`), cost는 `not-measured`. cost에 값이 있으면 `currency` 필수

#### run — `metadata.json` (`schemaVersion` 1)

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "startedAt": "<RFC 3339>",
  "source": { "commit": "<40 hex>", "dirty": false, "sourceHash": "<64 hex>" },
  "dataset": {
    "name": "image-classification",
    "version": 1,
    "split": "dev",
    "selectionHash": "<64 hex>",
    "caseCount": 0
  },
  "variant": {
    "id": "...",
    "provider": "anthropic",
    "model": "...",
    "baseHost": "",
    "contractHash": "<processing.Contract.Hash>"
  },
  "evaluatorPolicyHash": "<64 hex>",
  "sampling": { "trials": 1, "seed": null },
  "controls": { "timeoutMs": 120000, "maxAttempts": 1, "concurrency": 1 }
}
```

- **variant** — `baseHost`는 openai일 때 host만. 파일 없이 만든 variant는 참조가 `ref`로 남음
- **비밀값 금지** — **API key · Authorization · 이미지 byte · base64는 어느 산출물에도 쓰지 않음**
- **비교 가능 조건** — `dataset.selectionHash` · `evaluatorPolicyHash`가 같을 때. `variant.contractHash`가 다르면 prompt · schema가 다름

#### comparison — `results/comparisons/<comparisonId>/` (`schemaVersion` 1)

`internal/evaluation/compare.go`. 두 run의 raw에서 요약을 다시 만들어(저장된 summary와 다르면 거절) baseline · candidate를 짝지음. 모델 API · adapter 호출 없음.

- **비교 가능 조건** — dataset · split · selection hash · 고른 case id · task · mode · policy · evaluator policy hash · label contract hash · evaluator source hash가 같고 두 run이 `completed`. 아니면 `comparable: false`와 이유, **delta 없음**
- **실험 변수** — commit · 전체 source hash · variant contract hash · 모델 · 공급자는 달라도 됨
- **허용 flag** — `AllowPartial`은 짝 맞는 case만 서술, gate 미적용. `AllowEvaluatorDrift`는 이 build의 채점기로 재계산하고 경고. 조용히 비교하지 않음
- **짝** — case id · revision · task. 한쪽에 없거나 중복이면 오류
- **축** — quality · reliability · latency(둘 다 live · 완료 n > 0 · timeout 같을 때만) · cost(usage 완전 측정일 때만). 한 축이 비교 불가여도 나머지는 보고
- **case 수준** — newly failed · fixed · newly errored · critical 변화, category별 P · R · F1 delta
- **gate** — `GatePolicy`에 값을 적은 규칙만 판정. 기본 gate · weight · 허용치 없음. partial · evaluator drift면 미적용
- **결론** — 서술만("descriptive only … No statistical significance or superiority is claimed"). 짝 30개 미만이면 small-sample 경고
- **저장** — `comparison.json` · `.md`. run 산출물은 건드리지 않음. id는 결정적이고 충돌은 거절. golden은 `testdata/comparisons/`, DevHub `/evals/compare/[id]`가 같은 파일로 테스트

### 실행 산출물 — `tools/evals/results/<runId>/`

`internal/evaluation/artifact.go` · `aggregate.go`. `.gitignore`는 `/tools/evals/results/`만 무시.

| 파일            | 역할                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `metadata.json` | 정본. `RunMetadata` + `status`(`running` → `completed` · `partial`) · `finishedAt` · `abort`. 마지막 쓰기 |
| `cases.jsonl`   | 정본. invocation마다 `CaseResult` 한 줄, not-run · unsupported 포함                                       |
| `summary.json`  | 파생물. `RunSummary` — raw 두 파일에서 `RegenerateSummary`로 다시 만들면 같은 byte                        |
| `summary.md`    | 파생물. 사람이 읽는 표. 문자열 칸은 escape, 숫자는 locale 무관                                            |

- **채점과 쓰기 분리** — runner가 `CaseResult`를 만들고 `RunWriter`는 wire 계약 검사 뒤 쓰기만. writer는 task · policy를 모름
- **실패를 성공으로 보고하지 않음** — 쓰기 실패는 run 중단, summary 실패는 metadata를 running으로 남김. summary는 임시 파일 뒤 rename
- **덮어쓰기 금지** — 같은 `runId` · dataset 디렉터리인 root는 거절
- **interrupted** — 취소 · 예산 소진은 남은 invocation을 `not-run`, `status: partial` · `abort`. 빠진 줄은 `missing`, 잘린 마지막 줄은 거절
- **summary** — variant별 `execution` · `outcome` · `quality` · `reliability` · `latency` · `cost`. **종합 점수 없음**
- **불변식** — invocations = attempted + unsupported + notRun + missing, attempted = completed + failed + timedOut, passed + failed + unscored = invocations. 실행 오류도 분류 정확도 분모(selected)에 포함
- **latency** — attempted · completed 두 집합의 n · mean · median · p95(nearest-rank). n = 0이면 `not-applicable`, n < 10이면 주의 문구. replay는 재지 않음
- **cost** — wire call 수 · 알려진 usage 합(`known` · `unknown`, 일부 없으면 `partial`). 금액은 `unavailable`. 최신 가격을 코드에 넣지 않음. 같은 invocation의 check는 한 번만 셈
- **공식 benchmark gate** — partial · replay · draft 포함 · `golden-benchmark` 아닌 dataset · 불완전 trial은 `officialEligible: false`와 이유
- **안전** — 오류는 class · kind · 고정 문구만. 모델 원문은 `privacyReview: reviewed` case만. 테스트가 secret sentinel · 이미지 byte · notes 부재 확인
- **golden** — `internal/evaluation/testdata/artifacts/`, byte 단위 비교. production 지시 · schema가 바뀌면 `EVAL_UPDATE_GOLDEN=1`로 재생성

#### Artifact v1 호환 규칙

run · comparison 산출물은 DevHub와 Go가 함께 기대는 경계. run 파일은 위 표 그대로이고 `manifest.json` · `metrics.json` 같은 파일을 더하지 않음.

| 파일              | 성격                                                  |
| ----------------- | ----------------------------------------------------- |
| `summary.md`      | 사람이 읽는 표. 파싱하지 않음                         |
| `comparison.json` | 저장된 비교 read model. 두 run의 정본에서 재생성 가능 |
| `comparison.md`   | 사람이 읽는 비교 표                                   |

- **v1 안에서 허용** — 선택 field 추가(`omitempty` · 없으면 null). `frozenKeys`와 이 문서에 함께 기록. 추가된 것: text 요약 `fieldStats`, 이어서 실행의 `retriedFrom` · `carriedFrom` · `carried`
- **schemaVersion을 올림** — field 삭제 · 이름 · 타입 변경, 같은 field의 뜻 변경(분모 · 단위 · availability 규칙), 필수 field 추가
- **모르는 schemaVersion** — Go와 DevHub decoder 모두 읽지 않고 버전을 말하며 멈춤
- **읽는 쪽의 엄격함** — Go는 모르는 field 거절이라 비교는 한 build로. DevHub decoder(`apps/devhub/src/lib/evaluations/decode.ts`)는 필수 field만 검사
- **고정 방법** — Go `TestArtifactV1*`와 DevHub `contract.spec.ts`가 **같은 golden 파일**을 decode

## runner — variant · 선택 · 예산 · 중단

`internal/evaluation/variant.go` · `runner.go`. CLI는 flag만 얹음.

### variant manifest — `tools/evals/variants/<name>.json` (`schemaVersion` 1)

```json
{
  "schemaVersion": 1,
  "id": "local-ollama-example",
  "version": 1,
  "task": "image-classification",
  "adapter": "processing",
  "provider": "openai",
  "model": "<ollama-model-tag>",
  "endpoint": "http://localhost:11434/v1",
  "expectedContractHash": "<processing.Contract.Hash>",
  "config": {},
  "placeholder": true
}
```

- **adapter** — `processing`(production 분류기) · `baseline`(모델 없는 규칙, provider `none`). 미지원 task는 호출 0회 · `skipped`
- **provider별 검증** — anthropic은 `endpoint` 금지 · `apiKeyEnv` 필수. openai는 `endpoint`가 http(s) · host 필수, userinfo · query · fragment 금지. localhost도 실제 호출 대상
- **key** — `apiKeyEnv`는 환경변수 이름. 값은 산출물 · plan에 두지 않고 plan은 `missingCredential`만 표시
- **expectedContractHash** — 실제 `DescribeContract().Hash`와 다르면 거절. 실험 지시를 써도 production hash, 실험 지시는 `promptHash`로 따로
- **config** — `promptPath` · `retrieval` · `cascade` · `baseline`만([실험 설정](#실험-설정)). `temperature` · `seed` · `ensemble` 값과 모르는 필드는 오류
- **placeholder** — `"placeholder": true`는 live preflight가 거절. 표시 없는 `<...>` 모양 모델 이름도 거절. 모델 값을 대신 고르지 않음

### plan — `NewPlan(RunRequest)`

모델 API 없이 확정하는 것.

- **선택** — split → `CaseIDs` 필터(선택 밖 id는 오류) → `Limit`. 항상 id 순. 빈 선택은 오류
- **variant** — id 중복 · task 불일치 · 모르는 adapter는 오류
- **preflight** — live면 `AllowAPI` 없음 · 예산 ≤ 0 · placeholder · 빈 credential, replay면 replay source 없음. 하나라도 있으면 adapter를 만들지 않고 거절
- **기본값** — trials 1 · concurrency 1(그 밖은 오류) · case timeout 2분(production 상한과 같음) · result cache 없음

### run — `Run(ctx, RunRequest, Deps, Sink)`

- **순서** — variant → case → trial. 자체 재시도 없음. 실패 case를 다시 불러 성공만 남기지 않음
- **이어서 실행(`RunRequest.Carry`)** — 이전 live run의 completed 관측을 지금 채점기로 재채점(`carriedFrom`), 나머지만 호출. dataset selection · case · label contract · trials · variant 설정이 다르면 거절
- **예산** — `FixedBudget` 하나를 모든 variant가 공유. SDK 재시도 포함 HTTP 왕복마다 1씩 차감, 바닥나면 `budget-denied`
- **중단** — 예산 소진 · ctx 취소는 남은 invocation을 `not-run`, `abort`에 이유. 완료된 결과는 유지
- **timeout** — case마다 `context.WithTimeout`. `timed-out` 결과이고 중단 아님
- **mode** — `live`는 provider 호출, `replay`는 기록 재채점(latency `not-measured` · wire call 0)
- **sink** — invocation마다 채점된 `CaseResult` 전달. 쓰기 실패는 run 즉시 중단
- **lineage** — `CollectSource`가 commit · dirty · 평가 관련 `.go` 파일 hash(`sourceHash`) · `internal/evaluation`만의 hash(`evaluatorHash`) · `go.mod` · `go.sum` hash · Go 버전 수집. 설정 · secret 파일은 읽지 않음

## 실험 설정

같은 dataset · 같은 채점기 위에서 **무엇을 바꿔 보는지**. 전부 `config` 한 곳에서 켬. production 서버 동작은 바뀌지 않음.

- **모델 쓰는 실험** — 모델 없는 설정 파일 `tools/evals/experiments/<설정>.json`에 두고 `--variant <설정>@<공급자>:<model>`로 실행. id는 `<설정>-<모델 id>`
- **기준선** — 모델이 없어 `variants/`의 manifest
- **기록** — 산출물의 variant에 설정이 남음. 지시는 본문 대신 `promptHash`

| 설정             | manifest                                                                             | 하는 일                                                                                           | 호출                              |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| 기준선           | `adapter: "baseline"` · `provider: "none"` · `config.baseline`                       | `constant`는 늘 같은 답, `nearest`는 가장 비슷한 dev 사례의 정답(`retrieval` 필요)                | 0회. `--allow-api` 없이 live로 돎 |
| 여러 모델        | 파일 없이 `--variant anthropic:<model>` · `openai:<model>`                           | `--variant` 반복 시 한 run에서 같은 case를 variant 순으로                                         | case × variant                    |
| 실험 지시        | `config.promptPath` — 설정 파일 기준 상대 경로(위로 못 나감)                         | system 지시만 교체. 요청 문구 · 결과 schema · `parseResult`는 production 그대로                   | case당 1                          |
| 비슷한 사례 예시 | `config.retrieval.k`(1–5)                                                            | dev split에서 k개의 정답을 지시 끝에 힌트로. case id는 모델에 가지 않음                           | case당 1                          |
| 계단식           | `config.cascade` — 파일엔 `escalateOn`만, 모델은 `cascade@<공급자>:<첫>,<다시 물을>` | confidence가 목록에 있거나 답이 없으면 다시 물음. 예산 거절 · 취소면 안 물음. 호출 · token은 합산 | case당 1–2                        |

### 비슷한 사례 검색 — `internal/evaluation/retrieval.go`

- **예시 출처** — **dev split의 채점 자격 있는 분류 case만**. validation · held-out은 절대 예시 아님. 자기 자신과 같은 `sourceGroupId`는 제외
- **유사도** — 16×16 밝기 격자 vector의 cosine, 표준 라이브러리만. **글자 사진의 내용은 구분 못 함**
- **기록** — case 줄의 `retrieval.examples`. 요약의 `top1Rate` · `hitRate` · MRR(적중 = 예시 정답 category 일치)
- **모델 없이 재기** — `pnpm eval retrieve --dataset apps/api/internal/evaluation/testdata/datasets/pilot-v1 --k 3`

### 추출값과 자동 실행 점검

- **추출값 찾기** — label은 보지 않고 **값만**. 예측 facts 중 하나라도 허용 값을 담으면 찾음
  - `amount` — 천 단위 쉼표를 뺀 수가 예측 값의 수 중에 있음
  - `date` · `time` — 숫자 묶음(앞의 0 제외)이 순서대로 이어서 있음(`2026-09-20` ≈ `2026년 9월 20일 19:42`)
  - `text` — 공백 제거 · 대소문자 무시 포함. `오후 2시`처럼 숫자만으로 모호한 값은 `text`로 여러 표기
- **행동 완료 가능** — 허용 행동 선택 ∧ 그 행동의 `requiredFor` facts를 모두 찾음. 행동이 `none`이면 완료 가능
- **자동 실행 점검** — confidence `high` ∧ 행동 `none` 아님 = 확인 없이 실행으로 보고, 해도 되는 답인지 셈. `highWrongRate` · `autoPrecision` · `autoCoverage`
- **pass에는 넣지 않음** — `classification-pass-v1`은 그대로. compare의 quality 축에 `facts-recall` · `action-ready-rate` · `high-but-wrong-rate` · `auto-run-precision` · `auto-run-coverage`로 들어감. 이 집계가 없는 옛 요약은 `unavailable`

## 실행과 검증

### 명령 — `apps/api/cmd/eval` · `pnpm eval`

```bash
pnpm eval list
pnpm eval validate --dataset <name|path> [--require-ready]
pnpm eval plan --dataset <name|path> --split dev --variant <name|path> [--case id] [--limit N] [--trials N] [--allow-drafts] [--allow-held-out]
pnpm eval replay --dataset <name|path> --variant <name> --predictions tools/evals/predictions/<file>.jsonl --run-id <id>
pnpm eval report --run <runId>
pnpm eval retry --run <runId> --allow-api --max-api-calls N [--run-id <new>]   # 끝난 결과는 옮기고 실패 · 미실행만 다시 부름
pnpm eval compare --baseline <runId>:<variantId>[:trial] --candidate ... [--gate gate.json] [--allow-partial] [--allow-evaluator-drift] [--comparison-id id]
pnpm eval retrieve --dataset <name|path> [--split dev] [--k 3]   # 비슷한 사례 검색만, 호출 없음
pnpm eval run --dataset <name|path> --variant baseline-always-other --variant baseline-nearest-case --run-id baselines   # 기준선, 호출 없음
# plan · run · replay 공통 flag: --split --case(반복) --limit --trials --variant(반복) --allow-drafts --allow-held-out --policy --run-id --root --out
ANTHROPIC_API_KEY=... pnpm eval run --dataset <name|path> --variant anthropic:<model> --allow-api --max-api-calls 30   # 유료. 이 저장소 작업에서 실행하지 않음
```

- **guard** — 모델을 부르는 `run` · `retry`는 `--allow-api`와 `--max-api-calls N` 둘 다 없으면 usage 오류(2). 기준선만이면 불필요. localhost endpoint도 같은 opt-in
- **adapter 생성 시점** — plan · preflight · lineage 수집을 마친 뒤. `--dry-run`은 plan만
- **전달** — 루트 script `eval` → `nx run api:eval`(`nx:run-commands`, cwd `apps/api`, `cache: false`, `go run ./cmd/eval`)
- **root** — cwd에서 위로 `nx.json`을 찾아 결정. 상대 경로는 root 기준, `--root`로 변경
- **종료 코드** — 0 정상 · 2 usage · 3 불완전(partial · 검증 실패 · preflight · 비교 불가) · 4 gate 실패. `go run`은 코드를 보존하지 않을 수 있어 gate는 빌드한 바이너리로
- **설정 파일 없는 variant** — `<공급자>:<model>`은 production 지시 그대로인 manifest를 즉석 생성. `<설정>@…`은 실험 설정을 얹음. 그 밖은 파일 이름. 규칙은 `evaluation.VariantRef`(`ref.go`). `retry`는 저장된 `ref`로 같은 variant 재생성
- **replay** — `predictions/*.jsonl` 기록만 읽음. dataset 정답에서 예측을 만들지 않음
- **`api:eval-check`** — offline Go 테스트 + sample 3개 `validate`. 모델 호출 없음
- **`api:test` input** — `tools/evals`의 `datasets/**` · `variants/**` · `experiments/**` · `predictions/**` 포함, `results/**` 제외
- **key** — flag로 받지 않고 어디에도 출력하지 않음

### DevHub 전수 검사

`pnpm devhub:check`가 카탈로그를 대조하므로 harness 변경 시 함께 수정.

- **script · target** — `eval` · `eval:check` script와 `eval` · `eval-check` target이 `commands.ts`에 등록
- **시나리오 · 기록** — `evaluate-model-variants` 시나리오와 `agent-evaluation-harness` 기록이 소스 · 테스트를 인용. 테스트 함수 이름을 바꾸면 `tests.ts`도 수정
- **문서** — 이 문서는 `documents.ts`에 `agent-evaluation`으로 등록. 링크 · heading 실재를 freshness 검사가 확인
- **대상 아님** — `.gitignore` · `tools/evals`

### 테스트 정책

- **외부 model API 호출 금지** — 가짜 `Classifier`와 가짜 `http.Client.Transport` 사용. `httptest.NewServer`로 포트를 열지 않음
- **dataset 테스트** — `t.TempDir()`의 작은 fixture로 거절 사례, `testdata/datasets/software-fixture` · `pilot-v1`을 실제로 읽음
- **helper** — 두 파일 이상이 쓰면 `internal/evaluation/support_test.go`, 아니면 그 파일
- **산출물 테스트** — key · base64 · 이미지 byte 부재 확인
- **검증 범위** — `nx affected -t vet,fmt,test --files=apps/api/...`와 `pnpm devhub:check`. Go 변경에 web · mobile 검사를 붙이지 않음

## 남은 위험

- **benchmark 불가** — validation · held-out에 사람 검토 사진이 없음. dev 21건은 동작 확인과 설정 비교용. 사람 검토 사진은 사용자 작업(`drafts/candidates.md`)
- **검색 품질** — 사진 배치 기준이라 글자 사진에서 약함. 예시 variant는 기준선 · 예시 없는 variant와 나란히 봄
- **live 경로 미검증** — SDK 재시도 · 429 · 응답 형식은 가짜 응답으로만 검증. 첫 live 실행은 로컬 Ollama `--limit 1`부터, 결과는 `docs/records/`에 기록
- **pnpm · Nx 업그레이드** — `pnpm eval list`로 인자 전달 재확인
- **golden** — production 지시 hash를 담아 prompt 변경 시 `EVAL_UPDATE_GOLDEN=1`로 재생성

## 이후 과제

MVP 밖, 순서 미정. fine-tuning · CI paid eval · 실제 행동 실행 E2E 포함.

- **OCR · 번역 adapter** — production adapter가 생기면 `Classifier`처럼 인터페이스로 연결. 그전엔 흉내 내지 않음
- **번역 의미 평가** — BLEU · chrF · semantic similarity · judge 없음
- **Unicode NFC(text v2)** — `golang.org/x/text` 직접 import는 dependency 승인 대상
- **비용 환산** — 모델별 가격표가 생기면 `cost.amount` 채움. 계단식 이득도 그때 비용으로 비교
- **내용 기반 검색** — 글자 추출 뒤 검색 · embedding은 추가 호출 · 의존성 승인 대상
