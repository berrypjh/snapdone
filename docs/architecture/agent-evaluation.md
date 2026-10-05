# Agent Evaluation

provider · model · prompt가 바뀌어도 **같은 dataset과 같은 evaluator**로 사진 분류 결과를 비교하는 harness의 설계. 이 문서는 구현의 단일 설계 문서. 구현은 `internal/evaluation`(계약 · runner · 채점 · 산출물 · 비교 · gate)과 `internal/evalcli`(CLI)이고, 탐색은 Python notebook(`tools/evals/lab`), 보기는 DevHub. 쓰는 법은 [tools/evals/README.md](../../tools/evals/README.md).

## 구현 현황

| 범위                                                                                                                                                                | 상태                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| production `DescribeContract` · 평가 wire 계약 · dataset loader · adapter와 observer · 분류 evaluator · runner · 산출물 · 비교 · CLI(`nx run api:eval`) · Nx target | **구현 · offline 검증됨**                                                                                                     |
| pilot-v1 dataset(테스트 fixture, `apps/api/internal/evaluation/testdata/datasets/pilot-v1`)                                                                         | dev 21건(합성 렌더, category당 3건, agent-visual 검토 · 기대 facts 포함), validation · held-out 0건. **benchmark-ready 아님** |
| text-extraction · translation                                                                                                                                       | 계약 · offline evaluator · replay만. **production adapter unsupported**(호출 0회)                                             |
| 실제 provider 호출 · 모델 성능 측정                                                                                                                                 | **하지 않음**. 명령은 문서에만 있음                                                                                           |
| 실험 설정 — 기준선 · 실험 지시 · 비슷한 사례 예시 · 계단식, 추출값 · 행동 완료 가능률 · 자동 실행 점검                                                              | **구현 · offline 검증됨**. 기준선과 검색은 모델 없이 실제로 돌려 봄([실험 설정](#실험-설정))                                  |
| Python 연구 workspace(`tools/evals/lab`) — 탐색 · 지시문 · 모델 실험 · 임계값 후보. 원시 예측 파일(`ReplayRecord`)만 Go로 넘기고 채점 · gate · 산출물은 Go          | **구현 · offline 검증됨**. notebook은 gate 파일 · production 설정을 쓰지 않음                                                 |
| 실제 행동 실행(Act) 측정 · fine-tuning · CI paid eval · Unicode NFC · judge                                                                                         | **후속**(Phase 2). 코드 없음                                                                                                  |

`local.example.json` · replay manifest의 모델 id는 placeholder이고 `"placeholder": true`라 live에서 거절됨. **모델 이름은 저장소 파일에 두지 않음** — 모델은 계속 바뀌므로 실행할 때 `--variant anthropic:<model>` · `openai:<model>`로 고르고, 실험은 모델 없는 설정(`tools/evals/experiments/`)에 얹어 `<설정>@<공급자>:<model>`로 부름. 실제 모델 호출은 `--allow-api`가 있어야 돎(이 저장소 작업에서 실행하지 않음). 두 공급자를 한 run에서 돌리도록 key 환경변수를 나눴음(`ANTHROPIC_API_KEY` · `OPENAI_API_KEY`). 문서의 hash 값(`5152dd42…` 등)은 이 커밋 기준이며 지시 · schema가 바뀌면 달라짐.

## 기준 상태

설계의 근거로 삼은 저장소 상태. 모두 실제 명령으로 읽은 값.

| 항목            | 값                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| branch · HEAD   | `main` · `252381a6e0a5a1c37b9cceea9c41f3306cce0926` (외부 분석 기준 커밋과 같음). `git status --short` 비어 있음  |
| 도구 버전       | Node 24.20.0 · pnpm 10.30.3 · Nx 23.1.1 · Go 1.26.6                                                               |
| `api` target    | `dev` `migrate` `build` `test` `vet` `swagger` `swagger-check` `fmt` — `lint` · `typecheck` 없음                  |
| `devhub` target | `lint` `typecheck` `test` `build` `devhub-check` (`vitest run src/data src/domain ...`)                           |
| 중첩 agent 지침 | `rg --files -g AGENTS.md -g CLAUDE.md` 결과는 루트 두 파일뿐. 경로별 규칙은 `.claude/rules/`(api · docs · devhub) |
| Go 직접 의존    | `anthropic-sdk-go` · `gin` · `pgx/v5` · `swaggo/*` — 평가용 의존성 추가 없음                                      |

## 현재 구현 상태

`Capture → Understand → Route → Act → Learn`을 코드 · route · migration · 권한으로 대조한 결과. **`suggestedAction`은 executor가 아니라 enum 값 하나**이고, 그것을 실행하는 코드는 없음.

| 단계       | 상태                  | 있는 것                                                                                                                                                                                           | 부재 근거                                                                                                                                                                                                        |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture    | Partially implemented | 온보딩 첫 사진 한 장 — mobile은 `expo-image-picker`의 시스템 카메라 · 선택기, web은 파일 선택. `MAX_IMAGE_BYTES`(7,500,000) · JPEG · PNG · GIF · WebP만                                           | 공유 시트 · 앱 안 카메라 화면 · 온보딩 밖 업로드 없음. `libs/webview-bridge`에 촬영 · 공유 메시지 없음                                                                                                           |
| Understand | Already implemented   | `POST /v1/processing-jobs` → 백그라운드 `Processor.run` → `Classifier.Classify` → `processing_jobs.result`(jsonb). 공급자는 `PROCESSING_PROVIDER`(anthropic · openai)와 `PROCESSING_MODEL`로 선택 | 결과는 category · facts · suggestedAction · confidence 네 필드뿐. OCR · 번역을 따로 하는 코드 없음                                                                                                               |
| Route      | Contract only         | `suggestedAction` enum(`save_place` · `add_to_calendar` · `record_expense` · `translate` · `none`)이 Go `Result` · DTO · `libs/onboarding`의 `ProcessingResult`에 같은 값으로 있음                | 행동 후보를 고르거나 근거를 보여 주는 화면 · 함수 없음. mobile `OnboardingResult` route는 `OnboardingPendingScreen`("다음 단계는 준비 중입니다"), web `ProcessingView`도 완료 뒤 같은 문장                       |
| Act        | Not implemented       | 없음                                                                                                                                                                                              | swagger에 `/actions` · `execute` route 없음. migration은 `0001_auth` ~ `0004_onboarding_progress`뿐(행동 · 기록 테이블 없음). Google OAuth scope는 `openid` 하나(`internal/google/google.go`) — 캘린더 권한 없음 |
| Learn      | Not implemented       | 없음                                                                                                                                                                                              | 자동화 · 반복 패턴 저장 코드 · 테이블 없음                                                                                                                                                                       |
| OCR · 번역 | Planned               | `foreign_text` category와 `translate` action 값만                                                                                                                                                 | 텍스트 추출 · 번역 API 호출 코드 없음. production adapter를 이 harness가 흉내 내지 않음(아래 [이후 과제](#이후-과제))                                                                                            |

DevHub `finish-task-from-image` 시나리오의 부재 검색(`ACTION_SURFACE` 등)과 같은 결론. 다만 그 시나리오와 [devhub.md](./devhub.md) Part I은 2026-09-19 기준 조사라 "image analysis Not found" 같은 문장은 **지금 사실이 아님** — 사진 분류는 그 뒤에 들어왔음. 이 문서는 현재 코드만 근거로 삼음.

## 평가 seam

harness가 붙는 자리는 Go `internal/processing`의 인터페이스 하나.

```go
// apps/api/internal/processing/claude.go
type Classifier interface {
	Classify(ctx context.Context, image []byte, mediaType string) (Result, error)
}
```

- **구현체** — `NewClaudeClassifier(apiKey, model string, httpClient *http.Client)` · `NewOpenAIClassifier(baseURL, model, apiKey string, httpClient *http.Client)`. HTTP client는 `NewHTTPClient()`(2분 상한 · 1 MiB 응답 상한 · redirect 미추적)
- **결과 계약** — `Result{Category, Facts, SuggestedAction, Confidence}`. 허용 값은 `parseResult`가 공급자와 무관하게 다시 검사
- **지시 · schema** — `instructions` · `request` · `resultSchema()`는 package private 상수 · 함수. prompt는 코드에 있으므로 **prompt 변경 = 커밋 변경**이고, harness는 그 변경을 계약 hash로 구분함(아래)
- **공급자 선택** — `newClassifier(config.Processing)`는 `cmd/server/main.go`의 `package main`에 있어 다른 command가 재사용할 수 없음. 평가는 `processingadapter.Factory`가 같은 provider 상수로 같은 생성자를 부름. `processing`으로 옮기면 production 변경이라 이번 범위 밖

### production에 더하는 것 — `DescribeContract` 하나

read-only 함수 하나만 `internal/processing/contract.go`에 추가(구현됨). `Classify` · `Result` · `parseResult` · HTTP contract · DTO · swagger는 그대로.

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

- **복사본** — slice는 `slices.Clone`, schema는 `resultSchema()`가 매번 새로 만드는 map. 돌려준 값을 바꿔도 분류기의 enum · schema는 그대로(테스트 `TestDescribeContractIsACopy`)
- **enum 중복 방지** — 평가 패키지는 category · action · confidence 목록을 갖지 않음. `Case.Validate(contract)` · `CaseResult.Validate(contract)`가 인자로 받은 `Contract`의 값으로 검사. 목록이 production에서 바뀌면 dataset 검증도 같이 바뀜
- **공급자 일치** — 두 공급자의 가짜 요청에서 system · user 지시 · schema가 descriptor와 같음을 확인(`TestDescribeContractMatchesProviderRequests`)
- **평가 metadata는 processing에 두지 않음** — `Contract`에는 계약 묘사만 있음

## 위치 · 언어 결정

**기본 결정: Go-only 코어 `apps/api/cmd/eval` + `apps/api/internal/evaluation`, 데이터 · 산출물은 `tools/evals`.**

| 안                             | 내용                                              | 판정                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. tools-only (Node 스크립트)  | `tools/scripts`처럼 루트 eslint만 보는 스크립트   | 탈락. Go 생성자를 부를 수 없어 서버 · DB · 로그인 세션을 띄워 HTTP로 돌려야 함. "DB · `config.Load` · 서버 bootstrap 없이 실제 constructor 호출"과 어긋남                                |
| B. 새 Nx project (`apps/eval`) | 별도 Go module 또는 TS 프로젝트                   | 탈락. 별도 Go module은 `snapdone/api/internal/*`를 import할 수 없음(Go internal 경계). 소비처가 하나뿐이라 새 프로젝트 · 라이브러리를 만들 근거도 없음                                   |
| **C. API package (선택)**      | 같은 module 안 `cmd/eval` + `internal/evaluation` | internal 경계 안이라 실제 constructor를 그대로 씀. Nx에는 `api`의 `nx:run-commands` target 하나(`dev` · `migrate`와 같은 관례)로 붙음. production 바이너리(`cmd/server`)에 포함되지 않음 |
| D. DevHub core                 | DevHub가 평가를 실행                              | 탈락. DevHub는 TS이고 제품 앱을 import하지 않음. 나중에 `tools/evals/results`의 summary를 **읽어 보여 주는** 역할은 가능하나 실행 주체는 아님                                            |

- **`cmd/eval`** — signal context를 만들고 `evalcli.Run`의 종료 코드로 프로세스를 끝내는 bootstrap뿐
- **`internal/evalcli`** — 명령 dispatch · flag 파싱 · root · 경로 풀이 · dataset · variant 선택 · replay JSONL 읽기 · git lineage 수집 · 출력 · 종료 코드. 의존 방향은 `cmd/eval → evalcli → processingadapter → evaluation`이고 `evaluation`은 둘 다 모름. 공급자 선택은 `processingadapter.Factory`가 함. Gin · pgx를 import하지 않음
- **`internal/evaluation`** — dataset 읽기 · hash · 실행 · 채점 · 집계 · 산출물 · 비교. `Classifier` 인터페이스만 알고 공급자를 모름
- **`tools/evals`** — 사람이 쓰는 dataset(`datasets/`) · variant manifest(`variants/`, 모델 이름이 필요 없는 것만) · 모델 없는 실험 설정(`experiments/`)과 실행 산출물(`results/`, git ignore). 코드 없음

## 과제

`internal/evaluation`의 `Task`는 셋. live 실행은 image-classification만이고 나머지 둘은 replay로만 채점함.

| task                   | 입력                                         | expected                                                    | 예측                                               | 기본 policy(다른 규칙)                                        | live               |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `image-classification` | 사진(path · mediaType · sha256, byte는 파일) | `{ category, intent, acceptableActions, forbiddenActions }` | `ClassificationPrediction`(production 결과를 옮김) | `classification-pass-v1`                                      | processing adapter |
| `text-extraction`      | 사진 · 선택 language                         | `{ text, readingOrder, tokenizer?, fields? }`               | `{ text, fields? }`                                | `text-pass-v1`                                                | 없음 — replay만    |
| `translation`          | gold 원문 · sourceLanguage · targetLanguage  | `{ references, criticalSpans? }`                            | `{ text, targetLanguage? }`                        | `translation-reference-v1`(unscored) · `translation-exact-v1` | 없음 — replay만    |

### task 연결 — `internal/evaluation/task.go`

task마다 달라지는 채점 · 요약 · 비교는 `taskScorings` 한 표가 정함. 알고리즘은 `classification.go` · `text.go` · `translation.go`에 그대로 있고 표는 어느 함수를 쓰는지만 적음. runtime 등록 · reflection · plugin은 없음.

- **`policies`** — 받는 `ScoringPolicy` 버전. 첫 번째가 기본(`defaultPolicy`), 나머지는 `--policy`로 고름(`policyFitsTask`)
- **`score`** — invocation 하나의 `Quality`와 case metric. runner가 `NewCaseResult`(result.go)로 이것을 불러 `CaseResult`를 만들고, `cases.jsonl`을 쓰는 `RunWriter`는 검증해 적기만 함
- **`summarize`** — trial 하나의 `TrialQuality`(task 한 branch만 채움). `summary.json`과 비교가 같은 함수를 씀
- **`compare`** — 짝지은 두 trial 요약의 품질 축 · gate 입력(pass rate · shape invalid) · case 변화. label · confidence 비교는 분류만
- `ScoringPolicy`는 예전 이름 `ClassificationPolicy`. JSON(`policy.version` · `policy.requireSchemaValid`)은 그대로

### 새 task 추가

zero-touch가 아니라 정해진 목록을 고침. 빠뜨리면 컴파일 · `TestEveryTaskHasScoring` · 산출물 계약 테스트가 잡음.

1. `contract.go` — `Task` 상수와 `tasks`, `Input` · `Expected` branch와 검증(`Input.validate` · `Expected.Validate`)
2. `result.go` — `Prediction` 모양과 `Prediction.validate`
3. 새 파일 `<task>.go` — case 판정 · trial 요약 · 비교 축(기존 세 파일과 같은 모양)
4. `task.go` — `taskScorings`에 항목 하나(policies · score · summarize · compare)
5. `aggregate.go` — `TrialQuality`에 branch와 `complete`, `artifact.go` — `summary.md` 표(`renderQuality`)
6. `dataset.go` — 사진을 읽는 task인지 · readiness 기준
7. (live가 있으면) adapter와 `variant.go`의 `adapterTasks`. 없으면 replay만 — `evaluation/replay.go`의 `ReplayRecord` 검증
8. 산출물 v1 — `artifact_contract_test.go`의 golden · `frozenKeys`, DevHub `apps/devhub/src/lib/evaluations`의 decoder · 타입

- **routing은 evaluator** — image-classification 한 호출에서 `category` · `routing`(suggestedAction) 두 check를 채점. 별도 API 호출 task가 아님
- **facts** — 기록만 하고 채점하지 않음(표기가 자유라 exact match가 무의미). confidence는 분포만 집계
- **텍스트 정답** — `text: null`은 정답 없음(거절), `text: ""`는 "텍스트 없음"이 정답. 둘을 섞지 않음
- **정답 격리** — adapter는 `AdapterInput{Task, MediaType, Image, Text}`만 받음. `Expected` · `Annotation` 필드가 없어 정답이 모델로 새지 않음. `AdapterInputOf(case, image)`가 사진 sha256을 대조

## adapter — production 분류기 호출과 관측

`internal/evaluation/processingadapter`(구현됨). DB · `config.Load` · 서버 없이 production 생성자를 그대로 부름.

- **의존 방향** — `evalcli → processingadapter → evaluation`. 평가 core(`internal/evaluation`)는 `internal/processing`도 `processingadapter`도 import하지 않음. core는 `AdapterFactory`(생성자 타입)와 adapter 이름 → 지원 task 표만 갖고, `evalcli`가 `processingadapter.Factory(transport)`를 `Deps.NewAdapter`로 넣음. replay만 돌리면 factory가 없어도 됨
- **계약 view** — core는 `ClassificationContract{Hash, Categories, Actions, Confidence}`만 봄. `processingadapter.Contract()`가 `processing.DescribeContract()`에서 옮기고, descriptor schema(shape 판정)는 adapter 안에서만 씀
- **예측 모양** — 산출물의 `prediction.classification`은 평가 소유 `ClassificationPrediction{category, facts[{label, value}], suggestedAction, confidence}`. adapter가 production `Result`를 그대로 옮기고 JSON은 byte 단위로 같음(`TestPredictionKeepsTheResultWireShape` · artifact v1 golden)
- **경로** — `Factory(base)` → `processing.NewHTTPClient()`의 Transport를 observer로 감쌈 → provider 상수(`config.ProviderAnthropic` · `config.ProviderOpenAI`)로 `processing.NewClaudeClassifier` · `processing.NewOpenAIClassifier` 호출. key는 `apiKeyEnv`가 가리키는 환경변수를 만들 때 읽고 산출물에 적지 않음
- **production 변경 없음** — 지시 · parser · 요청 payload를 복사하지 않음. timeout(2분 · 요청당 90초) · 응답 상한(1 MiB) · redirect 미추적 · Claude SDK 재시도(최대 3회)는 감싸인 client가 그대로 가짐
- **관측** — observer는 요청을 바꾸지 않고, 응답 본문을 production이 읽는 만큼만 옆에 베낌(상한 1 MiB). 두 번째 요청 · 추가 `ReadAll`을 하지 않음. 본문이 잘리거나 production이 읽지 않았으면 `partial` · `unavailable`
- **`Observation`** — `Status` · `Result`(`ClassificationPrediction`) · `Failure{class, kind, message}` · `RequestedModel` · `EffectiveModel` · `StopReason` · `RequestID` · `Usage` · `Raw{Text, Syntax, Shape, Parser}` · `FallbackPolicy` · `Sampling`(둘 다 `not-measured` — production이 정함) · `Attempts[]{denied, transportError, timeout, status, elapsedMs}` · `Calls` · `ElapsedMs`. 헤더 · 본문 · 오류 원문은 담지 않고, 설정된 key가 응답에 되풀이되면 `[redacted]`
- **세 판정을 덮지 않음** — `Raw.Syntax`(JSON 문법) · `Raw.Shape`(descriptor schema의 required · type · enum · additionalProperties) · `Raw.Parser`(production `parseResult`). facts가 null이거나 빠지면 shape는 틀리지만 parser는 받고, 빈 fact 문자열은 shape는 맞지만 parser가 거절
- **실패 분류** — 증거가 있을 때만: `budget-denied` · `timeout` · `transport` · `http-status` · `envelope-malformed` · `refusal` · `truncation` · `no-content` · `model-json-syntax` · `contract`. 증거가 없으면 `unknown`
- **예산** — `CallBudget.Allow()`가 거절하면 base Transport가 실행되지 않음(credential이 실린 요청이 나가지 않음). `FixedBudget`이 기본 구현
- **미지원** — text-extraction · translation은 `Skipped` + `unsupported-task`, provider 호출 0회

| 관측 항목       | anthropic                                                                                       | openai 호환                                                       |
| --------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 모델 텍스트     | `content[].text`                                                                                | `choices[0].message.content`                                      |
| effective model | `model`                                                                                         | `model`(없으면 `unavailable`)                                     |
| stop reason     | `stop_reason`                                                                                   | `finish_reason`, `refusal`이 있으면 `refusal`                     |
| usage           | `usage.input_tokens` · `output_tokens`                                                          | `usage.prompt_tokens` · `completion_tokens`(없으면 `unavailable`) |
| request id      | `request-id` 헤더                                                                               | `x-request-id` 헤더                                               |
| 재시도          | SDK가 408 · 409 · 429 · 5xx를 최대 2회 재시도. 재시도된 본문은 읽지 않으므로 마지막 응답만 관측 | 재시도 없음(1회)                                                  |

## 측정 축

네 축을 **섞지 않고 따로** 집계. 하나의 점수로 합치지 않음.

| 축          | 측정                                                                         | 출처                                                                                     |
| ----------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Quality     | 아래 [분류 metric](#분류-metric--internalevaluationclassificationgo)         | adapter `Observation`의 `ClassificationPrediction`(production 결과를 옮긴 것)과 raw 판정 |
| Reliability | 호출 수 · 오류 수 · 오류 class(timeout · provider status · 계약 위반 · 기타) | `Observation.Failure` · `Attempts`. 같은 case를 여러 trial로 돌려 흔들림도 봄            |
| Latency     | 호출별 wall time의 p50 · p95 · max                                           | `Observation.ElapsedMs` · attempt별 `elapsedMs`                                          |
| Cost        | 호출 수 · 전체 wall time · token(응답 봉투에 있을 때)                        | adapter가 봉투의 usage를 읽음. 없으면 `unavailable`, 금액 환산은 없음                    |

### 분류 metric — `internal/evaluation/classification.go`

`EvaluateClassification(cases, observations, contract, policy)`(구현됨). 순수 함수이고 provider를 부르지 않음. 한 split · 한 variant · 한 trial의 관측을 받아 `ClassificationSummary`와 case별 `CaseContribution`(판정 전부 · `Quality` · metric)을 돌려줌.

**분모 정책** — 고른 case 전부(`Selected`). 실패 · timeout · 미실행 · 계약 밖 결과는 정답 0으로 세고 `__invalid__` bucket(평가 내부 이름, enum 아님)으로 감. 성공한 응답만으로 나누지 않음. 관측이 없는 case가 있으면 `NotRun > 0` · `Complete: false`이고 official summary가 아님.

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

- **F1 규칙** — gold가 있는데 예측이 없는 label은 F1 0(평균에 들어감). gold가 없는 label은 F1 `not-applicable`이고 평균에서 빠지며 `missingLabels`에 적음
- **canonical과 accepted** — resolved는 하나, adjudicated는 `acceptableActions[0]`이 canonical이고 나머지는 accepted 대안. action confusion과 label 통계는 canonical 기준이며 `offDiagonalAccepted`와 `confusionNote`가 대안 칸이 오답이 아닐 수 있음을 말함. unresolved는 행동을 채점하지 않고 `unresolved` 수로만 남김
- **진단값(점수 아님)** — confidence `high` · `medium` · `low` slice별 category accuracy와 non-none 비율, `other` recall, `none` precision · recall. confidence는 확률이 아니므로 ECE · Brier는 만들지 않음. 대신 제품 규칙(high면 확인 없이 실행) 그대로 [자동 실행 점검](#추출값과-자동-실행-점검)을 잼. `none`은 정상 행동
- **risk** — `forbiddenActions`가 있는 case만. 예측이 forbidden이면 critical error. 실패 · timeout · 미실행은 critical pass가 아니라 `unobserved`이고, `criticalRate`(관측 기준)와 `criticalOrUnobservedRate`(보수적)를 둘 다 냄 — timeout이 위험률을 낮추지 못하게
- **raw 판정 집계** — `rawSyntax` · `rawShape` · `parser`를 `Tally{valid, invalid, unobserved}`로. unavailable을 거짓으로 세지 않음. schema가 틀려도 production이 받았으면 accuracy에는 그대로 들어가고 `rawShape.invalid`에 남음
- **pass policy `classification-pass-v1`** — category 일치 ∧ (canonical 있으면) 예측 ∈ acceptableActions ∧ (risk case면) 예측이 있고 forbidden 아님. `requireSchemaValid: true`인 policy를 명시하면 `schema-valid` check가 더해짐. `Quality`(채점)와 `Execution`(실행)은 분리 — 실행이 끝나지 않으면 `not-evaluated`
- **하지 않는 것** — 실제 행동 실행(dispatch · executor)이 없으므로 "routing 완료율"은 없음. 여기 있는 것은 **추천 행동의 일치**와, 그 행동에 필요한 값을 읽었는지(행동 완료 가능률)까지

## 데이터와 산출물

### wire 계약 — `internal/evaluation`

모든 JSON은 **엄격하게** 읽음 — 모르는 필드 · 뒤따르는 값 · 지원하지 않는 `schemaVersion` · enum 누락 · union 불일치는 오류. 읽기 함수는 `DecodeCase` · `DecodeCaseResult` · `DecodeRunMetadata`.

#### 값의 유무 — `Measure`

없는 값이 0으로 읽히는 길을 타입으로 막음. `value`는 pointer라 0과 null이 다름.

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

짝이 틀리면 `Measure.UnmarshalJSON`이 거절. `value: 0`은 `omitempty`로 사라지지 않음.

#### dataset — `tools/evals/datasets/<name>/` (`manifest.json` `schemaVersion` 1)

```
manifest.json       이름 · version · task · tier · split 파일과 case 수 · category당 목표
dev.jsonl           지시를 고치며 반복해서 보는 몫
validation.jsonl    고른 뒤 확인하는 몫 — 사람 검토만 채점
held-out.jsonl      마지막에만 보는 몫 — 사람 검토만 채점, AllowHeldOut 없이 열리지 않음
fixtures/           사진
(테스트 fixture pilot-v1에만 fixtures/sources/ — 합성 사진의 원본과 렌더 스크립트, drafts/ — 후보와 정답 지침. loader가 읽지 않음)
```

- **tier** — `software-fixture`(loader 테스트 · 형식 예시 — `internal/evaluation/testdata`와 `tools/evals/datasets/sample-*`) · `synthetic-pilot`(합성 사진, benchmark 아님) · `golden-benchmark`(사람 검토 정답). 점수의 뜻은 tier가 정함
- **manifest** — `splits.<split>.cases`가 실제 줄 수와 다르면 거절. `targetPerCategory`는 정책이고 수를 채우려고 정답을 지어내지 않음
- **loader** — `LoadDataset(dir, contract)`. root를 `EvalSymlinks`로 풀고 그 아래 파일만 읽음. URL · 절대 경로 · `..` · symlink escape · 크기 초과(production 상한 7,500,000 byte) · 내용으로 판별한 형식과 `mediaType` · 확장자 불일치 · sha256 불일치 · 잘못된 UTF-8 · 빈 줄 · 뒤따르는 JSON · 중복 id · split · task 불일치를 거절
- **누출 검사** — 같은 사진(sha256)이나 같은 `provenance.sourceGroupId`가 split 사이에 걸치면 거절. 같은 원본의 crop · 재압축은 사람이 같은 group으로 묶음. **near-duplicate 탐지는 없음**
- **selection hash** — `Dataset.Select(split, opts)`가 id 순으로 정렬한 case의 `id · JSONL 원문 · 사진 byte`를 sha256. 파일 순서와 무관

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

- **id** — 소문자 · 숫자 · `-`만. dataset 전체에서 유일
- **revision** — 1부터. expected를 고치면 올림. 결과의 `caseRevision`이 어느 정답에 채점했는지 말함
- **split** — `dev` · `validation` · `held-out`. **difficulty** — `easy` · `medium` · `hard`
- **provenance** — `privacy`(`synthetic` · `no-personal-data` · `redacted`) · `privacyReview`(`draft` · `reviewed`) · `generation`(도구 · 원본). 이름 · 전화번호 · 계좌번호가 있는 사진은 넣지 않음. 모델 출력(facts)이 산출물에 그대로 남으므로 dataset이 깨끗해야 산출물도 깨끗함
- **annotation** — `review`(`draft` · `reviewed` · `disputed`) · `method`(`human` · `agent-visual`) · `ambiguity`(`none` · `low` · `high`) · `guideline`(정답 지침 이름)
- **input** — 사진 task는 `image`(clean 상대 경로 · `image/*` · sha256 64 hex), translation은 `text`. task와 다른 branch는 거절
- **expected.classification** — `category`는 `processing.Contract`의 값. 행동은 하나로 강제하지 않음 — `intent`가 `resolved`면 `acceptableActions` 하나, `adjudicated`면 둘 이상, `unresolved`면 없음(routing은 채점하지 않음). `forbiddenActions`는 run 전에 정함. 두 목록은 비어도 `[]`로 있어야 함
- **expected.classification.facts**(선택) — 사진에서 읽어야 하는 값. `{id, label, kind, acceptedValues, requiredFor}`. `kind`는 `text` · `amount` · `date` · `time`, `requiredFor`는 이 값이 없으면 끝낼 수 없는 행동(비어도 `[]`). 규칙은 [추출값과 자동 실행 점검](#추출값과-자동-실행-점검)

#### text-extraction — 계약과 offline metric (`internal/evaluation/text.go`)

production에는 텍스트 추출 adapter가 없음. `facts`는 전체 OCR이 아니고 그 값을 이어 붙여 예측으로 쓰지 않음. 이 절은 standalone 계약과 replay로만 검증하는 evaluator이고, live adapter는 `unsupported`(호출 0회 · `skipped`).

- **input** — 사진(`image`)과 선택 `language`(BCP 47 힌트)
- **expected.textExtraction** — `text`(전체 텍스트, `null`은 거절 · `""`는 빈 텍스트가 정답) · `readingOrder`(`lines-top-to-bottom` · `columns-right-to-left`) · 선택 `tokenizer`(`whitespace`만) · 선택 `fields[]{id, aliases, acceptedValues, important}`
- **prediction** — `text`와 선택 `fields{key: value}`. replay fixture 한 줄에 `text` · `fields`로 기록
- **정규화 `text-ws-v1`** — CRLF · CR → 줄바꿈으로 보고, 모든 Unicode 공백의 연속을 공백 하나로, 양끝 trim. 구두점 · 대소문자 · 통화 · 숫자는 보존. **Unicode 정규화는 `none`** — 한글 완성형(NFC)과 분해형(NFD)은 다른 문자열이며 자동으로 같아지지 않음. NFC는 `x/text`(지금 indirect) 승인 뒤 v2로 따로 둠. stdlib로 NFC를 직접 구현하지 않음
- **metric(case)** — raw EM(원문 비교) · normalized EM · CER = rune Levenshtein(정규화 뒤) / 정답 rune 수 · WER = 단어 Levenshtein / 정답 단어 수(`tokenizer: whitespace`인 case만, 아니면 `not-applicable`) · field accuracy = 맞은 field / 계약 field · important field recall. 편집 수와 길이(`charEdits` · `refChars` · `wordEdits` · `refWords`)를 case result에 남김. 삽입이 많으면 CER > 1이고 자르지 않음. byte · 자모 · grapheme이 아니라 코드포인트
- **빈 정답** — CER · WER `not-applicable`, `hallucinatedChars` · `hallucinatedWords`와 EM만 표시. 양쪽이 비어도 CER 0을 만들지 않음. 정답 `null`은 dataset 오류
- **field** — 예측 key는 `id`나 승인된 `aliases`와 정확히 같아야 하고 값은 공백 정규화 뒤 `acceptedValues` 중 하나. 계약 없는 case의 field metric은 `unsupported`. 한국어 label을 추정으로 잇지 않음
- **metric(corpus)** — `corpusCer` = Σedits / Σref runes(합의 비율), `meanCaseCer` = case 비율의 평균, 이름을 나눔. WER도 같음. category · action 열은 없음
- **field id별 집계 `fieldStats`** — id마다 `support`(계약에 둔 case) · `important` · `evaluated`(예측이 있어 판정한 case) · `correct` · `wrong` · `missing` · `accuracy`(= correct / evaluated, 0이면 `not-applicable`). case 판정을 그대로 세고 alias · 값 일치를 다시 하지 않음. 실행 실패 · 미실행 case의 field는 support에만 들어감. field 계약이 있는 case가 없으면 빠짐(v1 선택 field — 아래 호환 규칙)
- **pass `text-pass-v1`** — normalized EM ∧ (field 계약이 있으면) 전부 맞음. 허용 오차 없음
- **상한** — 텍스트 하나 10,000 rune. 정답이 넘으면 dataset 오류, 예측이 넘으면 CER `unavailable` · `overLimit`. 편집 거리는 두 줄 DP라 메모리 O(min(n, m))
- **replay** — 형식 예시는 `tools/evals/datasets/sample-text-extraction`(합성 렌더 1장, 정답은 렌더 원문)과 `predictions/sample-text-extraction.jsonl`. 테스트는 `testdata/datasets/ocr-fixture`(software-fixture)와 `testdata/ocr/replay-predictions.jsonl`로 CLI replay를 검증. 결과는 software check이고 benchmark가 아님
- **비교** — quality 축은 EM 비율 · corpus/mean CER · corpus WER · field 비율 · pass rate. case 변화는 저장된 check(`text-normalized-exact` · `fields-all-correct`)로 나열하고 원문 대신 길이 · CER만 적음

#### translation — 계약과 reference 비교 (`internal/evaluation/translation.go`)

production에는 번역 adapter가 없음. 분류 결과의 `translate` 추천은 번역이 아니고 번역 성공으로 세지 않음. 이 절은 gold 원문 → 번역문 task의 계약과 deterministic reference 비교이며, 의미 품질의 ground truth가 아님.

- **input.text** — `sourceText`(사람이 확정한 gold 원문 · OCR 출력 아님) · `sourceLanguage` · `targetLanguage` 필수. 선택 `sourceImage`는 provenance일 뿐 adapter 입력에 실리지 않음(테스트가 확인)
- **expected.translation** — `references[]`(승인된 reference 1개 이상) · 선택 `criticalSpans[]{id, kind(number · date · name · other), accepted[]}`
- **prediction** — `text`(번역문)와 선택 `targetLanguage`(출력이 선언한 언어). 언어 감지는 구현하지 않았고 `languageMetadataMatch`는 선언값과 case 값의 일치일 뿐임
- **EM** — raw는 원문 비교, normalized는 `text-ws-v1` 뒤 비교. 어느 reference와 같았는지(`rawMatchedReference` · `normalizedMatchedReference`)를 남김. Unicode 정규화는 `none`
- **critical span** — `accepted` 표기 중 하나가 정규화한 번역문에 나타나면 보존. **경계 정책**: 값이 나타난 자리의 양옆 rune이 값의 가장자리와 같은 부류면 불일치 — 숫자 옆 숫자(`12` vs `120`)와 숫자로 이어지는 소수점 · 자릿수 구분자(`12` vs `12.5`), 라틴 옆 라틴(`Seoul` vs `Seoulite`)은 막고, 한글 · 한자 · 가나는 조사 · 어미가 붙는 글이라 붙어도 일치(`서울에서`). 부분 문자열 우연 일치를 막기 위한 규칙이고 형태소 분석이 아님
- **pass policy** — 기본 `translation-reference-v1`은 case를 채점하지 않음(`unscored`): 적절한 의역이 EM에 실패할 수 있고 그것을 의미 오류로 단정하지 않음. `--policy translation-exact-v1`을 명시하면 normalized EM ∧ span 전부 보존으로 strict pass · fail
- **unsupported** — semantic similarity · BLEU · chrF는 `unsupported`, judge는 `not-measured`. 자체 간이 점수를 표준 이름으로 표시하지 않음. 총점 없음
- **replay** — `testdata/datasets/translation-fixture`와 `testdata/translation/replay-predictions.jsonl`로 CLI replay를 검증. 결과는 software check
- **미래 pipeline task** — image → OCR → translation은 별도 versioned task id · 계약으로 두고 OCR-conditioned 점수와 overall 점수를 나눔. 지금 없음

#### Phase 2 — judge 계약(문서만)

LLM judge · 사람 평가는 구현하지 않았고 pseudo 구현도 두지 않음. 구현할 때 산출물에 남겨야 하는 것:

- **judge variant** — provider · 요청 모델 · effective model · prompt version과 hash · temperature 지원 여부(공급자가 무시하면 `unsupported`) · rubric id와 hash · trial 수
- **판정 기록** — case별 raw judge text(개인정보 검토된 case만) · 구조화 판정 · usage · cost(가격표가 있을 때만 추정) · latency · attempt
- **blind** — judge에 variant id · 모델 이름을 보이지 않음. 순서 무작위화의 seed를 기록
- **human reference** — 사람 평가는 같은 rubric으로 같은 case에 적고 judge와의 일치율을 냄. 사람 평가 없이 judge 점수를 ground truth로 쓰지 않음
- **deterministic check 우선** — critical span · 언어 metadata · EM은 judge와 별개로 항상 계산하고 judge가 이를 덮어쓰지 않음
- **비교 가능성** — judge 모델 · prompt hash · rubric hash가 다른 run의 judge 점수는 비교하지 않음

#### 채점 자격과 readiness

값이 있다고 검토가 있었던 것은 아님. **검토 사실은 값을 적은 사람의 책임**이고 코드는 값만 봄.

- **eligible** — `annotation.review: reviewed` · `provenance.privacyReview: reviewed` · `ambiguity`가 `high`가 아님 · dev가 아닌 split은 `method: human`. 아니면 `LoadedCase.Blockers`가 이유를 말함
- **Select** — `AllowDrafts` 없이 자격 없는 case가 있으면 거절(id와 이유만, 내용은 출력하지 않음). 빈 split은 항상 거절 — **빈 split의 100%는 성공이 아님**. `held-out`은 `AllowHeldOut`이 있어야 열림
- **Readiness** — split별 cases · reviewed · draft · eligible · category별 eligible 수와 목표. `BenchmarkReady`는 tier가 `golden-benchmark`이고 모든 case가 eligible이며 목표를 채웠을 때만. 아니면 `Reasons`
- **정답 격리** — prompt · few-shot · RAG corpus는 `validation.jsonl` · `held-out.jsonl` · 그 사진을 읽지 않음. 개발 중 held-out 내용을 출력하지 않음. exporter · fine-tuning 경로는 없음. 운영 규칙은 [tools/evals/README.md](../../tools/evals/README.md)

#### case result — `cases.jsonl` 한 줄 (`schemaVersion` 1)

실행(`execution`)과 채점(`quality`)을 따로 둠. 호출이 끝나지 않으면 `quality.outcome`은 `not-evaluated`이고 `prediction`은 null — failed도 0점도 아님.

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

위는 모양 예시이고 실측값이 아님.

- **execution.status** — `completed` · `failed` · `timed-out` · `skipped`. `attempts`는 skipped면 0. replay 기록과 모델 없는 기준선은 완료여도 0일 수 있음. failed · timed-out은 `error`를 반드시 가짐, completed는 갖지 않음
- **execution.error** — `class`(`timeout` · `provider` · `contract` · `transport` · `other`) · `message`(512자 이하, `Bearer ` · `base64,` 포함 시 거절)
- **quality** — completed일 때만 `checks`가 있고 `outcome`은 check 하나라도 `failed`면 `failed`. 불일치는 거절
- **prediction** — completed일 때만. image-classification은 `ClassificationPrediction`(production 결과와 같은 JSON, 값은 계약 안), 텍스트 task는 `{ "text": "..." }`
- **metrics** — 이름별 `Measure`. `{}`는 허용, 누락은 거절
- **model**(선택) — `{requested, answered}`. `requested`는 이 호출에서 요청한 모델(계단식으로 다시 물었으면 두 번째 모델), `answered`는 응답 봉투의 `model` 값(`Text`, 없으면 `unavailable`). 미실행 · 미지원 · 모델 이름 없는 replay 기록에는 없음. variant 요약의 `models`가 답한 모델별 수 · 이름 없음 · 요청과 다름(요청한 이름이나 그 `-날짜` 판이 아닌 것, 예: 거절 뒤 대체 모델)을 셈
- **usage · cost** — `Measure`. token은 adapter가 응답 봉투에서 읽은 값(없으면 `unavailable`), cost는 `not-measured`. cost에 값이 있으면 `currency` 필수

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

- **variant** — `provider`는 `config.ProviderAnthropic` · `config.ProviderOpenAI`(목록을 베끼지 않음), `baseHost`는 openai일 때 host만. 파일 없이 `[설정@]공급자:모델`로 만든 variant는 그 참조가 `ref`(선택 필드)로 남음. **API key · Authorization · 이미지 byte · base64는 어느 산출물에도 쓰지 않음**
- **비교 가능 조건** — `dataset.selectionHash` · `evaluatorPolicyHash`가 같을 때. `variant.contractHash`가 다르면 prompt · schema가 다른 것

#### comparison — `results/comparisons/<comparisonId>/` (`schemaVersion` 1)

`internal/evaluation/compare.go`(구현됨). `LoadRun`이 두 run의 raw를 읽어 요약을 다시 만들고(저장된 summary.json과 다르면 거절), `Compare`가 baseline · candidate(run · variant · trial)를 짝지어 비교함. 모델 API · adapter를 부르지 않음.

- **비교 가능 조건** — dataset 이름 · version · split · selection hash · 고른 case id · task · mode · policy · evaluator policy hash · label contract hash(category · action · confidence 목록) · evaluator source hash(`internal/evaluation`만)가 같고 두 run이 `completed`. 하나라도 다르면 `comparable: false`와 구체 이유, **delta 없음**
- **실험 변수** — commit · 전체 source hash · variant의 contract hash(지시 변경) · 모델 · 공급자는 달라도 됨
- **허용 flag** — `AllowPartial`은 짝이 맞는 case만 서술하고 gate를 적용하지 않음. `AllowEvaluatorDrift`는 채점기가 바뀐 run을 이 build의 채점기로 raw에서 다시 계산해 비교하며 경고를 남김. 조용히 비교하지 않음
- **짝** — case id · revision · task로. 한쪽에 없거나 두 번 있으면 오류
- **metric delta** — baseline · candidate · 절대 차이 · `deltaPp`(percentage point, 비율만) · `relativePercent`(baseline 대비 %, baseline 0이면 값 없음) · 방향(`higher-is-better` · `lower-is-better`) · `change`(improved · regressed · unchanged · not-comparable)
- **축** — quality(정확도 · macro F1 · canonical/accepted action · joint · pass · critical · raw invalid 수) · reliability(completion rate · failed · timed-out · wire calls) · latency(둘 다 live · 완료 n > 0 · timeout 설정 같을 때만) · cost(둘 다 usage 완전 측정일 때만 token, 금액은 가격표 없음). 한 축이 비교 불가여도 다른 축은 보고
- **case 수준** — category · action-accepted · joint별 newly failed · fixed(예측 문자열 포함), 실행 변화(newly errored · errors resolved), critical 변화(new · resolved). category별 support · P · R · F1 delta로 평균에 가려진 악화를 드러냄. confidence slice는 두 쪽을 나란히 두되 calibration 수치는 없음
- **gate** — `GatePolicy{version, maxNewCriticalErrors, maxPassRateDropPp, maxSchemaInvalidIncrease}`처럼 값을 적은 규칙만 판정. 기본 gate · 기본 weight · 기본 허용치 없음. partial · evaluator drift면 적용하지 않음
- **결론** — 서술만("descriptive only … No statistical significance or superiority is claimed"). 짝 30개 미만이면 small-sample 경고
- **저장** — `WriteComparison`이 `results/comparisons/<id>/comparison.json` · `.md`를 쓰고 run 산출물은 건드리지 않음. id는 두 RunRef에서 결정적으로 만들고 충돌은 거절. golden은 `testdata/comparisons/`의 `replay-pair`(gate 통과) · `gate-failed` · `partial-pair` · `incomparable` · `text-pair` · `translation-pair` — DevHub `/evals/compare/[id]`가 같은 파일로 테스트함

### 실행 산출물 — `tools/evals/results/<runId>/`

`internal/evaluation/artifact.go` · `aggregate.go`(구현됨). `.gitignore`는 `/tools/evals/results/`만 무시하고 reviewed dataset · variant manifest · testdata는 추적함. generated 결과를 git benchmark로 착각하지 않음.

| 파일            | 역할                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `metadata.json` | 정본. `RunMetadata` + `status`(`running` → `completed` · `partial`) · `finishedAt` · `abort`. 마지막 쓰기 |
| `cases.jsonl`   | 정본. invocation마다 `CaseResult` 한 줄, not-run · unsupported 포함                                       |
| `summary.json`  | 파생물. `RunSummary` — raw 두 파일에서 `RegenerateSummary`로 다시 만들면 같은 byte                        |
| `summary.md`    | 파생물. 사람이 읽는 표. 문자열 칸은 escape, 숫자는 locale 무관                                            |

- **채점과 쓰기의 경계** — runner가 invocation마다 `NewCaseResult`(task의 `score` · 개인정보 검토 전 원문 제외)로 `CaseResult`를 만들고, `RunWriter`는 그 결과가 이 run · 고른 case의 것이고 wire 계약을 지키는지만 보고 씀. writer는 task · policy를 모르고 `Plan`도 받지 않음
- **쓰는 순서** — `RunWriter.Begin(metadata)`이 디렉터리를 만들고 metadata(running)를 씀 → `Result(CaseResult)`가 case 한 줄씩 → `Finish`가 flush · fsync · close → raw에서 summary를 만들어 임시 파일 뒤 rename → 종료 metadata. 어느 단계의 실패도 성공으로 보고하지 않음(쓰기 실패 → run 중단, summary 실패 → metadata는 running으로 남음)
- **충돌 · root** — 같은 `runId`가 있으면 거절. root는 있는 디렉터리여야 하고 dataset 디렉터리(manifest.json)면 거절. 기존 run · dataset을 덮어쓰지 않음
- **interrupted** — 취소 · 예산 소진은 남은 invocation을 `not-run`으로 쓰고 `status: partial` · `abort`. 프로세스가 죽어 줄이 빠지면 요약이 `missing`으로 세고 partial. 잘린 마지막 줄은 요약이 거절
- **summary 구조** — run 수준(`status` · `abort` · `officialEligible` · `reasons`)과 variant별 `execution`(selected · invocations · attempted · completed · failed · timedOut · unsupported · notRun · cancelled · missing) · `outcome`(passed · failed · unscored) · `quality`(trial별 [분류 metric](#분류-metric--internalevaluationclassificationgo) 그대로) · `reliability` · `latency` · `cost`. **종합 점수 없음**
- **불변식** — invocations = attempted + unsupported + notRun + missing, attempted = completed + failed + timedOut, passed + failed + unscored = invocations. 실행 오류는 unscored이지만 분류 정확도 분모(selected)에서 빠지지 않음
- **latency** — adapter wall time(ms). attempted(timeout · 실패 포함)와 completed 두 집합의 n · mean · median(짝수면 가운데 둘의 평균) · p95(nearest-rank, ceil(0.95·n)번째). n = 0이면 `not-applicable`, n < 10이면 주의 문구. replay는 재지 않음
- **cost** — wire call 수, invocation별 알려진 usage의 합(`known` · `unknown`, 일부 없으면 `partial` + 소계), `estimated` · `actual`은 `unavailable`. 가격표(`source` · `version` · `asOf` · `currency`)가 있고 usage가 완전할 때만 추정을 더할 수 있고, 지금 최신 가격을 코드에 넣지 않음. 같은 invocation의 category · action check는 비용 · token · latency를 한 번만 셈
- **공식 benchmark gate** — partial · replay · draft 포함 · `golden-benchmark`가 아닌 dataset · 불완전한 trial은 `officialEligible: false`와 이유
- **안전** — 오류는 class · kind · 고정 문구만. 모델 원문 텍스트는 `privacyReview: reviewed`인 case에서만 남기고, 설정된 key가 되풀이되면 `[redacted]`. 테스트가 secret sentinel · 이미지 byte · notes 부재를 확인
- **golden** — `internal/evaluation/testdata/artifacts/`의 `replay-golden`(분류) · `text-golden` · `translation-golden`(tr-3 not-run이라 partial)은 replay 예시의 네 파일이며 byte 단위로 비교. 숫자는 손계산 · replay 출처. production 지시 · schema가 바뀌면 metadata의 contract hash가 달라져 `EVAL_UPDATE_GOLDEN=1`로 다시 만듦

#### Artifact v1 호환 규칙

run · comparison 산출물은 DevHub와 이후 Go 리팩터링이 기대는 경계다. 파일 배치는 위 표 그대로이고 `manifest.json` · `metrics.json` 같은 파일을 더하지 않는다.

| 파일              | 성격                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `metadata.json`   | 정본 run metadata                                                            |
| `cases.jsonl`     | 정본 invocation 결과                                                         |
| `summary.json`    | 파생 · 재생성 가능. 기계가 읽는 요약                                         |
| `summary.md`      | 파생 · 재생성 가능. 사람이 읽는 표일 뿐이고 파싱하지 않음                    |
| `comparison.json` | 저장된 비교 read model. 두 run의 정본에서 다시 만들 수 있으나 id 충돌은 거절 |
| `comparison.md`   | 사람이 읽는 비교 표                                                          |

- **v1 안에서 허용** — 선택 field 추가(Go `omitempty` · 없으면 null로 읽음). `artifact_contract_test.go`의 `frozenKeys`와 이 문서에 함께 적음. 지금까지 더한 것: text 요약의 `fieldStats`(DevHub decoder는 없으면 빈 목록), 이어서 실행한 run의 metadata · summary `retriedFrom` · case `carriedFrom` · execution `carried`(없으면 0). 채점기 build가 바뀌므로 이전 run의 저장된 summary는 `report`로 다시 만든 뒤 비교함
- **schemaVersion을 올림** — field 삭제 · 이름 변경 · 타입 변경, 같은 field의 뜻 변경(분모 · 단위 · availability 규칙), 필수 field 추가
- **모르는 schemaVersion** — Go(`schemaVersion N is not supported (want 1)`)와 DevHub decoder 모두 읽지 않고 버전을 말하며 멈춤
- **읽는 쪽의 엄격함** — Go는 모르는 field를 거절(같은 build가 쓰고 읽음). 새 v1 build가 더한 선택 field는 이전 build가 거절하므로 비교는 한 build로 함. DevHub decoder(`apps/devhub/src/lib/evaluations/decode.ts`)는 필수 field만 검사하고 모르는 field는 무시
- **값의 유무** — `Measure`의 `{"availability":"measured","value":0}`은 값 0, 나머지 availability는 `value: null`과 이유. 두 decoder가 같은 짝 규칙을 검사
- **고정 방법** — Go `TestArtifactV1*`가 golden을 엄격 decode · summary 재생성 byte 비교 · 최상위 key 고정 · availability 값 검사를 하고, DevHub `contract.spec.ts`가 **같은 golden 파일**을 decode함. golden을 다시 만들면 두 쪽이 함께 돎

## runner — variant · 선택 · 예산 · 중단

`internal/evaluation/variant.go` · `runner.go`(구현됨). CLI는 이 위에 flag만 얹음.

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

- **adapter** — `processing`(production 분류기)과 `baseline`(모델 없는 규칙, provider `none`). registry가 adapter별 지원 task를 가짐(둘 다 image-classification). 지원하지 않는 task의 variant는 plan에 `supported: false`로 남고 실행 시 호출 0회 · `skipped` 결과
- **provider별 검증** — anthropic은 `endpoint` 금지 · `apiKeyEnv` 필수. openai는 `endpoint`가 http(s) · host 필수 · userinfo · query · fragment 금지. localhost도 실제 호출 대상
- **key** — `apiKeyEnv`는 환경변수 이름. 값은 adapter를 만들 때 읽고 산출물 · plan에 두지 않음. plan은 그 변수가 비었는지(`missingCredential`)만 표시
- **expectedContractHash** — manifest를 쓸 때의 production 지시 · schema hash. 실제 `DescribeContract().Hash`와 다르면 거절. 실험 지시(`config.promptPath`)를 써도 이 값은 production hash이고, 실험 지시는 따로 `promptHash`로 남음
- **config** — `promptPath` · `retrieval` · `cascade` · `baseline`만 받음([실험 설정](#실험-설정)). `temperature` · `seed` · `ensemble`은 값이 있으면 preflight 오류. 모르는 필드(예전 `rag` 포함)도 오류
- **placeholder** — manifest의 명시 필드 `"placeholder": true`. 예시 · replay 전용 manifest에 표시하고 live preflight가 거절함. 표시 없이 `<...>` 모양의 모델 이름을 쓰면 검증에서 거절. 최신 모델이나 로컬 설정의 값을 대신 고르지 않음. 저장소의 `local.example.json` · `replay-example.json` · `replay-candidate.json` · `text-extraction-replay.json` · `translation-replay.json`이 이 상태

### plan — `NewPlan(RunRequest)`

모델 API를 부르지 않고 확정하는 것.

- **선택** — `Dataset.Select(split, AllowDrafts · AllowHeldOut)` → `CaseIDs` 필터(선택 밖 id는 오류) → `Limit`. 순서는 항상 id 순이고 `selectionHash`는 실제로 고른 case의 내용 hash. 빈 선택은 오류
- **variant** — id 중복 · dataset과 task 불일치 · 모르는 adapter는 오류. `planned = 지원 variant × case × trial`
- **preflight** — live면 `AllowAPI` 없음 · 예산 ≤ 0(모델을 부르는 variant가 있을 때만) · placeholder · 빈 credential, replay면 replay source 없음. 하나라도 있으면 `Run`이 adapter를 만들지 않고 거절
- **기본값** — trials 1 · concurrency 1(그 밖은 오류) · case timeout 2분(production 처리 상한과 같음) · result cache 없음

### run — `Run(ctx, RunRequest, Deps, Sink)`

- **순서** — variant → case → trial. 자체 재시도 없음. 실패 case를 다시 불러 성공만 남기지 않음
- **이어서 실행(`RunRequest.Carry`)** — `LoadCarry(dir)`가 이전 live run의 completed 결과를 읽고, runner는 그 invocation을 부르지 않고 기록된 관측(`observationOf`)을 지금 채점기로 다시 채점해 쓴다(`carriedFrom`). 나머지만 adapter를 부르고, 전부 옮기는 variant는 adapter를 만들지 않고 key preflight도 건너뜀. 같은 dataset selection · 고른 case · label contract · trials · variant 설정이 아니면 `Run`이 거절. metadata에 `retriedFrom`, 수에 `carried`. 옮긴 관측의 재채점이 원래 결과와 같은지는 실제 run 두 개(45건)로 확인
- **예산** — `FixedBudget(CallBudget)` 하나를 모든 variant의 observer가 공유. SDK 재시도까지 실제 HTTP 왕복마다 1씩 줄고, 바닥나면 그 호출은 나가지 않음(`budget-denied`)
- **중단** — 예산 소진 · ctx 취소(Ctrl+C)는 그 시점부터 남은 invocation을 `not-run`으로 표시하고 `abort`에 이유를 남김. 이미 완료된 결과는 그대로. 요청 도중 취소된 invocation도 측정이 아니라 `not-run`
- **timeout** — case마다 `context.WithTimeout`. timeout은 `timed-out` 결과이고 중단이 아님
- **수** — `selected` · `planned` · `attempted`(live에서 adapter를 실제로 부른 수) · `completed` · `failed` · `timedOut` · `skipped` · `notRun` · `wireCalls`
- **mode** — `live`는 provider 호출, `replay`는 `ReplaySource`의 기록을 다시 채점. replay 결과의 `latency`는 `not-measured`이고 wire call은 0. usage는 기록된 값을 그대로 씀
- **usage · cost** — 알려진 usage의 합과 `known` · `unknown` 수. unknown이 있으면 합은 `partial`. cost는 `not-measured`
- **결과 sink** — `Sink.Begin(metadata)` 뒤 invocation마다 채점을 마친 `Sink.Result(CaseResult)`. 쓰기 실패는 run을 그 자리에서 멈춤. `RunReport.Observations(variantID, trial)`이 채점 입력을 줌 — 한 번의 호출로 category · action 두 check
- **lineage** — `CollectSource(apiDir, GitInfo)`가 commit · branch · dirty와 `internal/processing` · `internal/evaluation` · `internal/evaluation/processingadapter` · `internal/evalcli` · `cmd/eval`의 `.go` 파일 hash(`sourceHash`), `internal/evaluation`만의 hash(`evaluatorHash`), `go.mod` · `go.sum` hash, Go 버전을 냄. 다른 파일(설정 · secret)은 읽지 않음. `RunMetadata`에는 여기에 dataset selection(tier 포함) · 고른 case id · variant 목록(비밀값 없음) · policy와 hash · label contract hash · sampling · controls(timeout · allowApi · callBudget · allowDrafts · allowHeldOut) · 종료 상태가 들어감

## 실험 설정

같은 dataset · 같은 채점기 위에서 **무엇을 바꿔 보는지**. 전부 `config` 한 곳에서 켜고, 모델을 쓰는 실험(지시 · 예시 · 계단식)은 모델 없는 설정 파일 `tools/evals/experiments/<설정>.json`(`schemaVersion` · `id` · `version` · `config`)에 두어 `--variant <설정>@<공급자>:<model>`로 실행할 때 모델을 얹음(`evaluation.WithExperiment`, id는 `<설정>-<모델 id>`). 기준선은 모델이 없어 `variants/`의 manifest. 산출물의 variant에 설정이 그대로 남음(지시는 본문 대신 sha256 `promptHash`). production 서버 동작은 바뀌지 않음.

| 설정             | manifest                                                                                                 | 하는 일                                                                                                                                                                   | 호출                              |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 기준선           | `adapter: "baseline"` · `provider: "none"` · `config.baseline`                                           | `constant`는 늘 같은 답, `nearest`는 가장 비슷한 dev 사례의 정답을 그대로(`retrieval` 필요)                                                                               | 0회. `--allow-api` 없이 live로 돎 |
| 여러 모델        | 파일 없이 `--variant anthropic:<model>` · `openai:<model>`(manifest를 즉석에서 만듦)                     | `--variant`를 반복하면 한 run에서 같은 case를 variant 순으로 돎                                                                                                           | case × variant                    |
| 실험 지시        | `config.promptPath` — 설정 파일 기준 상대 경로(위로 못 나감)                                             | system 지시만 그 파일로 바꿈. 요청 문구 · 결과 schema · `parseResult` 검증은 production 그대로. `processing`의 `WithInstructions`가 만든 복사본을 쓰고 서버는 부르지 않음 | case당 1                          |
| 비슷한 사례 예시 | `config.retrieval.k`(1–5)                                                                                | runner가 dev split에서 k개를 골라 정답(category · 행동 · 첫 허용 facts)을 지시 끝에 힌트로 붙임. case id는 모델에 가지 않음                                               | case당 1                          |
| 계단식           | `config.cascade` — 파일엔 `escalateOn`(confidence 목록)만, 두 모델은 `cascade@<공급자>:<첫>,<다시 물을>` | 첫 모델 답의 confidence가 목록에 있거나 답이 없으면 `cascade.model`에 다시 물음. 예산 거절 · 취소면 다시 묻지 않음. 호출 · token은 두 번을 합침                           | case당 1–2                        |

### 비슷한 사례 검색 — `internal/evaluation/retrieval.go`

- **예시를 고르는 곳** — dataset의 **dev split에서 채점 자격이 있는 사진 분류 case만**. validation · held-out은 어떤 경우에도 예시가 되지 않음. 질문 case 자신과 같은 원본 묶음(`sourceGroupId`)은 빼서 답이 새지 않게 함
- **유사도** — 사진을 16×16 격자 밝기 평균으로 줄이고 평균을 뺀 뒤 길이 1로 맞춘 vector의 cosine. 표준 라이브러리(`image/png` · `image/jpeg`)만 씀. 배치가 닮은 사진이 가까워지는 방식이라 **글자 사진의 내용은 구분하지 못함** — 아래 수치가 그 한계를 보여 줌. 내용 기반 검색(글자 추출 뒤 검색 · embedding 모델)은 의존성이나 추가 호출이 필요해 하지 않음
- **기록** — case 줄의 `retrieval.examples`(`caseId` · 예시의 정답 `category` · `similarity`). 요약의 `retrieval`은 이 기록에서 다시 계산: 첫 예시 적중(`top1Rate`) · k개 안 적중(`hitRate`) · MRR. 적중 = 예시의 정답 category가 질문 case와 같음
- **모델 없이 재기** — `pnpm eval retrieve --dataset apps/api/internal/evaluation/testdata/datasets/pilot-v1 --k 3`이 split의 case마다 예시를 찾아 같은 수치를 냄

### 추출값과 자동 실행 점검

- **추출값 찾기** — label은 보지 않고 **값만** 봄. 예측 facts 중 하나라도 허용 값을 담으면 찾은 것. `amount`는 천 단위 쉼표를 없앤 수 하나가 예측 값의 수 중에 있어야 하고, `date` · `time`은 숫자 묶음(앞의 0 제외)이 예측 값 안에 순서대로 이어서 있어야 함(`2026-09-20` ≈ `2026년 9월 20일 19:42`, `10월 25일` ≈ `2026-10-25`). `text`는 공백을 빼고 대소문자를 무시한 포함. `오후 2시`처럼 숫자만으로 모호한 값은 `text`로 여러 표기를 적음
- **행동 완료 가능** — 허용 행동을 골랐고, 그 행동이 `requiredFor`에 있는 facts를 모두 찾았음. facts가 있고 행동을 채점하는 case만 분모. 행동이 `none`이면 필요한 값이 없어 완료 가능
- **자동 실행 점검** — 제품은 confidence `high`이고 행동이 `none`이 아니면 확인 없이 실행한다고 보고, 그 답이 **해도 되는 답**(category 맞음 · 허용 행동 · 금지 행동 아님 · facts가 있으면 완료 가능)인지 셈. `highWrongRate` = high 중 해선 안 되는 답, `autoPrecision` = 자동 실행 중 맞은 답, `autoCoverage` = 고른 case 중 자동 실행 몫
- **pass에는 넣지 않음** — `classification-pass-v1`은 그대로. 추출값 · 자동 실행은 따로 보는 품질 지표이고 compare의 quality 축에 `facts-recall` · `action-ready-rate` · `high-but-wrong-rate` · `auto-run-precision` · `auto-run-coverage`로 들어감. 이 집계가 없는 옛 요약은 `unavailable`로 비교

### pilot-v1(테스트 fixture)에서 모델 없이 잰 값

2026-09-26, dev 21건. 모델을 부르지 않은 실제 실행이고, 모델 성능 수치가 아님.

| variant                                        | category 정확도 | pass rate | critical 비율 | high인데 틀림 | 자동 실행 정확도 |
| ---------------------------------------------- | --------------- | --------- | ------------- | ------------- | ---------------- |
| `baseline-always-other`(늘 other / none)       | 14.3%           | 14.3%     | 0%            | high 없음     | 자동 실행 없음   |
| `baseline-nearest-case`(가장 비슷한 사례 복사) | 14.3%           | 14.3%     | 33.3%         | 90.5%         | 0%               |

`retrieve --k 3` — 첫 예시 적중 14.3%(3/21) · 3개 안 적중 33.3% · MRR 0.230. 무작위로 골랐을 때 첫 예시 적중 기대값은 약 10%(다른 20건 중 같은 category 2건). 사진 배치만으로는 글자 사진을 거의 구분하지 못하고, 그 예시를 그대로 따르면 금지 행동이 나온다는 것이 이 표의 결론. 모델 variant는 이 두 줄보다 나아야 의미가 있음.

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

- **전달** — 루트 script `eval`이 `nx run api:eval`을 감싸고, 그 target은 `nx:run-commands`(cwd `apps/api`, `cache: false`, `go run ./cmd/eval`). `pnpm eval list`처럼 인자가 그대로 붙는 것을 실제 실행으로 확인(`--`를 넣어도 같음)
- **root** — CLI가 cwd에서 위로 `nx.json`을 찾아 저장소 root를 정함. Nx(cwd apps/api)에서도 root에서도 같음. 상대 경로는 root 기준, `--root`로 바꿀 수 있음
- **종료 코드** — 0 정상 · 2 usage · 3 불완전(partial · 검증 실패 · preflight · 비교 불가) · 4 gate 실패. `go run`은 자식 코드를 보존하지 않을 수 있어 gate는 빌드한 바이너리로(테스트가 확인)
- **설정 파일 없는 variant** — `--variant anthropic:<model>` · `openai:<model>`은 production 지시 그대로인 manifest를 즉석에서 만듦(id는 모델 이름을 소문자 · 숫자 · `-`로). `<설정>@<공급자>:<model>[,<다시 물을 모델>]`은 그 위에 `experiments/<설정>.json`을 얹음. 다른 모양은 파일 이름. 모양 · id 규칙은 `evaluation.VariantRef`(`ref.go`)이고 CLI는 설정 이름을 경로로 풀기만 함. 참조는 `metadata.json`의 `variants[].ref`에 남고 `retry`는 그 참조로 같은 variant를 다시 만듦(파일 variant는 같은 id의 manifest 파일)
- **guard** — 모델을 부르는 variant가 있는 `run`은 `--allow-api`와 `--max-api-calls N`이 없으면 usage 오류(2)로 거절. 기준선만이면 호출이 없어 둘 다 필요 없음. plan · preflight(`placeholder: true` · 빈 key · 예산) · lineage 수집을 마친 뒤에야 adapter를 만듦. `--dry-run`은 plan만. localhost endpoint도 같은 opt-in
- **replay** — `predictions/*.jsonl`의 기록만 읽음. dataset의 정답에서 예측을 만들지 않음. 저장소의 `sample-*.jsonl`은 손으로 쓴 형식 예시
- **`api:eval-check`** — offline Go 테스트(`cmd/eval` · `internal/evalcli` · `internal/evaluation/...`) + sample 3개(`sample-classification` · `sample-text-extraction` · `sample-translation`) `validate`. `cache: false`, 모델 호출 없음. draft 존재는 구조 실패가 아니고 benchmark-ready는 따로 출력
- **`api:test` input** — CLI 테스트가 `tools/evals`의 sample dataset · variant · 실험 설정 · predictions를 읽으므로 `datasets/**` · `variants/**` · `experiments/**` · `predictions/**`를 input에 더하고 `results/**`는 뺌. 여러 case가 필요한 테스트는 `testdata/datasets/pilot-v1`을 읽음. `cmd/server`는 `internal/evaluation`을 import하지 않음(`go list -deps`로 확인)
- **key** — variant manifest의 `apiKeyEnv`가 가리키는 환경변수. flag로 받지 않고 어디에도 출력하지 않음(테스트가 sentinel로 확인)

### DevHub 전수 검사

`pnpm devhub:check`가 다음을 **빠짐없이** 대조하므로 harness를 넣을 때 카탈로그도 같이 고쳐야 함.

- **루트 `package.json` script** — `eval` · `eval:check`(그리고 `migrate` · `swagger` · `swagger:check`)를 더했고 `commands.ts`가 script 항목으로 등록함. 루트 script는 전수 catalog 대상이라 더하거나 지우면 함께 고침
- **`api` target** — `eval` · `eval-check`를 `commands.ts`에 등록함(`api-eval` · `api-eval-check`). DevHub에 실행 화면은 만들지 않음
- **시나리오 · 기록** — 개발자 track 시나리오 `evaluate-model-variants`(runtime `go-cli`)와 기록 `agent-evaluation-harness`가 단계별 소스 · 테스트를 인용함. 테스트 함수 이름을 바꾸면 `tests.ts`도 같이 바꿔야 함
- **`docs/` markdown** — 이 문서는 `documents.ts`에 `agent-evaluation`으로 등록됨. 문서 안 링크 · heading은 freshness 검사가 실재를 확인
- **`.gitignore` · `tools/evals`** — 카탈로그 대상 아님. `.gitignore`는 `/tools/evals/results/`만 무시

### 테스트 정책

- **외부 model API를 부르지 않음** — `internal/evaluation` 테스트는 가짜 `Classifier`(인터페이스 구현)로 runner · 채점 · 집계를 봄. `internal/evalcli`의 공급자 배선은 `http.Client.Transport`를 가짜로 바꿔 봄(`claude_test.go`의 `handlerTransport`와 같은 방식). `httptest.NewServer`로 포트를 열지 않음
- **dataset 테스트** — `t.TempDir()`에 manifest · JSONL · `image/png`로 만든 작은 사진을 써서 거절 사례를 보고, `testdata/datasets/software-fixture`와 `testdata/datasets/pilot-v1`을 실제로 읽음
- **helper** — 두 파일 이상이 쓰는 테스트 helper는 `internal/evaluation/support_test.go`에 모음. 한 파일만 쓰는 것은 그 파일에 둠
- **산출물 테스트** — 쓴 파일에 key · base64 · 이미지 byte가 없음을 확인
- **검증 범위** — `nx affected -t vet,fmt,test --files=apps/api/...`와 `pnpm devhub:check`. Go 코드 변경에 web · mobile 검사를 붙이지 않음

## 구현 순서

한 단계마다 테스트를 먼저 또는 함께 넣고 `vet` · `fmt` · `test`를 통과한 뒤 다음으로.

1. `processing.DescribeContract` + 테스트(허용 값 일치 · hash 안정) — **완료**
2. `internal/evaluation` wire 계약(case · result · run · summary 타입, `Measure`, 엄격한 JSON 해석) + 테스트 — **완료**. dataset 파일 읽기는 3단계
3. dataset loader — 디렉터리 읽기 · 검증 · 누출 검사 · readiness · selection hash + 테스트, `software-fixture` testdata, `pilot-v1` — **완료**. pilot-v1은 `tools/evals`에서 테스트 fixture(`testdata/datasets/pilot-v1`)로 옮겼고, `tools/evals/datasets`에는 과제마다 형식 예시 1건만 둠 — 평가 dataset은 사용자가 채움
4. production adapter — 생성자 호출 · observer Transport · 관측 · 실패 분류 · 호출 예산 + 가짜 Transport 테스트 — **완료**
5. variant manifest · adapter registry · lineage 수집 + 테스트 — **완료**
6. runner — plan(선택 · preflight) · 예산 · timeout · 취소 · replay · 결과 stream + 테스트 — **완료**. `Observation` → `CaseResult` 변환은 9단계
7. 분류 evaluator — accuracy · per-label · macro F1 · canonical/accepted action · joint · risk · raw tally · pass policy v1 + 손계산 테스트 — **완료**
8. Reliability · Latency · Cost 집계 → `RunSummary` + 손계산 테스트 — **완료**
9. 산출물 writer(`metadata.json` · `cases.jsonl` · `summary.json` · `summary.md`) · raw에서 재생성 · golden + 실패 · 충돌 · 부재 테스트 — **완료**
10. compare — 비교 가능성 검사 · 짝 · 축별 delta · case 목록 · gate · 저장 + 테스트와 golden — **완료**
11. `cmd/eval` — list · validate · plan · run · replay · report · retry · compare · retrieve, 종료 코드 계약, git lineage, secret 미출력 + 가짜 transport · 빌드 바이너리 테스트 — **완료**
12. `api` `eval` · `eval-check` target · `commands.ts` 등록 · `test` input — **완료**. validation · held-out의 사람 검토 사진은 사용자 작업(`drafts/candidates.md`)
13. 첫 실행 — 로컬 Ollama로 무비용 확인 후, 사용자 승인 아래 실제 provider 실행. 결과를 `docs/records/`에 남기고 이 문서의 "측정하지 않았음"을 갱신

## 첫 PR 범위와 남은 위험

**첫 PR** — foundation(`DescribeContract` · wire 계약 · loader · adapter · observer) + 분류 · action 추천 evaluator + pilot-v1 + runner · 산출물 · 비교 + CLI와 Nx target + text-extraction · translation의 계약 · offline evaluator(replay만) + 문서 · DevHub catalog 등록.

**후속으로 분리** — production OCR · 번역 adapter, fine-tuning, 내용 기반 검색, CI paid eval, 실제 행동 실행 E2E, judge(Phase 2), Unicode NFC(text v2), 비용 환산 가격표.

**남은 위험**

- validation · held-out에 사람 검토 사진이 없어 benchmark 판단을 할 수 없음. dev 21건은 harness 동작 확인과 기준선 · 실험 설정 비교용
- 비슷한 사례 검색은 사진 배치 기준이라 글자 사진에서 약함(위 표). 모델에 붙는 예시가 틀린 category일 때가 많으므로 예시 variant의 결과는 기준선 · 예시 없는 variant와 나란히 봐야 함
- 실제 provider를 한 번도 부르지 않아 live 경로(SDK 재시도 · 429 · 응답 형식)는 가짜 응답으로만 검증됨. 첫 live 실행은 로컬 Ollama로 `--limit 1`부터
- `pnpm eval <args>`의 인자 전달은 현재 pnpm 10.30 · Nx 23.1.1에서 확인한 것. 둘 중 하나를 올리면 `pnpm eval list`로 다시 확인
- golden 4파일과 comparison golden은 production 지시 hash를 담고 있어 prompt를 바꾸면 `EVAL_UPDATE_GOLDEN=1`로 다시 만들어야 함

## 이후 과제

MVP 밖. 순서는 정하지 않음.

- **OCR · 번역 adapter** — text-extraction · translation 모두 계약 · offline evaluator · replay까지 있고 **production adapter는 unsupported**. 호출할 코드가 없으므로 harness가 흉내 내지 않고, 코드가 생기면 그때 `Classifier`처럼 인터페이스로 붙임
- **번역 의미 평가** — BLEU · chrF · semantic similarity · judge는 없음. Phase 2 judge 계약은 위 절에 문서로만 있음
- **Unicode NFC(text v2)** — `golang.org/x/text`가 지금 indirect. 직접 import는 dependency 승인 대상이라 v2로 미룸
- **비용 환산** — usage token은 관측되지만 모델별 가격표가 없음. 가격표를 두면 `cost.amount`를 채움
- **내용 기반 검색** — 지금 검색은 사진 배치 기준. 글자를 먼저 읽어 검색하거나 embedding을 쓰려면 추가 호출 · 의존성이 필요하고 승인 대상
- **비용 비교** — 계단식의 이득은 비용으로 봐야 하는데 가격표가 없어 token 합과 재질문 비율까지만 냄
- **DevHub 표시** — 읽는 층은 있음: `apps/devhub/src/lib/evaluations/repository.ts`가 `tools/evals/results`의 run · comparison을 요청마다(`connection()`) 파일에서 바로 읽고 v1 decoder로 검증함. 채점은 Go 값을 그대로 쓰고 다시 판정하지 않음. API · DB 없음. 화면은 `/evals`(개요) · `/evals/runs/[runId]` · `/evals/compare/[comparisonId]`. 실행은 여전히 Go
