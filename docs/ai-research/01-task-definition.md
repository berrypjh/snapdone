# 01. AI 평가 과제 정의

Snapdone의 AI 처리 기능을 평가 과제(Task)로 나눠 정의하는 1단계 문서.
데이터셋 구축 · Python Notebook 실험 · Go Evaluation 확장 · 모델 선정 · 배포 판단이 이 문서의 기준을 따른다.

- **상태** — 초안. 개발자 검토 전
- **근거 범위** — 2026-10-18 기준 저장소 코드 · 문서 · 실측 산출물
- **표기** — **[확정]** 코드 · 문서로 확인된 사실 또는 승인된 설계 · **[권장]** 근거가 있는 제안 · **[미결정]** 개발자 결정 전 · **[가설]** 실험으로 확인할 주장
- **이 문서가 하지 않는 것** — 프롬프트 · 모델 · 서빙 방식 확정, 데이터셋 수집, 점수 · 배포 임계값 설정

## 관련 문서와 이 문서의 위치

| 문서                                                             | 다루는 것                                       | 이 문서와의 관계                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| [agent-evaluation.md](../architecture/agent-evaluation.md)       | 평가 harness 구현 · 계약 · 산출물 · 비교 · gate | 기술 설계. 이 문서는 **무엇을 평가하는지**를 정한다. 중복 설명은 링크로 대신한다 |
| [target-architecture.md](../architecture/target-architecture.md) | 전체 구조 · 구현 현황                           | 제품 구현 상태의 상위 기준. 이 문서의 2절 · 18절과 맞춰야 한다                   |
| [quality-gates.md](../engineering/quality-gates.md)              | 검증 명령 · 유료 호출 규칙                      | 평가 실행 규칙의 기준                                                            |
| [deployment.md](../development/deployment.md)                    | GCP Cloud Run 배포                              | 배포 대상 기준                                                                   |

**새 파일이 필요한 근거**: `docs/` 아래에 평가 과제 · 성공 기준을 정의한 문서가 없다 (확인). `agent-evaluation.md`는 harness 설계이고 제품 기능별 정의는 없다. 같은 내용을 그 문서에 넣으면 harness 설계 문서가 제품 정책과 섞인다. 그래서 `docs/ai-research/` 아래에 연구 기준 문서를 둔다.

---

## 1. 목적과 현재 제품 범위

### 1.1 목적

- Snapdone의 AI 처리가 **사용자 목표를 끝내는지** 객관적으로 판단할 평가 기준을 정한다.
- 모델 · 프롬프트 · 호출 구조를 바꿀 때 같은 기준으로 비교할 수 있게 한다.
- 성공 기준은 모델 점수가 아니라 **화면에 남는 최종 결과**다 (`AGENTS.md`: "분석 과정 · 신뢰도 점수 · 모델 이름은 결과가 아니다").

### 1.2 현재 제품 지원 유형

| 유형        | 의미                                           | 처리 방식                                                                        | 기본값                  |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| **Text**    | 읽을 글자가 주된 내용 (언어 무관, 한국어 포함) | `extract_and_translate` · `extract_text` · `summarize` · `extract_and_summarize` | `extract_and_translate` |
| **Receipt** | 완료된 결제 기록 (금액이 있고 결제가 끝남)     | `record_expense` · `extract_text` · `summarize`                                  | `record_expense`        |

- 유형 판단 결과는 네 가지다: `text` · `receipt` · `unsupported`(둘 다 아님) · `ambiguous`(둘 중 하나인데 고를 수 없음). 확인: `apps/api/internal/processing/typing.go`.
- `unsupported`와 `ambiguous`는 처리 방식을 실행하지 않는다. 결과만 남긴다. 확인: `decide()`.
- **[확정]** 지원 유형은 Text · Receipt 둘이다. 다른 유형의 처리는 현재 없다.

### 1.3 범위 밖 (현재 구현 없음)

- 캘린더 등록 · 장소 저장 · 지출 앱 연동 — 관련 코드 없음 (확인: `target-architecture.md`의 "없음" 목록).
- 여러 장 · 붙여넣기 · 공유 시트 업로드 (확인).
- 사용자 행동 학습 · 자동화 (확인).

---

## 2. 실제 구현된 AI 처리 흐름

처리 코드: `apps/api/internal/processing/`. HTTP: `apps/api/internal/httpserver/processing.go`. 확인된 사실만 적는다.

### 2.1 단계별 흐름

| 단계             | 실제 위치                                              | 동작                                                                                                  |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 업로드           | `createProcessingJob` → `readImage`                    | multipart `image`. 7,500,000 byte 이하. JPEG · PNG · GIF · WebP만 (`http.DetectContentType`으로 판별) |
| 처리 방식 조회   | `Processor.Start` → `preferences.Find`                 | **먼저** 조회한다. 실패하면 작업을 만들지 않는다 (기본값으로 대신하지 않음)                           |
| 작업 생성        | `jobs.Create(NewJob{Origin, ImageSHA256})`             | 사진 digest만 남긴다. 사진 자체는 저장하지 않는다                                                     |
| 백그라운드 처리  | `go p.run` → `process`                                 | 요청은 202로 바로 돌아간다                                                                            |
| 유형 판단 · 분류 | `process`: `TypeImage` ∥ `Classify`                    | 두 호출을 **동시에** 한다                                                                             |
| 라우팅           | `decide(typing, prefs)`                                | 유형 + 사용자 설정으로 처리 방식 결정. 모델 호출 없음                                                 |
| 처리 방식 실행   | `execute` → `Act`                                      | text · receipt일 때만 호출. 3번째 호출                                                                |
| 저장             | `finish` → `Completion.Validate` → `Complete` · `Fail` | 계약 밖 결과는 저장 전에 실패로 바꾼다                                                                |
| 조회             | `Find` · `Recent`                                      | 상태 · 결과 · 선택 · 결과 상세                                                                        |
| 재처리           | `Reprocess` → `reprocessSelection` → `execute`         | 같은 사진 digest 필요. **분류 · 유형 판단을 다시 하지 않는다**. `Act`만 실행                          |

### 2.2 모델 호출 (확인)

| 호출        | 함수        | 시점        | 조건                                  | 출력                                                            |
| ----------- | ----------- | ----------- | ------------------------------------- | --------------------------------------------------------------- |
| 유형 판단   | `TypeImage` | 항상        | —                                     | `Typing` (4값)                                                  |
| 분류        | `Classify`  | 항상        | —                                     | `Result` (`category`, `facts`, `suggestedAction`, `confidence`) |
| 처리 실행   | `Act`       | 조건부      | `typing`이 `text` 또는 `receipt`일 때 | `Output` (처리 방식별 필드)                                     |
| 재처리 실행 | `Act`       | 재처리 요청 | —                                     | `Output`                                                        |

- **호출 수** — 기본 2회(병렬) + 조건부 1회. 재처리는 1회.
- **하나의 모델이 세 역할을 맡는다.** `Model` 인터페이스가 `Classifier` · `Typer` · `Actor`를 합치고, 운영에서 같은 구현체(`ClaudeClassifier` · `OpenAIClassifier`)를 쓴다 (확인: `processor.go`, `cmd/server/main.go` 164–170 주석).
- **모델 설정** — `PROCESSING_PROVIDER` (`anthropic` · `openai`), `PROCESSING_MODEL`, `PROCESSING_BASE_URL`(openai만), `PROCESSING_API_KEY` (확인: `internal/config/processing.go`).
- **공급자별 호출** — Claude는 Beta Messages API(`client.Beta.Messages.New`)에 `OutputConfig` 구조화 출력 schema, `max_tokens 16000`. OpenAI 호환 API는 Chat Completions에 `json_schema` strict (확인: `claude.go`, `openai.go`).
- **서버 측 fallback** — `claude-opus-5` · `claude-fable-5-1`에서는 거절 시 다른 모델로 이어 처리하는 beta 기능을 켠다 (확인: `claude.go` `refusalFallbackModels`). 실제 답한 모델이 설정 모델과 다를 수 있다. **[미결정]** D-08.

### 2.3 상한 · 제약 (확인)

| 항목                     | 값                                                                                                                                                                            | 위치                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 처리 전체 상한           | 2분 (`processTimeout`)                                                                                                                                                        | `processor.go`                             |
| 상태 저장 상한           | 5초 (`saveTimeout`)                                                                                                                                                           | `processor.go`                             |
| 실행 중 작업의 실패 판정 | 2분 30초 (`staleAfter`)                                                                                                                                                       | `processor.go`                             |
| 모델 요청 하나           | 90초 (`requestTimeout`)                                                                                                                                                       | `claude.go`                                |
| 응답 본문 상한           | 1 MiB                                                                                                                                                                         | `claude.go` `maxResponseBody`              |
| 최근 목록                | 20개                                                                                                                                                                          | `recentLimit`                              |
| 재시도                   | 처리 계층에는 없음. Claude 경로는 SDK 기본 재시도 2회에 기댐 (`claude.go`에 설정 없음, `anthropic-sdk-go` v1.74.0 `requestconfig` 기본값 2로 확인). OpenAI 호환은 재시도 없음 | `claude.go`, `openai.go`                   |
| panic 복구               | 처리 goroutine에 `recover` 없음                                                                                                                                               | `processor.go` (확인: 코드 검색 결과 없음) |

### 2.4 결과 저장 (확인)

- `store.go` `Complete`: `result`(JSON), `selection`(유형 · 처리 방식), `outcome`(종류 · 출력)을 저장한다.
- **`Typing`은 저장하지 않는다.** `unsupported`는 유형 판단에서 나온 것과 `Act`의 `readable: false`에서 나온 것이 같은 `OutcomeUnsupported`로 남는다.
- 사진 bytes는 저장하지 않는다. 재처리는 같은 사진을 다시 받아야 한다.
- 실행 중이던 작업은 서버 재시작 시 끝나지 못한다. 저장된 상태는 `running`으로 남고, `staleAfter`가 지나면 조회에서 `failed`로 보인다.

### 2.5 처리 방식별 출력 (확인, `action.go` · `outcome.go`)

| 유형    | 처리 방식               | 출력 필드                                                 | 지시 요약                                                 |
| ------- | ----------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| text    | `extract_text`          | `original`                                                | 읽히는 글자를 순서대로 그대로 옮김                        |
| text    | `extract_and_translate` | `original`, `translation{needed, text}`                   | 원문 추출 후 한국어 번역. 한국어만 있으면 `needed: false` |
| text    | `summarize`             | `summary`                                                 | 한국어 1~3문장, 사진 정보만                               |
| text    | `extract_and_summarize` | `original`, `summary`                                     | 원문 추출 후 한국어 요약                                  |
| receipt | `record_expense`        | `expense{merchant, date, total, currency, paymentMethod}` | 필드별 값 · 후보 · 확정 여부                              |
| receipt | `extract_text`          | `original`                                                | text의 `extract_text`와 같은 지시                         |
| receipt | `summarize`             | `summary`                                                 | 한국어 1~2문장, 인쇄된 사실만                             |

- 읽을 수 없으면 `readable: false` → `outcome: unsupported`, `selection` 없음.
- 영수증 필드 형식: `date` `YYYY-MM-DD`, `total` 소수점 문자열, `currency` ISO 4217, 연도가 인쇄되지 않으면 `date`는 `null` (확인: `receipt.go` 지시문).

### 2.6 결과 상태 (확인)

| 상태                        | 의미                                 | 사용자에게 보이는 것         |
| --------------------------- | ------------------------------------ | ---------------------------- |
| `running`                   | 처리 중                              | 진행 표시                    |
| `completed` + `processed`   | 처리 방식 실행 완료                  | 결과 화면                    |
| `completed` + `unsupported` | 처리 불가                            | 처리 불가 안내               |
| `completed` + `ambiguous`   | 유형 선택 필요                       | 후보 `text` · `receipt` 선택 |
| `failed`                    | 모델 실패 · 계약 밖 결과 · 실행 중단 | 실패 안내                    |

- 클라이언트 표시: `libs/processing/src/lib/result.ts` `presentJob`. `outcome`이 있으면 `outcome`을 우선 쓰고, 없는 옛 결과는 `result.facts`만 보인다 (확인).

---

## 3. 제품 기능과 Evaluation Task의 차이

| 구분      | 제품 기능                         | 평가 Task                               |
| --------- | --------------------------------- | --------------------------------------- |
| 단위      | 사진 한 장 → 사용자 목표 달성     | 모델 호출 한 번 또는 단계 하나          |
| 성공 기준 | 최종 결과로 사용자가 할 일을 끝냄 | 정답과의 일치 · 계약 준수               |
| 정답      | 사용자가 원하는 결과 (화면 기준)  | 사람이 라벨링한 정답 파일               |
| 관측      | 작업 상태와 결과                  | 요청 · 응답 · 관측 항목 (`Observation`) |
| 예        | "영수증 금액이 맞게 저장됐다"     | "`total` 필드가 정답과 같다"            |

**차이를 지키는 이유**: 단계 정확도가 모두 높아도 사용자 결과가 실패할 수 있다. 반대로 단계 하나가 틀려도 사용자 결과는 성공일 수 있다. 두 기준을 따로 본다.

**현재 평가 harness 상태 (확인, `agent-evaluation.md`)**: 평가 task는 세 개 (`image-classification` · `text-extraction` · `translation`). 분류 task만 live 호출이 있다. 나머지는 replay로만 채점한다.

---

## 4. Task Definition Matrix

| Task ID    | 이름                 | 제품 기능과의 관계                                                           | 평가 상태 (확인)                                   | 우선순위             |
| ---------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------- |
| `IMG-CLS`  | Image Classification | 라우팅에 쓰이지 않음. 최근 목록 라벨 · 온보딩 파싱                           | Live 구현 · Replay 구현                            | P1                   |
| `IMG-TYPE` | Image Typing         | **라우팅의 유일한 모델 입력**                                                | 미구현 (Production만)                              | **P0**               |
| `TXT-EXT`  | Text Extraction      | `extract_text` · `extract_and_translate` · `extract_and_summarize`의 첫 단계 | Replay만 (live 미연결)                             | **P0**               |
| `TXT-TRN`  | Translation          | `extract_and_translate`의 번역 부분 (기본 text 옵션)                         | Replay만                                           | P1                   |
| `TXT-SUM`  | Text Summarization   | `summarize` · `extract_and_summarize` (text · receipt)                       | 미구현                                             | P2                   |
| `RCP-EXT`  | Receipt Extraction   | `record_expense` (기본 receipt 옵션)                                         | 미구현                                             | **P0**               |
| `ROUTE`    | Routing              | `decide` · 재처리 규칙                                                       | Production 단위 테스트 있음. 평가 harness에는 없음 | **P0 (계약 테스트)** |
| `E2E`      | End-to-End           | 업로드 → 최종 결과                                                           | 단위 테스트만. live E2E 없음                       | P1                   |

**용어 규칙 (권장)**

- `Typing`(유형 판단)과 `Classification`(의미 카테고리)은 다른 개념이다.
- `Result.category`의 값 (`place` · `event` · `receipt` · `foreign_text` · `shopping` · `work` · `other`)은 제품 유형과 1:1이 아니다. `receipt`는 대체로 같지만 `foreign_text`는 `text`와 정의가 다르다 (확인: `result.go` 지시 vs `typing.go` 지시).
- 평가와 코드에서 "유형"이라고 쓰면 `Typing`만 가리킨다. "카테고리"는 `Result.category`만 가리킨다.

---

## 5. Image Classification 정의 (`IMG-CLS`)

### 5.1 목적

사진의 의미 카테고리 · 인쇄된 사실 · 추천 행동 · 확신 정도를 맞추는지 확인한다.

### 5.2 제품 관계

- **라우팅 입력이 아니다** (확인: `decide`는 `Typing`과 설정만 받는다).
- 실제 소비처 (확인): 최근 목록 라벨 (`libs/processing/src/lib/recent-jobs.ts` `kindLabel`, `foreign_text`와 `receipt`만 라벨이 붙는다), 온보딩 응답 파싱 (`libs/onboarding/src/lib/processing.ts` `parseResult`는 `category` · `suggestedAction` · `confidence`를 필수로 검사한다).
- 따라서 이 task의 제품 가치는 **목록 라벨 · 파싱 안정성**과 **다른 task의 기준선**이다. 이 점을 평가 보고서에 명시한다 (**[권장]**).

### 5.3 입력 · 기대 출력

- 입력: 사진 1장 (JPEG · PNG · GIF · WebP, 7.5 MB 이하).
- 기대 출력 (확인, `result.go`): `{ category, facts[{label, value}], suggestedAction, confidence }`.
  - `category`: 7개 enum.
  - `suggestedAction`: `save_place` · `add_to_calendar` · `record_expense` · `translate` · `none`.
  - `confidence`: `high` · `medium` · `low`. 숫자가 아니다.

### 5.4 정의

- **성공**: 정답 카테고리와 일치하고, 허용 행동 안에서 추천하며, 인쇄된 사실만 담음.
- **부분 성공**: 카테고리는 맞지만 사실 일부 누락, 또는 `confidence`가 `low`인데 정답이 맞음.
- **일반 실패**: 카테고리 불일치, 허용되지 않은 행동 추천.
- **Critical**: 금지 행동 추천 (`forbiddenActions`). `confidence: high`인데 틀림 (자동 실행 기준으로 쓰이므로).

### 5.5 주요 지표 (확인: 구현됨)

- `category-accuracy` · `macro-f1` · `canonical-action-em` · `accepted-action-accuracy` · `joint-em` · `pass-rate` · `critical-rate` · `critical-or-unobserved-rate`.
- 원시 응답 검사: `raw-syntax-invalid` · `raw-shape-invalid` · `parser`.

### 5.6 보조 지표 (확인: 구현됨 — 일부)

- `facts-recall` · `action-ready-rate` · `high-but-wrong-rate` · `auto-run-precision` · `auto-run-coverage` (compare 축).
- confidence 구간별 정확도 (진단값, 점수 아님).

### 5.7 평가 상태

- **Live 구현** (`processingadapter` → production 생성자). **Replay 구현**.
- 실측 산출물 (확인, `tools/evals/results/`): `ollama-qwen3-vl-8b-pilot` (pilot-v1 dev 21건, category accuracy 0.8571), `ollama-qwen3-vl-8b-snap` (snap-v1 dev 19건, 0.4211 — 실패 11건 포함, 원인은 context 잘림).
- **이 수치는 모델 품질 결론이 아니다.** 데이터가 합성이거나 전부 같은 유형이고, 한 실행 설정에서 나온 값이다.

### 5.8 자동 채점 · 사람 검토

- 자동: 카테고리 · 행동 · 사실 값 비교 (구현됨).
- 사람: 정답 라벨 작성, 사실의 인쇄 여부 확인.

### 5.9 모호한 정답 정책 (**[권장]**)

- `acceptableActions`의 첫 항목을 canonical로 두고 나머지는 accepted로 둔다 (확인: 기존 규칙).
- 의미상 두 카테고리가 가능하면 정답 목록을 두 개로 둔다. 정답이 둘이면 둘 다 맞은 것으로 센다 (**[권장]**, 기존 구현은 단일 `category`이므로 변경 필요 — D-15).

### 5.10 E2E와의 관계

- 직접 관계는 약하다. 목록 라벨과 온보딩 파싱에만 영향을 준다.
- 하나의 호출로 `Typing`을 함께 묻는 방식(C안, 17절)을 택하면 이 task의 결과가 라우팅에도 영향을 준다.

---

## 6. Image Typing 정의 (`IMG-TYPE`)

### 6.1 목적

사진이 `text` · `receipt` · `unsupported` · `ambiguous` 중 무엇인지 맞춘다. **라우팅 결과를 결정하는 유일한 모델 입력**이다.

### 6.2 제품 관계

- 입력: 사진 1장. 출력: `Typing` 값 1개 (확인: `typingSchema`, `parseTyping`).
- 틀리면 다음이 생긴다 (확인):
  - 영수증을 `text`로 판단 → 금액 구조를 잃은 번역 · 추출 결과.
  - 글자 사진을 `receipt`로 판단 → 지출 정보 실행.
  - 처리 가능한 사진을 `unsupported`로 판단 → 결과 없음.
  - 확정 가능한 사진을 `ambiguous`로 판단 → 선택 화면이 한 번 더 뜸.

### 6.3 정의

| 항목      | 정의                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 성공      | 정답 유형과 일치. `receipt`는 완료된 결제 기록일 때만, `ambiguous`는 두 유형 중 하나인데 결제 여부 등 근거가 부족할 때만 |
| 부분 성공 | 정답이 명확한데 `ambiguous`로 돌림 (안전한 보수 오답)                                                                    |
| 일반 실패 | `text` ↔ `receipt`가 아닌 오답 (예: `unsupported` ↔ `text`)                                                              |
| Critical  | `receipt` 정답을 `text`로 판단 · 읽을 수 없는 사진을 `text`로 판단해 글자 생성 · 결제 전 장바구니를 `receipt`로 판단     |

### 6.4 경계 정의 (**[확정]** 현재 프롬프트의 정의)

- `receipt`: 완료된 결제 기록. 금액과 결제 완료 표시가 있어야 한다.
- `text`: 언어와 무관하게 읽을 글자가 주된 내용. 결제 기록이 아님.
- `unsupported`: 판독 가능한 글자가 주된 내용이 아님 (사람 · 풍경 · 상품).
- `ambiguous`: 두 유형 중 하나인데 고를 수 없음. 예: 결제 완료 여부가 안 보이는 주문서 · 청구서.
- 확신 정도를 숫자로 받지 않는다 (확인, `typingInstructions`).

### 6.5 경계 사례 (개발자 검토용, 요약)

| 상황                           | 기대 Typing             | 상태              |
| ------------------------------ | ----------------------- | ----------------- |
| 카드 결제 영수증               | `receipt`               | 확정              |
| 결제 전 장바구니               | `text` 또는 `ambiguous` | **[미결정]** D-01 |
| 결제 완료 여부 불분명 주문서   | `ambiguous`             | 확정              |
| 외국어 안내문 · 메뉴판         | `text`                  | 확정              |
| 한국어 기사 · 문서             | `text`                  | 확정              |
| 글자 없는 사진 (풍경 · 상품)   | `unsupported`           | 확정              |
| 지나치게 흐린 사진 (판독 불가) | `unsupported`           | 확정              |
| 흐린 사진 (일부만 판독)        | 정책 필요               | **[미결정]** D-02 |

- 상세 표(상황 · 기대 Typing · 허용 행동 · 금지 행동 · 근거)는 `docs/ai-research/` 아래 후속 문서에서 다룬다. 이 문서에는 판정 기준만 둔다.

### 6.6 주요 지표 (**[권장]**, 미구현)

- 4×4 혼동 행렬.
- `text` ↔ `receipt` 확신 오답률 (치명 지표).
- 정답 `ambiguous` 사진의 `ambiguous` 판정 비율.
- `unsupported` 누락률 (정답 `unsupported`인데 처리한 비율).

### 6.7 자동 채점 · 사람 검토

- 자동: 라벨 비교, 혼동 행렬.
- 사람: 라벨 자체 (경계 사례 특히).

### 6.8 평가 상태

- **미구현.** 평가 task 없음. Production 코드와 단위 테스트(`typing_test.go`)만 있다 (확인).
- Typing 값은 저장되지 않으므로 평가를 위해 관측값으로 따로 남겨야 한다 (**[권장]**, 2.4절).

---

## 7. Text Extraction 정의 (`TXT-EXT`)

### 7.1 목적

글자 사진에서 원문을 빠짐없이 · 틀리지 않게 옮기는지 확인한다. 번역 · 요약의 기반이다.

### 7.2 제품 관계

- `extract_text`(text · receipt 공통 지시), `extract_and_translate`, `extract_and_summarize`의 첫 단계 (확인: `action.go`).
- 기본 text 옵션(`extract_and_translate`)의 결과 품질은 이 task에 의존한다.

### 7.3 입력 · 기대 출력

- 입력: text 유형으로 판정된 사진 (평가에서는 정답 유형이 text인 사진).
- 기대 출력: `{ original }` (읽을 수 없으면 `readable: false`).
- 확인된 지시: 원문을 읽는 순서대로, 줄바꿈 유지, 번역 · 교정 · 요약 금지, 사진에 없는 글자 금지.

### 7.4 정의

| 항목      | 정의                                                  |
| --------- | ----------------------------------------------------- |
| 성공      | 정규화 후 정답과 일치 (`text.go`의 정규화 규칙)       |
| 부분 성공 | 주요 문장은 맞고 일부 구간 누락 · 줄바꿈 차이         |
| 일반 실패 | 오탈자, 순서 뒤바뀜, 기호 누락, 줄바꿈 손실           |
| Critical  | 없는 숫자 · 이름 · 날짜 생성, 금액 자릿수 · 기호 오류 |

### 7.5 정답 규칙 (확인: `text.go`)

- `text: null` = 정답 없음 (거절 · 판단 보류). 점수에서 제외.
- `text: ""` = "글자 없음"이 정답.
- 판독 불가 구간은 **[권장]** `[unreadable]` 마커로 표시.

### 7.6 지표

- **구현됨**: `raw-exact-match`, `normalized-exact-match`, `cer`, `wer`, `char-edits`, `ref-chars`, `field-accuracy`, `important-field-recall` (필드 계약이 있을 때).
- **미구현 (권장)**: 숫자 · 날짜 토큰 정확도, 누락 토큰 recall, 환각 토큰 비율.

### 7.7 자동 채점 · 사람 검토

- 자동: 정규화 비교 · 편집 거리 · 숫자 토큰 (구현됨 일부).
- 사람: 읽기 순서가 애매한 레이아웃, 흐린 글자의 정답, 줄바꿈 기준.

### 7.8 모호 정책

- 읽기 순서 기준: 위에서 아래, 왼쪽에서 오른쪽 (**[권장]**). 다단 레이아웃은 **[미결정]** D-13.
- 줄바꿈: 원본 그대로 (**[권장]**, D-13).

### 7.9 현재 평가 상태

- **Replay 구현만.** live adapter는 `unsupported`, 호출 0회 (확인: `variant.go` `adapterTasks`는 `image-classification`만 허용).
- 데이터: `apps/api/internal/evaluation/testdata/datasets/ocr-fixture`(3장). 평가 목적의 정식 데이터셋은 없다.

### 7.10 E2E와의 관계

- 이 단계의 실패는 번역 · 요약 실패로 이어진다. 분리 평가(정답 원문 입력)와 E2E 평가를 함께 둔다.

---

## 8. Translation 정의 (`TXT-TRN`)

### 8.1 목적

외국어 글자를 자연스러운 한국어로 옮기되, 숫자 · 날짜 · 고유명사 · 금액을 보존하는지 확인한다.

### 8.2 제품 관계

- 기본 text 옵션 `extract_and_translate`의 번역 단계 (확인: `translateSpec`).
- 제품은 **이미지에서 원문과 번역을 한 호출로** 만든다. 평가는 두 입력 형태를 쓴다 (**[권장]**): (a) 이미지 입력 — 제품과 같은 조건, (b) 정답 원문 입력 — 번역만 분리.

### 8.3 입력 · 기대 출력

- 입력: (a) 사진, (b) 정답 원문 텍스트.
- 기대 출력: `{ original, translationNeeded, translation }` (확인: `translateSpec`).
  - 외국어가 있으면 `translationNeeded: true`, `translation`에 한국어.
  - 전부 한국어면 `translationNeeded: false`, `translation: null`.

### 8.4 정의

| 항목      | 정의                                                                        |
| --------- | --------------------------------------------------------------------------- |
| 성공      | 의미 보존, `translationNeeded` 정확, 치명 span 보존, 자연스러운 한국어      |
| 부분 성공 | 의미는 맞지만 표현이 어색하거나 설명 일부 누락                              |
| 일반 실패 | 의역으로 의미 변경, `translationNeeded` 오판, 번역 누락                     |
| Critical  | 금액 · 날짜 · 수량 · 고유명사 변경 (`criticalSpans`), 원문에 없는 내용 추가 |

### 8.5 정답 규칙 (확인: `translation.go`)

- `references[]` (1개 이상). 여러 참고 번역을 허용한다.
- `criticalSpans[]{id, kind, accepted[]}`.
- 정책: `translation-reference-v1`은 `unscored` 기본. `translation-exact-v1`은 정규화 EM과 span 보존을 함께 본다.

### 8.6 혼합 언어 정책

- 현재 프롬프트 기준: 전부 한국어가 아니면 `translationNeeded: true`.
- 혼합 언어 사진에서 번역을 보여 줄지 **[미결정]** D-06.

### 8.7 지표

- **구현됨**: `critical-span-recall`, `language-metadata-rate`, `normalized-exact-match-rate` (`translation-exact-v1`에서만 채점).
- **미구현 (권장)**: `translationNeeded` 정확도, 의미 품질 (사람 점수 또는 judge). BLEU · chrF · 의미 유사도는 문서상 `unsupported`.

### 8.8 자동 채점 · 사람 검토

- 자동: span 보존, `translationNeeded`, 정규화 EM (참고).
- 사람: 의미 보존, 자연스러움, 혼합 언어 판단.

### 8.9 모호 정책

- 참고 번역을 여러 개 허용 (**[권장]**, 2개 이상).
- EM은 참고 지표로만 쓴다 (기존 `unscored` 기본 정책과 일치).

### 8.10 현재 평가 상태

- **Replay 구현만.** live adapter 없음 (확인).
- 의미 품질 평가 없음 (확인: 문서 "이후 과제").

---

## 9. Text Summarization 정의 (`TXT-SUM`)

### 9.1 목적

글자 사진을 한국어로 짧게 요약하되, 사진에 있는 사실만 담고 핵심을 빠뜨리지 않는지 확인한다.

### 9.2 제품 관계

- text의 `summarize`, `extract_and_summarize` (확인: `summarizeSpec`).
- receipt의 `summarize` (확인: `receiptSummarizeSpec`, 1~2문장).
- **기본 옵션이 아니다.** 사용 비율은 제품 데이터가 생긴 뒤 본다.

### 9.3 입력 · 기대 출력

- 입력: 사진 1장 또는 정답 원문 텍스트 (분리 평가).
- 기대 출력: `{ summary }`. text는 1~~3문장, receipt는 1~~2문장 (확인).

### 9.4 정의

| 항목      | 정의                                                           |
| --------- | -------------------------------------------------------------- |
| 성공      | 주된 사실 포함, 문장 수 규칙 준수, 한국어, 사진에 있는 정보만  |
| 부분 성공 | 문장 수 · 언어는 맞지만 세부 사실 일부 누락                    |
| 일반 실패 | 핵심 누락, 문장 수 위반, 외국어로 답함                         |
| Critical  | 사진에 없는 금액 · 날짜 · 상호 생성, 영수증 요약에서 금액 오류 |

### 9.5 정답 규칙 (**[권장]**, 미구현)

- 사진마다 `must`(반드시 포함), `may`(허용), `must-not`(금지) 사실 목록을 둔다.
- 주된 사실의 기준은 **[미결정]** D-09.

### 9.6 지표

- **미구현 (규칙 기반, 권장)**: 문장 수 준수율, 한국어 비율.
- **미구현 (사람 또는 judge)**: `must` 포함률, `must-not` 위반 비율.

### 9.7 자동 채점 · 사람 검토

- 자동: 문장 수, 언어, 금액 · 날짜 토큰 대조.
- 사람: 사실 포함 여부, 근거 확인. judge 평가는 Phase 2 (확인: 문서 "judge 계약(문서만)").

### 9.8 모호 정책

- 요약 기준: 주요 사실 전부를 목표로 한다 (**[권장]**, D-09).

### 9.9 현재 평가 상태

- **미구현.** 평가 task 없음 (확인).

---

## 10. Receipt Extraction 정의 (`RCP-EXT`)

### 10.1 목적

영수증에서 지출 정보를 정확히 뽑고, 확신 없는 값을 사용자에게 확인 대상으로 넘기는지 확인한다.

### 10.2 제품 관계

- `record_expense`는 **영수증 기본 옵션** (확인: `preference.Defaults()`).
- 결과 `expense`의 각 필드는 `{value, candidates, resolved}`다 (확인: `outcome.go` `ReceiptField`).
- 사용자가 확인이 필요한 필드를 하나씩 확정한다 (확인: `PATCH /v1/processing-jobs/{jobId}/receipt-fields/{field}`, `resolveField`).

### 10.3 입력 · 기대 출력

- 입력: receipt 유형 사진.
- 기대 출력: `expense{ merchant, date, total, currency, paymentMethod }`, 각 필드 `{ value, candidates, resolved }` (확인: `expenseSpec`).

### 10.4 필드 정의 (확인: `expenseSpec` 지시)

| 필드            | 정의               | 형식                                                | 없을 때                 |
| --------------- | ------------------ | --------------------------------------------------- | ----------------------- |
| `merchant`      | 인쇄된 상호        | 인쇄된 그대로                                       | `null`                  |
| `date`          | 결제일             | `YYYY-MM-DD`. **연도 · 월 · 일이 모두 인쇄된 때만** | `null` (연도 추정 금지) |
| `total`         | **최종 결제 금액** | 소수점 문자열 (`12000`, `12.50`)                    | `null`                  |
| `currency`      | 통화               | ISO 4217. 원 · ₩ = `KRW`. `$` 단독은 불충분         | `null`                  |
| `paymentMethod` | 결제 수단          | 인쇄된 그대로 (카드명 · 현금)                       | `null`                  |

### 10.5 `value` · `candidates` · `resolved` 정책 (확인)

- 명확히 읽힘: `value`에 판독값, `candidates` 비움, `resolved: true`.
- 판독이 여러 개: `candidates`에 인쇄된 모든 판독, `value`는 가장 가능성 높은 것, `resolved: false`.
- 인쇄되지 않음 · 읽을 수 없음: `value: null`, `candidates` 비움, `resolved: false`.
- 서버 검증 (확인: `ReceiptField.valid`): `candidates`는 중복 없음, 모든 후보와 값은 필드 형식을 통과해야 한다. `value`가 있으면 `resolved: true`이거나 후보에 포함되어야 한다.

### 10.6 정의

| 항목      | 정의                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 성공      | 필드마다 인쇄된 값과 일치. 확신 있으면 `resolved: true`. 인쇄되지 않으면 `null`                                            |
| 부분 성공 | 흐린 값이 `resolved: false`이고 정답이 `candidates`에 있음                                                                 |
| 일반 실패 | 값이 틀렸지만 `resolved: false`. 인쇄된 값을 `null`로 둠                                                                   |
| Critical  | **`resolved: true`인데 값이 틀림**. 인쇄되지 않은 값을 채움. 연도 추정. `$`만으로 통화 확정. 할인 전 금액을 `total`로 확정 |

### 10.7 정답 규칙 (**[권장]**)

- `total`: 최종 결제 금액. 여러 금액이 인쇄되면 "최종 결제"의 기준을 정답 메모에 적는다 (D-03).
- `date`: 연도 미인쇄면 `null`이 정답 (D-04).
- `currency`: 기호가 여러 통화에 공유되면 `null`이 정답 (D-05).
- 현재 정답 상태 (확인): snap-v1 영수증 19건의 `expected`에는 `total` · `paid-at` · `store`가 있고, `currency` · `paymentMethod` · `candidates` 정답은 없다. 필드 정답 형식은 새로 정한다.

### 10.8 지표

- **미구현 (권장)**: 필드별 정확 일치율 (`total`은 문자열 정확 일치), `resolved-but-wrong` 건수 (**치명**), 후보 recall, `null` 정확도, `resolved` 비율 (과도한 확인 요구 측정).
- 재사용 후보: `text.go`의 `field-accuracy` 계약 (필드 `id` · `aliases` 정확 일치, 값은 `acceptedValues` 중 하나). `resolved` 축은 없다. **[권장]**: 이 계약을 확장할지 별도로 만들지 판단 (D-14).

### 10.9 자동 채점 · 사람 검토

- 자동: 값 · 형식 · 후보 포함 여부 · `resolved` 일관성.
- 사람: 인쇄 확인 (합계 · 날짜), 할인 · 세금 · 카드 결제 구분, 상호 표기 차이.

### 10.10 현재 평가 상태

- **미구현.** 평가 코드에 `Expense` · `ReceiptField` 참조 없음 (확인).

### 10.11 E2E와의 관계

- 금액 확정 흐름의 핵심. `resolved-but-wrong`은 E2E 치명 실패와 직접 연결된다.

---

## 11. Routing 정의 (`ROUTE`)

### 11.1 목적

`Typing` 결과와 사용자 설정으로 처리 방식이 규칙대로 정해지는지 확인한다.

### 11.2 구분: 결정적 규칙과 AI 추론

| 구분             | 담당                | 위치 (확인)           | 평가 방식                        |
| ---------------- | ------------------- | --------------------- | -------------------------------- |
| 유형 판단        | AI 추론 (모델 호출) | `TypeImage`           | 정답 라벨과 비교 (`IMG-TYPE`)    |
| 처리 방식 선택   | **Go 결정적 규칙**  | `decide`, `selectFor` | 계약 테스트                      |
| 재처리 허용 여부 | **Go 결정적 규칙**  | `reprocessSelection`  | 계약 테스트                      |
| 처리 실행        | AI 추론             | `Act`                 | 정답과 비교 (`TXT-*`, `RCP-EXT`) |

### 11.3 현재 규칙 (확인)

| 입력 `Typing` | 조건                   | 결과                                                          |
| ------------- | ---------------------- | ------------------------------------------------------------- |
| `text`        | 사용자 `prefs.Text`    | `Selection{text, prefs.Text}` → `Act`                         |
| `receipt`     | 사용자 `prefs.Receipt` | `Selection{receipt, prefs.Receipt}` → `Act`                   |
| `ambiguous`   | —                      | `Outcome{ambiguous, candidates: [text, receipt]}`, `Act` 없음 |
| `unsupported` | —                      | `Outcome{unsupported}`, `Act` 없음                            |

**사용자 설정 조회**

- 설정은 작업 생성 시점에 읽는다 (`Start`). 처리 도중 변경은 이 작업에 적용되지 않는다 (확인).
- 설정 조회 실패는 기본값으로 대신하지 않고 작업을 만들지 않는다 (확인).
- 설정 조회 · 저장 경로: `GET /v1/processing-preferences`, `PUT /v1/processing-preferences/{imageType}` (`httpserver/preference.go`, 확인). 저장은 `SetText` · `SetReceipt`로 한 유형씩 바꾸고, 값이 계약 밖이면 거절 (`ErrInvalid`).

**재처리 규칙 (확인: `reprocessSelection`)**

- 원본 작업이 `ambiguous`: 후보 중 하나를 골라야 한다. 처리 방식을 비우면 **재처리 시점의** 설정을 쓴다.
- 원본 작업이 처리됨(`processed`): 같은 유형의 다른 처리 방식만 허용. 다른 유형은 `ErrInvalidReprocess`.
- 원본이 `unsupported` · 실패 · 사진 digest 없음: 재처리 불가 (`ErrNotReprocessable`).
- 원본이 실행 중: 재처리 불가 (`ErrSourceRunning`).

### 11.4 Routing이 AI 평가여야 하는가

**[권장]: 아니다.** 이유는 다음과 같다.

- 입력이 `Typing` 값과 설정 뿐이라 출력이 결정적이다. 모델로 채점할 대상이 없다.
- 모델은 `Typing` 단계에서 이미 측정된다 (`IMG-TYPE`).
- 따라서 Routing은 **계약 테스트**로 상시 검증한다.

**예외 (정책 판단)**: "ambiguous 정책이 사용자에게 맞는가"는 규칙 검증이 아니라 제품 정책이다. E2E와 개발자 결정으로 본다 (D-02).

### 11.5 주요 지표

- 규칙 테스트 통과율. 목표는 100%다 (결정적 규칙이므로 임계값 논의 대상이 아님).

### 11.6 기존 테스트 (확인)

- `typing_test.go`: `TestDecideMapsEveryStoredAction`, `TestDecideWithoutAType`, `TestParseTyping`.
- `reprocess_test.go`: 재처리 규칙 테스트 7개.
- 누락 확인 필요: 재처리 유형 변경 거절 · ambiguous 후보 외 값 거절의 모든 경로 (**[권장]** 검토).

### 11.7 E2E와의 관계

- 라우팅 규칙이 맞아도 `Typing`이 틀리면 E2E는 실패한다. E2E 실패 원인을 나눌 때 라우팅 규칙과 `Typing`을 분리해서 본다.

---

## 12. End-to-End 정의 (`E2E`)

### 12.1 목적

사용자가 사진을 올린 뒤 **하려던 일을 끝낼 수 있는지** 확인한다. 제품 성공 기준이다 (`AGENTS.md`).

### 12.2 성공 기준 (사용자 결과 기준)

| 흐름               | 시작                   | 성공                                          | 실패                                           |
| ------------------ | ---------------------- | --------------------------------------------- | ---------------------------------------------- |
| 텍스트 · 기본 설정 | 외국어 메뉴판 · 안내문 | 원문과 한국어 번역이 보이고 복사 가능         | 원문 오류, 번역 누락, `translationNeeded` 오판 |
| 텍스트 · 요약 설정 | 기사 캡처              | 1~3문장 한국어 요약                           | 사진 밖 정보, 핵심 누락                        |
| 영수증 · 기본 설정 | 카드 영수증            | 금액 · 날짜 · 상호가 맞거나 확정 요청이 보임  | `resolved: true`인데 틀림                      |
| 모호               | 주문서 · 청구서        | 사용자가 유형을 고르면 재처리되어 결과가 나옴 | 자동 실행, 선택지 없음                         |
| 미지원             | 풍경 · 상품 사진       | 처리 불가 이유가 안내됨                       | 지어낸 결과                                    |
| 실패               | 판독 불가 · 모델 오류  | 실패 안내와 재시도 경로                       | 빈 화면 · 원인 없음                            |

### 12.3 E2E 정의 원칙

- `unsupported` · `ambiguous`는 **실패가 아니라 정상 종료**다. 안내가 있어야 성공이다.
- 단계별 정확도를 평균내서 E2E 점수로 쓰지 않는다. 사용자 목표 달성 여부를 따로 판정한다.
- E2E 판정은 최종 화면을 기준으로 한다. 내부 `result` JSON은 증거일 뿐 성공의 정의가 아니다.

### 12.4 단계별 관측 (**[권장]**)

- 업로드 검사 → 설정 조회 → 유형 판단 → 라우팅 → 처리 실행 → 저장 → 화면 표시.
- 각 단계의 실패 원인을 분류한다 (14.4절 실패 분류).

### 12.5 지표

- **작업 목표 달성률**: 흐름별 성공 건수 ÷ 흐름 건수 (**[권장]**, 미구현).
- **치명 건수**: 확정되지 않은 금액이 확정처럼 보인 건, 미지원을 처리한 건, 계약 위반이 저장된 건.
- **재처리 후 성공 비율**: `ambiguous` 사진에서 사용자 선택 후 목표 달성 비율 (**[권장]**, 미구현).

### 12.6 자동 채점 · 사람 검토

- 자동: 상태 · 계약 · 필드 값 (부분 가능).
- 사람: 최종 화면에서 실제로 쓸 수 있는지. 확인 요구가 적절한지.

### 12.7 현재 평가 상태

- 단위 테스트 있음 (확인: `processor_test.go`, `reprocess_test.go` 등).
- live E2E 평가 없음 (확인).
- 화면 검수는 `frontend-quality` 절차 대상.

---

## 13. 기능별 입력 · 출력 계약

| 기능                | 입력                                                | 출력 계약 (현재)                                          | 위치 (확인)                |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| 업로드              | multipart `image` (JPEG · PNG · GIF · WebP, 7.5 MB) | `202 ProcessingJobResponse`                               | `httpserver/processing.go` |
| 유형 판단           | 사진                                                | `{imageType: text·receipt·unsupported·ambiguous}`         | `typing.go` `typingSchema` |
| 분류                | 사진                                                | `{category, facts, suggestedAction, confidence}`          | `result.go` `resultSchema` |
| 처리 실행 (text)    | 사진 + 옵션                                         | `Output` (`original`, `translation`, `summary` 중 옵션별) | `action.go` `specFor`      |
| 처리 실행 (receipt) | 사진 + 옵션                                         | `Output` (`expense`, `original`, `summary` 중 옵션별)     | `action.go`, `receipt.go`  |
| 필드 확정           | jobId · field · value                               | `200 ProcessingJobResponse` · 오류 코드                   | `httpserver/processing.go` |
| 재처리              | sourceJobId · 같은 사진 · imageType · action        | `202` · 오류 코드                                         | `processor.go` `Reprocess` |
| 설정 조회 · 변경    | `GET`: 없음. `PUT /{imageType}`: 옵션 값            | 전체 설정 (`ProcessingPreferencesResponse`)               | `httpserver/preference.go` |
| 작업 조회           | jobId                                               | 상태 · 결과 · 선택 · outcome                              | `store.go` `Find`          |
| 최근 목록           | —                                                   | 최대 20개                                                 | `store.go` `Recent`        |

**계약 원칙 (확정)**

- 모델 응답이 계약 밖이면 저장하지 않는다. `finish`가 `Validate`에서 막고 실패로 바꾼다.
- 계약 필드 이름은 앱과의 약속이다 (`result.go` 주석). 바꾸면 클라이언트 파싱이 깨진다.
- 평가 계약(`DescribeContract`)과 처리 계약은 같은 값을 읽는다 (확인: `contract.go`).

---

## 14. 성공 · 실패 · Critical Error 기준

### 14.1 결과 등급 (모든 Task 공통)

| 등급         | 정의                                              |
| ------------ | ------------------------------------------------- |
| 성공         | 정답과 일치하고 계약을 지킴                       |
| 부분 성공    | 핵심은 맞지만 일부 누락 또는 안전한 보수 오답     |
| 일반 실패    | 정답과 다르지만 사용자 피해가 작음                |
| **Critical** | 사용자가 잘못된 결과를 믿고 행동할 때 피해가 생김 |

### 14.2 Critical Error 정의 (**[권장]** 원칙, 세부 목록은 14.4절)

Critical은 다음 중 하나다.

1. 금액 · 날짜 · 수량의 잘못된 확정.
2. 사진에 없는 정보 생성.
3. 모호한 사진의 자동 실행.
4. 금지 행동 추천 · 실행.
5. 계약 밖 결과의 저장.

- Critical은 평균에 섞지 않는다. 건수로 따로 보고한다.
- Critical 목표 값(예: 0건)은 **[미결정]**. 데이터가 없어서 확정하지 않는다 (D-11).

### 14.3 Task별 기준 요약

| Task       | 성공                        | 부분 성공                             | 일반 실패                  | Critical                                           |
| ---------- | --------------------------- | ------------------------------------- | -------------------------- | -------------------------------------------------- |
| `IMG-TYPE` | 정답 유형                   | 정답이 명확한데 `ambiguous`           | 다른 유형 오답             | 영수증 → `text`, 읽을 수 없는 사진 → `text`        |
| `IMG-CLS`  | 카테고리 · 행동 일치        | 카테고리만 일치                       | 행동 불일치                | 금지 행동 추천, `high`인데 틀림                    |
| `TXT-EXT`  | 정규화 일치                 | 일부 누락                             | 오탈자 · 순서              | 없는 글자 생성                                     |
| `TXT-TRN`  | 의미 · `needed` · span 보존 | 의미 맞고 표현 어색                   | 의역 · 판정 오류           | 금액 · 날짜 변경, 원문에 없는 내용                 |
| `TXT-SUM`  | 주요 사실 포함 · 규칙 준수  | 세부 사실 일부 누락                   | 핵심 누락 · 문장 수 위반   | 사진에 없는 사실                                   |
| `RCP-EXT`  | 필드 일치 · 확정 정확       | 흐린 값 `resolved: false`에 정답 포함 | 틀렸지만 `resolved: false` | `resolved: true`인데 틀림, 연도 · 통화 · 금액 추정 |
| `ROUTE`    | 규칙과 일치                 | —                                     | —                          | ambiguous 자동 실행                                |
| `E2E`      | 사용자 목표 달성            | 결과 있음 + 확인 필요                 | 결과 없음 · 확인 누락      | 확정되지 않은 금액이 확정으로 보임                 |

### 14.4 Failure Taxonomy (요약)

| 분류        | 코드 예                                                                      | 대상 Task  |
| ----------- | ---------------------------------------------------------------------------- | ---------- |
| 유형 오판   | `TYPE-MIS`, `TYPE-AMB`, `TYPE-UNS`                                           | `IMG-TYPE` |
| 추출 오류   | `EXT-OMIT`, `EXT-ORDER`, `EXT-CHAR`, `EXT-HALL`                              | `TXT-EXT`  |
| 번역 오류   | `TRN-MEAN`, `TRN-SPAN`, `TRN-NEED`, `TRN-ADD`                                | `TXT-TRN`  |
| 요약 오류   | `SUM-MISS`, `SUM-LEN`, `SUM-FAB`                                             | `TXT-SUM`  |
| 영수증 오류 | `RCP-WRONG-RES`, `RCP-NOCAND`, `RCP-NULL`, `RCP-YEAR`, `RCP-CUR`, `RCP-DISC` | `RCP-EXT`  |
| 라우팅 오류 | `ROU-OVR`, `ROU-AMB`, `ROU-TYPE`                                             | `ROUTE`    |
| 계약 오류   | `CON-SCHEMA`, `CON-TRUNC`, `CON-REFUSE`                                      | 전 Task    |
| 신뢰성      | `REL-TIMEOUT`, `REL-FAIL`                                                    | 전 Task    |
| E2E         | `E2E-UNCONF`                                                                 | `E2E`      |

- 세부 정의 · 집계 방식은 평가 구현 시 정한다 (**[권장]**).
- 기존 구현의 실패 분류 (확인): `wire-calls`, `failed`, `timed-out`, `refusal`, `truncation`, `contract`, `provider`, `budget-denied`, `unsupported-task`, `unknown`.

### 14.5 경계 사례 (요약)

| 상황                            | 기대 Typing                         | 결정             |
| ------------------------------- | ----------------------------------- | ---------------- |
| 결제 전 장바구니                | `text` 또는 `ambiguous`             | D-01             |
| 흐린 사진 (일부 판독)           | 정책 필요                           | D-02             |
| 할인 전 · 후 금액               | `receipt`, `total`은 최종 결제 금액 | D-03             |
| 연도 없는 날짜                  | `receipt`, `date: null`             | D-04             |
| `$`만 있는 영수증               | `receipt`, `currency: null`         | D-05             |
| 한국어 · 외국어 혼합            | `text`, 번역 여부 정책              | D-06             |
| 영수증 두 장이 한 화면          | `ambiguous` 또는 정책               | D-07             |
| 결제 완료 문구가 있는 예약 화면 | `receipt` 또는 `text`               | D-02와 함께 정책 |

- 상세 판정 표(상황 · 기대 Typing · 허용 행동 · 금지 행동 · 근거)는 후속 문서에서 작성한다.

---

## 15. 평가 지표와 사람 검토 조건

### 15.1 지표 원칙

- 정확도 하나로 모델을 고르지 않는다.
- **품질 · 신뢰성 · 지연 · 비용**을 따로 본다 (`agent-evaluation.md` 네 축).
- Critical은 건수로 따로 보고한다.
- 정답이 없는 값은 점수에서 제외하고 "정답 없음"으로 센다 (분모 정책).
- 임계값은 데이터 이후에 정한다. 표기: `proposed threshold — calibration required`.

### 15.2 구현 상태별 지표 목록

| 축                        | 지표                                                                                                                                                        | 상태 (확인)                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 품질 (분류)               | `category-accuracy`, `macro-f1`, `canonical-action-em`, `accepted-action-accuracy`, `joint-em`, `pass-rate`, `critical-rate`, `critical-or-unobserved-rate` | 구현                                        |
| 품질 (분류 진단)          | `facts-recall`, `action-ready-rate`, `high-but-wrong-rate`, `auto-run-precision`, `auto-run-coverage`                                                       | 구현 (compare 축)                           |
| 품질 (원문)               | `raw-exact-match`, `normalized-exact-match`, `cer`, `wer`                                                                                                   | 구현                                        |
| 품질 (필드)               | `field-accuracy`, `important-field-recall`                                                                                                                  | 구현 (필드 계약 있을 때)                    |
| 품질 (번역)               | `critical-span-recall`, `language-metadata-rate`, `normalized-exact-match-rate`                                                                             | 구현                                        |
| 품질 (유형)               | 혼동 행렬, `text`↔`receipt` 확신 오답률, `ambiguous` 적절성, `unsupported` 누락률                                                                           | **미구현**                                  |
| 품질 (영수증)             | `resolved-but-wrong`, 후보 recall, `null` 정확도, `resolved` 비율                                                                                           | **미구현**                                  |
| 품질 (요약)               | 필수 사실 포함률, 문장 수 준수율, 사진 밖 사실 비율                                                                                                         | **미구현**                                  |
| 품질 (번역 추가)          | `needed` 정확도                                                                                                                                             | **미구현**                                  |
| 품질 (의미)               | 번역 · 요약 의미 품질 (사람 · judge)                                                                                                                        | **미구현**                                  |
| 품질 (E2E)                | 작업 목표 달성률, 치명 건수                                                                                                                                 | **미구현**                                  |
| 신뢰성                    | `completion-rate`, `failed`, `timed-out`, `wire-calls`, `raw-shape-invalid`, `raw-syntax-invalid`                                                           | 구현                                        |
| 지연                      | `completed-median-ms`, `completed-p95-ms`, `attempted-mean-ms`                                                                                              | 구현                                        |
| 비용                      | `input-tokens`, `output-tokens`, `estimated-cost` (가격표 없음 → `unavailable`)                                                                             | 구현 (토큰은 공급자별로 `unavailable` 가능) |
| 의미 유사도 · BLEU · chrF | —                                                                                                                                                           | **미지원** (문서상 `unsupported`)           |
| 확률 보정 (ECE · Brier)   | —                                                                                                                                                           | **없음** (문서상 제외)                      |

### 15.3 사람 검토 조건

- 정답 라벨은 사람이 작성하고 검토한다. 현재 snap-v1은 `method: agent-visual`이다 (확인). 이 상태로는 benchmark 자격이 없다.
- 경계 사례 (14.5절)는 두 명이 독립 라벨링하고 불일치를 검토한다 (**[권장]**).
- 라벨러 이름은 정답 파일에 넣지 않는다. 역할만 적는다 (**[권장]**).
- 사람 판정이 필요한 지표: 의미 품질, 사실 포함, 읽기 순서, 인쇄 확인. 판정 기준은 가이드라인을 따른다 (후속 문서).

### 15.4 Benchmark 자격 (확인 + 권장)

- 확인: `tools/evals`의 dataset 준비 상태 (`pnpm eval validate`)가 benchmark-ready 여부를 낸다.
- 확인: `tier: golden-benchmark`인 snap-v1은 validation · held-out 0건이고 `NOT eligible — drafts were allowed into the selection`으로 표시되었다.
- **[권장]**: benchmark 자격은 (a) 사람 검토된 정답 (b) validation · held-out 분리 (c) Typing · 영수증 정답 포함 세 가지를 모두 만족할 때만 준다.

---

## 16. P0 / P1 우선순위

| Task       | 우선순위             | 근거                                        | 실험 전 필요한 것                            |
| ---------- | -------------------- | ------------------------------------------- | -------------------------------------------- |
| `IMG-TYPE` | **P0**               | 라우팅 상류. 영수증 → 텍스트 오판은 치명    | 정답 라벨, 혼동 행렬, Typing 관측 기록       |
| `RCP-EXT`  | **P0**               | 기본 영수증 경로. `resolved-but-wrong` 치명 | 필드 정답 형식, 필드 지표 구현               |
| `TXT-EXT`  | **P0**               | 기본 text 경로의 기반                       | live adapter 연결, 정답 원문                 |
| `ROUTE`    | **P0 (계약 테스트)** | 결정적. 비용 0                              | 규칙 목록 확인                               |
| `TXT-TRN`  | P1                   | 기본 text 옵션. `TXT-EXT` 기반 위에 쌓임    | `translationNeeded` 지표, 정답 2개 참고 번역 |
| `IMG-CLS`  | P1                   | 이미 live 있음. 라우팅 무관                 | 기존 dev 결과 유지                           |
| `E2E`      | P1                   | 성공 기준이지만 단계 지표가 먼저            | P0 결과와 치명 체크리스트                    |
| `TXT-SUM`  | P2                   | 기본값 아님. 기준이 주관적                  | 필수 사실 목록                               |

**근거**: 상류 → 기본 경로 → 계약 테스트 → 제품 결과 순서다. `TXT-SUM`은 옵션 사용 비율을 본 뒤 올린다.

---

## 17. Classification / Typing 호출 구조 비교 가설

> **이 절은 가설이다.** 실험 전에는 어느 방식도 확정하지 않는다.

### 17.1 세 가지 방식

| 방식               | 구성                                                 | 현재 상태     |
| ------------------ | ---------------------------------------------------- | ------------- |
| **A. 현재**        | `TypeImage` ∥ `Classify` → (조건부) `Act`            | 구현됨 (확인) |
| **B. Typing 중심** | `TypeImage` → (조건부) `Act`. 분류 호출 없음         | 미구현 (가설) |
| **C. 통합**        | 한 요청에서 분류 + 유형을 함께 출력 → (조건부) `Act` | 미구현 (가설) |

### 17.2 비교 항목 (가설)

| 항목                      | A                                   | B                                                                | C                                                                                             |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 호출 수                   | 2 + 조건부 1                        | 1 + 조건부 1                                                     | 1 + 조건부 1                                                                                  |
| 지연 (추정)               | `max(유형, 분류)` + Act             | 가장 짧음                                                        | 한 호출 분량, 출력이 길어져 조금 늘 수 있음                                                   |
| 비용 (추정)               | 가장 큼                             | 작음                                                             | 작음 (입력 이미지 토큰 1회)                                                                   |
| 실패 격리                 | 둘 중 하나 실패 → 작업 실패 (확인)  | 유형만 실패 영향                                                 | 한 번 실패하면 둘 다 실패                                                                     |
| 평가 분리                 | 쉬움                                | 쉬움                                                             | 어려움 (한 출력에서 두 채점)                                                                  |
| 프롬프트 독립             | 분류 지시 변경이 라우팅에 영향 없음 | 라우팅 = 유형                                                    | 한 지시 변경이 둘 다 바꿈                                                                     |
| 목록 라벨 `kindLabel`     | 유지                                | 라벨 원천을 바꿔야 함                                            | 유지                                                                                          |
| 온보딩 파싱 `parseResult` | 유지                                | 필수 키가 없으면 `null` 반환 (확인). 화면에 미치는 영향은 미확인 | 유지                                                                                          |
| 재처리                    | 저장된 `result` 재사용              | `Typing` 저장 필요 (현재 없음)                                   | 저장된 결과 재사용                                                                            |
| API · 저장 계약           | 변경 없음                           | `result` 필드 축소 → 계약 변경                                   | `result`에 `imageType` 추가 (JSON 컬럼이라 마이그레이션은 불필요, 과거 결과 기본값 처리 필요) |

### 17.3 실험 설계 (가설 검증용, 이 문서에서 실행하지 않음)

- 같은 dev 사진 집합에서 A · B · C를 비교한다.
- 측정 순서: ① 유형 확신 오답률(치명) ② 목록 라벨 정확도 ③ 지연 · 호출 수 ④ 실패율 ⑤ 계약 변경 크기.
- 세 방식 모두 **같은 정답 데이터**를 쓴다. 정답이 확정된 뒤에만 실험한다.

### 17.4 확정하지 않는 이유 (확정)

- 현재 Typing 정답이 없다 (확인).
- 영수증 필드 정답이 불완전하다 (확인).
- 프롬프트 · 모델 · 서빙 방식이 확정되지 않았다.

---

## 18. 현재 구현과 목표의 Gap Analysis

| 영역               | 목표 (이 문서)                          | 현재 (확인)                                       | Gap                                      | 우선순위       |
| ------------------ | --------------------------------------- | ------------------------------------------------- | ---------------------------------------- | -------------- |
| 유형 판단 평가     | 혼동 행렬 · 치명 지표                   | 평가 task 없음                                    | 정답 · task · 지표 전부                  | P0             |
| 유형 관측          | 제품 Typing 값을 평가에서 볼 수 있음    | 저장 안 됨                                        | 관측 기록 추가                           | P0             |
| 영수증 필드 평가   | 필드 · `resolved` 지표                  | 평가 없음                                         | 정답 형식 · 평가 코드                    | P0             |
| 영수증 정답        | 필드별 정답                             | `total` · `date` · `store`만                      | `currency` · `paymentMethod` · 후보 정답 | P0             |
| 텍스트 원문 평가   | 정규화 비교 · 숫자 토큰                 | Replay만, live 없음                               | live adapter 연결, 정답 확대             | P0             |
| 번역 평가          | `needed` · span · 의미                  | Replay, span만                                    | `needed` 지표, 참고 번역 2개, 의미 평가  | P1             |
| 요약 평가          | 규칙 + 사람 기준                        | 없음                                              | 정답 목록 · 규칙 지표                    | P2             |
| 라우팅 테스트      | 규칙 100%                               | Production 단위 테스트 있음                       | 누락 경로 검토 (11.6절)                  | P0             |
| E2E                | 목표 달성률                             | 단위 테스트만                                     | 흐름 정의 · 체크리스트 · 사람 검수       | P1             |
| 정답 데이터        | 사람 검토 · split 분리 · benchmark 자격 | snap-v1은 agent-visual, validation · held-out 0건 | 검토 · 분리 · 태그 정정                  | P0             |
| 분류 gate          | 치명 · 통과율 · 계약                    | `GatePolicy` 3개 규칙 구현 · 정책 파일 없음       | 정책 파일 작성 (사람 결정)               | P1             |
| 영수증 · 유형 gate | `resolved-but-wrong`, 유형 확신 오답    | 미구현                                            | 지표 구현 후 추가                        | P1             |
| 문서               | 기능별 정의                             | `agent-evaluation.md` = harness 설계              | 이 문서로 제품 정의 분리                 | 완료 (이 문서) |
| 배포               | 모델 · 서빙 최종 확정                   | GCP Cloud Run 배포 중 (확인)                      | 모델 · 서빙 결정 — 미확정                | 미정           |
| 실측               | 실제 모델 품질                          | 합성 · 단일 설정 실측 2건                         | 정식 데이터 · 반복 · 비교                | 2단계          |

### 18.1 현재 구현 상태 문서의 불일치 (확인)

- `agent-evaluation.md`의 과제 표는 facts를 "기록만, 채점하지 않음"이라고 적는다. 그러나 `classification.go`의 `scoreFacts`가 facts recall을 계산한다. 이 문서에서는 "진단값으로 계산되며 pass 판정에는 쓰지 않음"으로 정리한다.
- `agent-evaluation.md`는 snap-v1을 언급하지 않는다. `tools/evals/datasets/snap-v1`은 실재한다.
- `tools/evals/README.md`는 "Python은 절대 채점하지 않고"라고 쓰고, `lab/analysis.py`가 연구용 비율을 계산한다. 열 이름에 `research_`를 붙여 구분하고 있다.

---

## 19. 개발자 결정 사항

> **이 절의 결정은 아직 승인받지 않았다.** 아래 항목은 설계 선택지와 권장안이다. 개발자가 승인한 값이 없으므로 본문에서 **[확정]**으로 다루지 않았다.

| 번호 | 결정                                                  | 선택지                                                     | 권장                                                            | 사용자 경험 변화                             |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| D-01 | 결제 전 장바구니 유형                                 | `text` / `ambiguous`                                       | `text`                                                          | 장바구니를 영수증으로 저장하는 실수가 줄어듦 |
| D-02 | 흐린 사진 · 일부 판독 · 결제 완료 문구 있는 예약 화면 | 판독 범위 처리 + 누락 표시 / `unsupported` / `ambiguous`   | 판독 범위 처리 + 누락 표시                                      | 결과가 나오지만 누락 표시를 봐야 함          |
| D-03 | 할인 전 · 후 금액                                     | 최종 결제 금액 확정 / 두 값 모두 후보                      | 최종 금액 확정, 둘 다 합계로 보이면 후보                        | 대부분 자동 확정, 드물게 확인 요구           |
| D-04 | 연도 없는 날짜                                        | `null` / 추정 후 확인 / 사용자 입력                        | `null`                                                          | 날짜가 비고 확인 필요                        |
| D-05 | 기호만 있는 통화                                      | `null` / 추정                                              | `null`                                                          | 추정 통화가 나오지 않음                      |
| D-06 | 혼합 언어 번역                                        | 전체 번역 / 외국어 부분만                                  | 전체 번역 (현재 계약 유지)                                      | 한국어 부분도 번역문에 들어감                |
| D-07 | 영수증 두 장이 한 화면                                | `ambiguous` / 주된 한 장                                   | `ambiguous`                                                     | 선택 화면이 한 번 더 뜸                      |
| D-08 | Claude 서버 측 fallback                               | 사용 / 평가에서 끔                                         | 평가 재현성을 위해 평가 run에서 끔 (제품은 현행 유지 여부 별도) | 제품 변화 없음 (평가에서만)                  |
| D-09 | 요약 기준 · 명함 · 상품 사진                          | 핵심 1문장 / 주요 사실 전부. 명함은 `text` / `unsupported` | 주요 사실 전부. 글자가 주되면 `text`                            | 요약이 길어짐. 명함은 결과가 나옴            |
| D-10 | 기본 text 옵션 `extract_and_translate`                | 유지 / `extract_text`                                      | 유지 (번역 평가 통과 전까지 변경 안 함)                         | 변경 시 번역이 사라짐                        |
| D-11 | Critical 목표 값 · 치명 gate                          | 0건 목표 / 보고만                                          | 보고 후 사람이 정함                                             | 변화 없음                                    |
| D-12 | 분류 추천 행동 enum (`save_place`, `add_to_calendar`) | 계약 유지 + 평가 분리 / 제거                               | 유지 + 분리                                                     | 변화 없음                                    |
| D-13 | 읽기 순서 · 줄바꿈 · 다단 레이아웃                    | 원본 그대로 / 의미 단위                                    | 원본 그대로                                                     | 변화 없음                                    |
| D-14 | 참고 번역 개수 · `field-accuracy` 확장 여부           | 1개 / 2개 이상. 기존 계약 확장 / 새 계약                   | 2개 이상. 확장 여부는 구현 전 검토                              | 변화 없음                                    |
| D-15 | 한 사진의 복수 정답 카테고리                          | 단일 정답 유지 / 정답 목록 허용                            | 정답 목록 허용 (구현 변경 필요)                                 | 변화 없음                                    |

**정책 충돌 참고**: D-02는 "제품이 어떤 사진을 처리하는가"의 정책이고, D-09 · D-10은 제품 기능 범위다. 이들은 제품 판단이므로 개발자가 정한다. D-08 · D-11 · D-13 · D-14는 평가 설계 항목이라 실험 전에 정하면 된다.

**Modal 배포 (확인되지 않은 계획)**

- 저장소에 Modal 관련 코드 · 설정 · 문서가 없다 (확인: `docs/`, `apps/api`, `tools/evals`에서 검색).
- 현재 배포는 GCP Cloud Run이다 (확인: `docs/development/deployment.md`).
- 이 문서는 Modal 배포를 **미확정 계획**으로 두고, 모델 · 서빙 방식 결정(19절 밖)과 함께 다룬다.

---

## 20. 1단계 완료 기준과 2단계 인계

### 20.1 1단계 완료 기준 (제안)

1단계는 다음이 모두 충족되면 끝난다.

1. 이 문서의 19절 결정 사항 (D-01 ~ D-14) 중 P0 관련 항목이 개발자 승인을 받았다.
2. Task 정의 (4절 · 5~12절)와 계약 (13절)이 승인되었다.
3. 정답 가이드라인 초안이 작성되었다 (후속 문서).
4. 실측 없이 확정할 수 있는 항목 (Routing 계약 테스트 목록, 지표 이름 · 정의)이 정리되었다.
5. 기존 아키텍처 문서와 모순이 없다 (18.1절의 불일치는 별도로 정리되었다).

### 20.2 2단계 인계 사항

| 인계 항목   | 내용                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| 정답 데이터 | Typing 라벨 · 영수증 필드 정답 · 텍스트 원문 정답 · 번역 참고 번역 2개 · 요약 필수 사실 목록. 사람 검토 기준 |
| 평가 구현   | `IMG-TYPE` task 추가, `RCP-EXT` 지표, Typing 관측 기록, 텍스트 live 연결                                     |
| 데이터 구조 | snap-v1 태그 정정, validation · held-out 분리, `sourceGroupId` 누수 검사                                     |
| 실험 설계   | A · B · C 비교 (17절). 세 방식의 정답 공통                                                                   |
| Gate        | 기존 3개 규칙 + G4 · G5 (영수증 · 유형) 후보. 정책 파일은 사람이 작성                                        |
| 실행 조건   | Ollama context 설정 확인, 모델 id 고정, 호출 예산 설정, Claude fallback 정책 (D-08)                          |
| 배포 · 서빙 | 모델 · 서빙 방식 미확정. Modal 계획은 근거 없음, GCP Cloud Run 현행 유지                                     |

### 20.3 2단계에서 하지 않을 것 (제안)

- 임계값 · 통과 기준 확정 (데이터 후).
- 프롬프트 최종 확정 (실험 후).
- 제품 기능 추가 (캘린더 · 장소 등).

---

## 부록: 용어

| 용어                  | 뜻                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------- |
| Typing (유형 판단)    | 사진이 `text` · `receipt` · `unsupported` · `ambiguous` 중 무엇인지 판단. 라우팅 입력 |
| Classification (분류) | 의미 카테고리 · 사실 · 추천 행동 · 확신. 라우팅 입력 아님                             |
| 처리 방식 (Action)    | 사용자가 유형별로 고르는 실행 옵션 (`extract_text` 등)                                |
| Selection             | 제품이 확정한 `유형 + 처리 방식`                                                      |
| Outcome               | 처리 결과 종류 (`processed` · `unsupported` · `ambiguous`)                            |
| Critical Error        | 사용자가 잘못된 결과를 믿고 행동할 때 피해가 생기는 실패                              |
| `resolved`            | 영수증 필드가 확인된 값인지 여부. `false`면 사용자 확정이 필요                        |
