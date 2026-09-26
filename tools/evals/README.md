# evals

사진 분류(`image-classification`) · 텍스트 추출(`text-extraction`) · 번역(`translation`)을 같은 dataset과 같은 채점기로 평가하고, 결과를 파일로 남겨 두 run을 비교하는 harness. 실행은 Go CLI(`pnpm eval`), 보기는 DevHub(`/evals`). 설계와 근거는 [agent-evaluation.md](../../docs/architecture/agent-evaluation.md).

## 5분 안에 — API key 없이

모델을 부르지 않는 replay만 쓴다. 결과는 `tools/evals/results/<runId>/`에 생긴다(git이 무시). `datasets/`에는 과제마다 **형식 예시 1건**(`sample-*`)만 있다 — 실제 평가 dataset은 직접 채운다([dataset 채우기](#dataset-채우기)).

```bash
pnpm eval list                                        # dataset · variant · 실험 설정 · predictions와 준비 상태
pnpm eval validate --dataset sample-classification    # 구조 검증 + benchmark-ready 여부

# 세 과제를 하나씩 — 예측은 손으로 쓴 기록이다
pnpm eval replay --dataset sample-classification --variant replay-example --predictions tools/evals/predictions/sample-classification.jsonl --run-id demo-classification
pnpm eval replay --dataset sample-text-extraction --variant text-extraction-replay --predictions tools/evals/predictions/sample-text-extraction.jsonl --run-id demo-text
pnpm eval replay --dataset sample-translation --variant translation-replay --predictions tools/evals/predictions/sample-translation.jsonl --run-id demo-translation --allow-drafts

# 모델 없는 기준선 — 실제 live 실행이지만 호출 0회, key도 --allow-api도 필요 없다
pnpm eval run --dataset sample-classification --variant baseline-always-other --run-id demo-baseline

# 두 run 비교 — candidate는 일부러 틀린 기록
pnpm eval replay --dataset sample-classification --variant replay-candidate --predictions tools/evals/predictions/sample-classification.jsonl --run-id demo-cand
pnpm eval compare --baseline demo-classification:replay-example --candidate demo-cand:replay-candidate

pnpm dev:devhub                                  # http://localhost:3100/evals
```

같은 `--run-id`는 다시 쓸 수 없다(덮어쓰지 않음). 다시 해 보려면 다른 id를 쓰거나 `tools/evals/results/<runId>`를 지운다.

## 과제별로 무엇이 되나

| task                   | live 실행                                                 | replay | 형식 예시                | 기본 채점 규칙(다른 규칙)                                                         | 대표 지표                       |
| ---------------------- | --------------------------------------------------------- | ------ | ------------------------ | --------------------------------------------------------------------------------- | ------------------------------- |
| `image-classification` | **됨** — production 분류기(Claude · OpenAI 호환 · Ollama) | 됨     | `sample-classification`  | `classification-pass-v1`                                                          | category 정확도                 |
| `text-extraction`      | **없음** — production OCR 코드가 없다                     | 됨     | `sample-text-extraction` | `text-pass-v1`                                                                    | corpus CER                      |
| `translation`          | **없음** — production 번역 코드가 없다                    | 됨     | `sample-translation`     | `translation-reference-v1`(case를 채점하지 않음) · `translation-exact-v1`(strict) | 보존 구간(critical span) 재현율 |

- 분류 — category · 추천 행동(acceptable · forbidden) · 위험(critical) · confidence 분포, 그리고 추출값(facts) 재현율 · 행동 완료 가능률 · 자동 실행 점검. 추출값은 pass에 넣지 않는다
- 텍스트 추출 — 공백 정규화(`text-ws-v1`) 뒤 rune CER · 단어 WER(`tokenizer: whitespace`인 case만) · field 정확도와 field id별 집계. Unicode 정규화는 하지 않는다(NFC · NFD는 다른 문자열)
- 번역 — 승인된 reference와의 일치(**진단값** — 적절한 의역은 틀림이 아니다) · 보존 구간 · 선언 언어 metadata. BLEU · chrF · 의미 유사도는 `unsupported`, judge는 `not-measured`. 지어내지 않는다

## 구성 — 누가 무엇을 하나

```
cmd/eval → evalcli → processingadapter → evaluation      DevHub(apps/devhub) → tools/evals/results(파일)
                         └→ processing(production 분류기)
```

| 자리                                             | 책임                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `apps/api/cmd/eval`                              | signal context를 만들고 종료 코드로 끝내는 bootstrap뿐                                                            |
| `apps/api/internal/evalcli`                      | 명령 · flag · 경로 · replay JSONL 읽기 · git lineage · 출력 · 종료 코드. 채점 규칙을 모른다                       |
| `apps/api/internal/evaluation`                   | 평가 core — dataset · variant · runner · 과제별 채점(`task.go`) · 산출물 · 비교. `processing`을 import하지 않는다 |
| `apps/api/internal/evaluation/processingadapter` | production 분류기 생성자 · HTTP client를 그대로 쓰고 호출을 관찰 · 예산으로 막고 결과를 평가 모양으로 옮긴다      |
| `apps/api/internal/processing`                   | production 사진 분류기(서버와 같은 코드). 평가 때문에 바뀌지 않는다                                               |
| 산출물 v1 계약                                   | `metadata.json` · `cases.jsonl`(정본) · `summary.*` · `comparison.*`(파생). `schemaVersion` 1                     |
| DevHub `/evals`                                  | 결과 파일을 요청마다 읽어 보여 준다. **다시 채점하지 않는다** — 값 · 판정 · 비교는 전부 Go가 쓴 것                |

- **파일 산출물이 정본이다.** DB · queue · 평가 서버는 일부러 없다. 결과를 옮기려면 디렉터리를 옮긴다
- **live 호출은 opt-in이다.** `run`만 provider를 부르고 `--allow-api --max-api-calls N`이 둘 다 있어야 한다. 모델 없는 기준선만 돌리면 호출이 없어 둘 다 필요 없다
- 텍스트 추출 · 번역의 live 실행은 production 코드가 생기기 전까지 없다. 흉내 내는 adapter를 두지 않는다

## 디렉터리

```
datasets/<name>/
  manifest.json        이름 · version · task · tier · split 파일과 case 수 · category당 목표
  dev.jsonl            지시를 고치며 반복해서 보는 몫
  validation.jsonl     고른 뒤 확인하는 몫 — 사람 검토만 채점
  held-out.jsonl       마지막에만 보는 몫 — 사람 검토만 채점, --allow-held-out 없이는 열리지 않음
  fixtures/            사진
variants/<name>.json   모델 이름이 필요 없는 비교 대상(기준선 · replay · endpoint 틀)
experiments/<name>.json 모델 없는 실험 설정 — --variant <name>@<provider>:<model>
predictions/*.jsonl    replay가 읽는 기록된 출력
results/<runId>/       실행 산출물(generated, git이 무시)
results/comparisons/<comparisonId>/   비교 산출물
```

## dataset

| dataset                  | task                 | case  | 비고                                                                                            |
| ------------------------ | -------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `sample-classification`  | image-classification | dev 1 | 합성 공연 안내 사진 한 장. 읽어야 할 값(facts)까지 적은 정답 예시                               |
| `sample-text-extraction` | text-extraction      | dev 1 | 같은 사진. 정답은 사진에 그린 원문 그대로 · field 예시                                          |
| `sample-translation`     | translation          | dev 1 | 사진 없이 원문 텍스트. reference는 사람 검토 전 — `annotation.review: draft`라 `--allow-drafts` |

셋 다 tier `software-fixture` — 모양을 보여 주고 CLI가 도는지 확인하는 용도이고 점수에 뜻이 없다. 여러 case가 필요한 Go 테스트(검색 · 기준선 · 비교)는 저장소 데이터에 기대지 않고 `apps/api/internal/evaluation/testdata/datasets/`의 fixture(21건 합성 `pilot-v1` 포함)를 쓴다.

| tier               | 뜻                                         | 점수의 의미                      |
| ------------------ | ------------------------------------------ | -------------------------------- |
| `software-fixture` | loader 테스트 · 형식 예시                  | 없음 — 배선 확인용               |
| `synthetic-pilot`  | 합성 사진으로 harness를 돌려 보는 단계     | 모델 비교의 참고, benchmark 아님 |
| `golden-benchmark` | 사람이 검토한 정답. 모든 split이 채점 가능 | 모델 비교의 근거                 |

**benchmark-ready** — tier가 `golden-benchmark`이고, 모든 case가 채점 자격이 있고, split마다 category당 목표 수(`targetPerCategory`)를 채웠을 때. `pnpm eval validate --dataset <name>`이 무엇이 모자란지 적는다. 지금 benchmark-ready인 dataset은 없다.

**채점 자격** — `annotation.review: reviewed` · `provenance.privacyReview: reviewed` · `annotation.ambiguity`가 `high`가 아님 · dev가 아닌 split은 `annotation.method: human`. 값이 있다고 검토가 있었던 것은 아니다 — **검토 사실은 값을 적은 사람의 책임**이다.

**selection hash** — 고른 split의 case를 id 순으로 `id · JSONL 원문 · 사진 byte`를 이은 sha256. 어느 byte가 바뀌어도 달라지고, 같은 hash끼리만 비교한다.

## variant

| 파일                                                        | 쓰임                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `baseline-always-other.json` · `baseline-nearest-case.json` | 모델 없는 기준선 — 늘 other / none, 가장 비슷한 사례의 정답 복사 |
| `local.example.json`                                        | live manifest의 틀(placeholder)                                  |
| `replay-example.json` · `replay-candidate.json`             | 분류 replay                                                      |
| `text-extraction-replay.json` · `translation-replay.json`   | 텍스트 과제 replay(live adapter 없음)                            |

**모델 이름은 파일에 적지 않는다.** 모델은 계속 바뀌므로 실행할 때 고른다.

- 모델만 — `--variant anthropic:<model>` · `--variant openai:<model>`. production 지시 그대로인 variant를 즉석에서 만든다(key는 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY`, variant id는 모델 이름)
- 실험 — `--variant <설정>@anthropic:<model>`. 설정은 `experiments/<설정>.json`이고 모델이 없다. 계단식은 `cascade@anthropic:<먼저 답할 모델>,<다시 물을 모델>`

| `experiments/`       | 쓰임                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `facts-prompt.json`  | 실험 지시 — `prompts/facts-normalized.md`(날짜 · 금액을 정해진 모양으로 적게 함) |
| `similar-cases.json` | 비슷한 dev 사례 3개를 예시로 붙임                                                |
| `cascade.json`       | 계단식 — 첫 모델이 low · medium이면 두 번째 모델에 다시 물음                     |

`variants/`의 파일은 모델 이름이 필요 없는 것(기준선 · replay)과 endpoint를 정하는 틀(`local.example.json`)뿐이다. 모델 이름은 DevHub `/evals`의 새 비교 실행이 새로고침마다 공급자 목록에서 불러오고(DevHub를 두 key와 함께 띄울 때), 그 모양으로 명령을 만든다. `pnpm eval list`도 실험 설정의 쓰는 모양을 보인다. 예시 · replay manifest는 `"placeholder": true`라 live가 거절된다. key는 값이 아니라 환경변수 이름(`apiKeyEnv`)만 적는다.

## 여러 모델 · 기준선 · 실험 비교

`--variant`를 반복하면 한 run이 같은 case를 variant마다 돌리고, `summary.md` · DevHub에 variant별 표가 나란히 나온다. 기준선을 함께 넣어 모델이 규칙보다 나은지 본다.

```bash
# <작은>·<큰>·<openai 모델>은 지금 쓸 모델 이름으로 바꾼다
V="--variant baseline-always-other --variant anthropic:<작은> --variant anthropic:<큰> --variant openai:<openai 모델> --variant facts-prompt@anthropic:<큰> --variant cascade@anthropic:<작은>,<큰>"
pnpm eval plan --dataset <내 dataset> $V                              # 호출 수 확인, 호출 0
ANTHROPIC_API_KEY=... OPENAI_API_KEY=... pnpm eval run --dataset <내 dataset> $V --allow-api --max-api-calls 400 --run-id models
pnpm eval compare --baseline models:<큰 모델 id> --candidate models:facts-prompt-<큰 모델 id>
```

| 설정(`config`) | 하는 일                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `promptPath`   | system 지시만 그 파일로 바꾼다(manifest 기준 상대 경로). 결과 schema · 검증은 production 그대로, 산출물에는 `promptHash`만               |
| `retrieval.k`  | dev split에서 비슷한 사례 k개(1–5)를 골라 그 정답을 지시 끝에 힌트로 붙인다. validation · held-out과 같은 원본 묶음은 예시가 되지 않는다 |
| `cascade`      | 첫 모델 답의 confidence가 `escalateOn`에 있거나 답이 없으면 `cascade.model`에 다시 묻는다                                                |
| `baseline`     | adapter `baseline` · provider `none`에서만. `constant`(정한 답) 또는 `nearest`(가장 비슷한 사례 복사, `retrieval` 필요)                  |

새로 보는 값(분류, `summary.md`의 quality 표 · DevHub 품질 표):

| 값                            | 뜻                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| facts recall                  | 정답의 facts 중 예측에서 찾은 몫. label은 보지 않고 값만 — 금액은 수, 날짜 · 시간은 숫자 묶음, 글자는 공백 무시 포함 |
| action ready                  | 맞는 행동을 골랐고 그 행동에 필요한 값(`requiredFor`)을 모두 읽은 몫                                                 |
| high but wrong                | confidence high 중 해서는 안 되는 답(category · 행동 · 금지 행동 · 필요한 값 중 하나라도 틀림)                       |
| auto-run precision · coverage | high이고 행동이 있는 답(확인 없이 실행할 답)의 정확도와, 고른 case 중 그 몫                                          |
| similar case top-1 · MRR      | 붙인 예시의 정답 category가 질문 case와 같은지                                                                       |
| cascade escalation rate       | 두 번째 모델에 다시 물은 몫                                                                                          |

비슷한 사례 예시 · 사례 복사 기준선은 dev에 case가 여럿 있어야 뜻이 있다(자기 자신과 같은 원본 묶음은 예시가 되지 않는다). 검색은 사진 배치로 찾으므로 글자 사진에서는 약하다([설계](../../docs/architecture/agent-evaluation.md#실험-설정)).

## replay — 기록을 다시 채점

`replay`는 `predictions/*.jsonl`만 읽고 provider를 부르지 않는다. 한 줄에 `variantId` · `caseId`와

- 분류 — `prediction` `{category, facts, suggestedAction, confidence}`
- 텍스트 추출 — `text` · 선택 `fields`
- 번역 — `text` · 선택 `targetLanguage`
- 실패 기록 — `status`(`failed` · `timed-out`) + `failure` `{class, kind, message}`
- 분류의 선택 기록 — `retrieval` `{examples: [{caseId, category, similarity}]}` · `cascade` `{firstModel, firstConfidence, escalated}`

dataset의 정답을 예측으로 베끼지 않는다. 기록이 없는 case는 `not-run`이고 run은 `partial`이다. replay의 latency는 `not-measured`다.

## live 실행과 안전장치

실제 provider(유료 API · 로컬 Ollama 포함) 호출은 `run`뿐이다. 반드시 차례로:

1. 모델을 고른다 — `anthropic:<model>` · `openai:<model>`(실험이면 `<설정>@…`). endpoint가 다른 서비스만 예시를 복사해 `model`을 채우고 `placeholder`를 지운다
2. key를 환경변수에 둔다(`ANTHROPIC_API_KEY` · `OPENAI_API_KEY`, 파일이면 `apiKeyEnv`가 가리키는 것). 비어 있으면 preflight가 막는다
3. `pnpm eval plan`으로 호출 수를 본다(호출 0회)
4. `--allow-api`와 `--max-api-calls N`을 **둘 다** 준다. 없으면 usage 오류(2)로 멈춘다

```bash
pnpm eval plan --dataset <내 dataset> --variant anthropic:<model>       # planned · preflight, 호출 0
ANTHROPIC_API_KEY=... pnpm eval run --dataset <내 dataset> --variant anthropic:<model> --case event-01 --limit 1 --allow-api --max-api-calls 3
```

- **예산** — `--max-api-calls`는 실제 HTTP 왕복(SDK 재시도 포함)의 총 상한. 기대 호출은 `지원 variant × case × trials`이고 Claude SDK는 429 · 5xx를 최대 2회 재시도하므로 최악 3배. 바닥나면 남은 case는 `not-run`, run은 `partial`
- **정답 격리** — adapter는 사진(또는 원문)만 받는다. 정답 · 주석 · case id는 요청에 실리지 않는다
- **secret** — key는 환경변수에서만 읽고 산출물 · 출력에 없다. 응답에 되풀이돼도 `[redacted]`
- **held-out** — `--allow-held-out` 없이는 열리지 않는다. 마지막 확인에만 쓰고 결과를 보고 dataset을 고치지 않는다
- 이 저장소 작업에서 실제 provider는 한 번도 부르지 않았다. live 경로는 가짜 HTTP 응답으로만 검증됐다

### 일부만 실패했을 때 — `pnpm eval retry`

```bash
pnpm eval retry --run my-run --allow-api --max-api-calls 3     # 새 run my-run-retry (--run-id로 바꿈)
```

- 원래 run에서 끝난(completed) 결과는 **호출 없이 옮기고** 실패 · 시간 초과 · 미실행만 다시 부른다. 새 run에 variant가 모두 들어 있어 한 비교표로 본다. 원래 run은 그대로 남는다
- 원래 run의 dataset · split · 고른 case · trials · variant 설정을 그대로 쓴다. variant는 같은 id의 설정 파일, 없으면 `공급자:모델`로 다시 만든다. dataset · case 선택 · variant 설정이 달라졌으면 섞지 않고 거절한다
- 옮긴 결과는 기록된 관측을 **지금 채점기로 다시 채점**한다(replay와 같음) — 새 run 전체가 한 채점기의 점수. 지연 · usage · 호출 수는 원래 값 그대로이고 case 줄에 `carriedFrom`, metadata · summary에 `retriedFrom`이 남는다
- 옮기기만 하는 variant는 key가 없어도 된다(부르지 않음). 다 끝난 run이면 "nothing to retry"로 끝난다

## 산출물 — `results/<runId>/`

| 파일            | 성격 | 내용                                                                                                        |
| --------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `metadata.json` | 정본 | 무엇을 어떤 조건으로 돌렸는지. `status`가 `running` → `completed` · `partial`로 마지막에 바뀜               |
| `cases.jsonl`   | 정본 | invocation마다 한 줄(not-run 포함) — 실행 · 판정 · 예측 · 정답 · case 지표 · 요청한 모델과 실제로 답한 모델 |
| `summary.json`  | 파생 | 과제별 요약. 종합 점수 없이 품질 · 신뢰성 · 지연 · 비용이 따로                                              |
| `summary.md`    | 파생 | 사람이 읽는 표                                                                                              |

- **다시 만들기** — `pnpm eval report --run <runId>`가 정본 두 파일에서 `summary.*`를 같은 byte로 다시 쓴다. 정본은 건드리지 않고 모델을 부르지 않는다
- 쓰는 순서는 metadata(running) → case 줄 → summary(원자적) → metadata(종료). 같은 `runId`는 거절하고 dataset 디렉터리를 결과 root로 쓰지 못한다
- 모델 원문 텍스트는 `privacyReview: reviewed`인 case에서만 남는다. key · 헤더 · base64는 어느 파일에도 없다
- **v1 호환** — 선택 field 추가는 v1 안에서, 삭제 · 이름 · 뜻 변경은 `schemaVersion`을 올린다. 모르는 버전은 Go와 DevHub가 모두 거절한다([규칙](../../docs/architecture/agent-evaluation.md#artifact-v1-호환-규칙))

### 어느 모델이 답했나

- **요청한 모델** — `metadata.json`의 `variants[].model`(계단식이면 `cascade.model`도). DevHub run 상세 · 비교 화면 머리에 `공급자 · 모델`
- **실제로 답한 모델** — case 줄의 `model` `{requested, answered}`. `answered`는 공급자가 응답에 적은 이름이라 날짜 붙은 판(`<모델>-<날짜>`)이나 거절 뒤 대체 모델일 수 있다
- **모아 보기** — `summary.md` variant 제목 아래 `answered by: <모델> ×<수> · no model name <수> · different from requested <수>`, DevHub variant 블록의 "답한 모델" 줄. 요청과 다른 모델이 답했으면 ⚠로 알린다. case를 펼치면 `요청 → 답`
- 손으로 쓴 replay 기록에는 모델 이름이 없어 "기록 없음"으로 보인다

### 값을 읽는 법

| 값                                      | 뜻                                                                 |
| --------------------------------------- | ------------------------------------------------------------------ |
| `{"availability":"measured","value":0}` | 잰 값이 0이다(정확도 0 · token 0)                                  |
| `partial`                               | 일부만 잰 값. 이유가 함께 있다                                     |
| `unavailable`                           | 잴 수 있어야 하는데 이번에는 얻지 못했다(오류 · 응답에 없음)       |
| `unsupported`                           | 이 과제 · 공급자가 주지 않는다(번역 BLEU 등)                       |
| `not-measured`                          | 재지 않기로 했다(replay의 latency · judge)                         |
| `not-applicable`                        | 이 case에는 뜻이 없다(정답이 빈 텍스트의 CER · tokenizer 없는 WER) |

값이 없는 넷은 0이 아니고 분모에서 빼지도 않는다. 실패 · 시간 초과 · 미실행은 정확도 분모에 남는다.

## 비교 — `pnpm eval compare`

```bash
pnpm eval compare --baseline <runId>:<variantId>[:<trial>] --candidate <runId>:<variantId> [--gate gate.json] [--comparison-id id]
```

- `results/comparisons/<comparisonId>/comparison.{json,md}`에 쓴다. run 산출물은 건드리지 않는다
- **비교 가능** — dataset(이름 · version) · split · selection hash · 고른 case · task · mode · 채점 규칙 · label 목록 · 채점기가 같고 둘 다 완료된 run. 아니면 이유만 적고 차이를 내지 않는다. 지시 · commit · 모델은 실험 변수다
- 결론은 **서술**이고 통계적 유의성을 주장하지 않는다. 짝 30개 미만이면 small-sample 경고가 붙는다
- **gate** — `{"version":"...","maxNewCriticalErrors":0,"maxPassRateDropPp":5,"maxSchemaInvalidIncrease":0}`처럼 적은 규칙만 판정한다. 실패하면 종료 코드 4. partial · 채점기 차이면 적용하지 않는다
- `--allow-partial` · `--allow-evaluator-drift`로 서술 비교만 넓힐 수 있다(gate 없음)
- 정확한 종료 코드가 필요하면 `go -C apps/api build -o <path> ./cmd/eval`로 빌드한 바이너리를 쓴다(`go run`은 자식 코드를 그대로 돌려주지 않을 수 있다)

종료 코드: 0 정상 · 2 flag/usage 오류 · 3 불완전(partial · 검증 실패 · 비교 불가) · 4 gate 실패.

## DevHub에서 보기

```bash
pnpm dev:devhub          # http://localhost:3100
```

| 경로                            | 보이는 것                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/evals`                        | 안내 겸 목차 — 과제별 한 줄 요약 · 답 출처별 run 수 · 비교할 수 있는 것(모델 · OpenAI 호환 · 오픈소스 · 지시문 · 예시 · 계단식 · 기준선 · 기록)과 예시 파일 · 비교하는 방법 3가지 · 저장된 짝 비교                                                                                         |
| `/evals/tasks/<task>`           | 과제 하나 — 그 과제의 run 목록 · 답 출처 · dataset 필터 · 저장된 비교 · 추세                                                                                                                                                                                                               |
| `/evals/runs/<runId>`           | 위에서 아래로 좁혀 감 — ① variant 비교표(대표 지표 · 기준 variant 대비 ▲ · ▼ · 열마다 최고, 모든 지표는 접힘) ② case × variant 결과(갈림 · 기준보다 나빠짐 · 모두 실패 필터) ③ 고른 variant 하나의 자세한 지표 묶음 · 틀린 곳 · case. 선택은 `?variant=` · `?base=` · `?show=` · `?cases=` |
| `/evals/compare/<comparisonId>` | 무엇을 비교했나 · gate · 축별 차이 · category별 F1 · case 변화(새로 틀림 · 고쳐짐 · 실행 오류 · critical)                                                                                                                                                                                  |

DevHub는 저장소 root(`pnpm-workspace.yaml`이 있는 곳)의 `tools/evals/results`를 요청마다 읽으므로 새 run이 바로 보인다. 값은 Go가 쓴 그대로이고 값이 없으면 이유가 보인다.

## dataset 채우기

1. 과제에 맞는 `sample-*`을 복사해 새 이름으로 둔다(`cp -R datasets/sample-classification datasets/my-photos`). `manifest.json`의 `name` · `guideline`을 바꾼다. tier는 합성 사진이면 `synthetic-pilot`, 사람이 검토한 정답으로 모델을 비교할 것이면 `golden-benchmark`
2. 예시 case를 지우고 아래 순서로 case를 더한다

### case 더하기

1. 사진을 `datasets/<name>/fixtures/`에 둔다(JPEG · PNG · GIF · WebP, 7,500,000 byte 이하, 확장자와 내용이 같아야 함)
2. split 파일(`dev.jsonl` 등)에 한 줄을 더한다 — `id`(소문자 · 숫자 · `-`) · `revision` · `task` · `split` · `provenance` · `annotation` · `input.image{path, mediaType, sha256}` · `expected.<task>`. 모양은 [wire 계약](../../docs/architecture/agent-evaluation.md#dataset-case--jsonl-한-줄-schemaversion-1)
3. `manifest.json`의 그 split `cases` 수를 고치고, 정답을 바꾸거나 case를 더했으면 `version`을 올린다
4. 같은 원본의 crop · 재압축은 같은 `sourceGroupId`로 묶는다 — split 사이에 걸치면 loader가 거절한다
5. `pnpm eval validate --dataset <name>`

sha256은 `shasum -a 256 fixtures/<file>`. validation · held-out에는 사람 검토(`method: human`)만 넣고, draft를 자동으로 승격하지 않는다.

## variant 더하기

0. 모델만 바꾸거나 실험 설정을 얹는 것이면 파일을 만들지 않는다 — `anthropic:<model>` · `<설정>@anthropic:<model>`. 새 실험은 `experiments/`에 모델 없이 `config`만 둔다
1. endpoint가 다른 서비스면 `variants/local.example.json`을 복사해 `id`(파일 이름과 같은 식별자) · `model`을 채운다
2. live로 쓸 것이면 `placeholder`를 지우고 `apiKeyEnv`(anthropic) 또는 `endpoint`(openai 호환)를 둔다. replay만 할 것이면 `placeholder: true`로 둔다
3. 실험이면 `config`에 `promptPath` · `retrieval` · `cascade`를 둔다. temperature · seed · ensemble은 지원하지 않는다 — 값이 있으면 거절된다
4. `pnpm eval list`에서 `live adapter exists` · `replay only`를 확인한다

## 과제 더하기

zero-touch가 아니라 정해진 목록을 고친다. 빠뜨리면 컴파일 · `TestEveryTaskHasScoring` · 산출물 계약 테스트가 잡는다. 전체 목록은 [새 task 추가](../../docs/architecture/agent-evaluation.md#새-task-추가).

1. `evaluation/contract.go` — `Task` 상수 · 입력 · 정답 모양과 검증
2. `evaluation/result.go` — 예측 모양과 검증
3. `evaluation/<task>.go` — case 판정 · trial 요약 · 비교 축
4. `evaluation/task.go` — `taskScorings`에 항목 하나
5. `aggregate.go`(요약 branch) · `artifact.go`(`summary.md` 표) · `dataset.go`(사진 여부 · readiness)
6. live가 있으면 adapter와 `variant.go`의 `adapterTasks`, 없으면 `evalcli/replay.go`의 기록 형식
7. 산출물 golden · DevHub `apps/devhub/src/lib/evaluations`의 decoder와 화면

## 검증

```bash
pnpm eval:check                 # Go — cmd/eval · evalcli · evaluation/... 테스트 + sample 3개 validate. 모델 호출 없음
pnpm nx run devhub:test         # DevHub — 산출물 decoder · repository · /evals 화면(Go golden을 그대로 읽음)
```

산출물 golden(`apps/api/internal/evaluation/testdata/artifacts` · `comparisons`)은 Go가 만든 byte이고 Go · DevHub 테스트가 함께 읽는다. 채점 · 산출물을 바꿨으면 `EVAL_UPDATE_GOLDEN=1 go -C apps/api test ./internal/evaluation`으로 다시 만들고 차이를 확인한다.

## 문제 해결

| 증상(실제 메시지)                                                                                    | 원인과 해결                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `eval: repository root not found (no nx.json above the working directory); pass --root`              | 저장소 밖에서 실행했다. 저장소 안에서 `pnpm eval ...`을 쓰거나 `--root <저장소 경로>`                            |
| `eval: structural validation failed: ...`                                                            | dataset이 없거나 manifest · JSONL · 사진이 계약에 안 맞는다. 메시지의 줄 · case id를 고친다                      |
| `eval: dataset is not benchmark-ready`(`--require-ready`)                                            | 구조는 맞지만 benchmark가 아니다. `validate` 출력의 이유(tier · 자격 · 목표 수)를 채운다                         |
| plan의 preflight `variant ... is marked placeholder ...; it is not for live runs`                    | 예시 manifest다. 복사해 `model`을 채우고 `placeholder`를 지운다                                                  |
| preflight `variant ...: environment variable ANTHROPIC_API_KEY is empty`                             | key 환경변수가 비었다. `apiKeyEnv`가 가리키는 변수에 key를 둔다                                                  |
| `eval: run calls a real provider; pass --allow-api and --max-api-calls N (or --dry-run)`             | live는 opt-in이다. 호출하려면 둘 다, 확인만 하려면 `--dry-run` 또는 `plan`                                       |
| `eval: run is partial (budget exhausted)`                                                            | 예산이 모자랐다. `plan`의 planned × 재시도 여유(최대 3배)로 `--max-api-calls`를 다시 잡는다                      |
| plan의 `"reason": "adapter processing does not support text-extraction (replay only)"`               | 그 과제에는 live adapter가 없다. `replay`를 쓴다                                                                 |
| `eval: predictions line 1: unexpected EOF`(또는 `... carries text, not a classification prediction`) | 기록 줄이 JSON이 아니거나 과제와 모양이 다르다. [replay](#replay--기록을-다시-채점)의 모양을 따른다              |
| `eval: run is partial (some selected invocations did not run; see not-run in summary.md)`            | 기록이 없는 case가 있다. predictions에 줄을 더하거나 `--case` · `--limit`로 고른다                               |
| `eval: runs are not comparable: selection hash differs: ...`                                         | 다른 case · dataset · 규칙으로 돌린 run이다. 같은 조건으로 다시 돌리거나, partial이면 `--allow-partial`로 서술만 |
| `... run schemaVersion 2 is not supported (want 1)`                                                  | 다른 build가 쓴 산출물이다. 그 build로 읽거나 이 build로 다시 돌린다                                             |
| `summary.json ... does not match its raw artifacts; regenerate it before comparing`                  | 채점기가 바뀌었다. `pnpm eval report --run <id>`로 양쪽을 다시 만든 뒤 비교(필요하면 `--allow-evaluator-drift`)  |
| `eval: evaluation: retrieval needs eligible dev cases to draw examples from`                         | 예시를 고를 dev case가 없다. dataset의 dev에 채점 자격이 있는 사진 분류 case가 있어야 한다                       |
| `eval: evaluation: promptPath "../x.md" must stay next to its manifest or setting file`              | 지시 파일은 설정 파일이 있는 디렉터리 아래에만 둔다(`experiments/prompts/`)                                      |
| DevHub `/evals`에 run이 없다                                                                         | `--out`을 다른 곳으로 줬거나 다른 저장소 root다. DevHub는 `<root>/tools/evals/results`만 읽는다                  |
| DevHub의 run이 "읽을 수 없음"                                                                        | 화면에 kind(산출물 오류 · 모르는 schema 버전 · 미완료)와 파일 경로가 있다. `pnpm eval report --run <id>`로 확인  |
