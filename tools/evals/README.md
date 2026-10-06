# evals

사진 분류(`image-classification`) · 텍스트 추출(`text-extraction`) · 번역(`translation`)을 같은 dataset과 같은 채점기로 평가하는 harness. 탐색은 Python notebook(`lab/`), 채점 · 비교 · gate · 산출물은 Go CLI(`pnpm eval`), 보기는 DevHub(`/evals`). 설계와 근거는 [agent-evaluation.md](../../docs/architecture/agent-evaluation.md).

| 무엇                          | 누가                                       | 어디                                      |
| ----------------------------- | ------------------------------------------ | ----------------------------------------- |
| 연구 진단(탐색 · 후보 임계값) | Python notebook                            | `tools/evals/lab`                         |
| 정식 채점                     | Go evaluation                              | `apps/api/internal/evaluation`            |
| production 동작(실제 분류기)  | Go processing                              | `apps/api/internal/processing`            |
| 공식 gate                     | Go evaluation (`pnpm eval compare --gate`) | `apps/api/internal/evaluation/compare.go` |
| 정본 산출물                   | Go evaluation                              | `tools/evals/results/<runId>/`            |
| 관찰(run · 비교 · gate 결과)  | DevHub                                     | `apps/devhub` `/evals`                    |

Python은 절대 채점하지 않고, DevHub는 절대 다시 채점하지 않는다. 모든 점수 · 판정 · 통과 여부는 Go가 쓴 파일이다.

## 5분 안에 — 골든 패스

```bash
# 1. dataset은 어디 있나 — tools/evals/datasets/<name>/ (채우는 법은 아래 dataset 채우기)
pnpm eval list                                        # dataset · variant · 실험 설정 · predictions와 준비 상태
pnpm eval validate --dataset sample-classification    # 구조 검증 + benchmark-ready 여부. 정식 검증은 이것뿐

# 2. notebook 시작
pnpm eval:lab:setup                                   # uv sync → tools/evals/lab/.venv
pnpm eval:lab                                         # JupyterLab (localhost 포트를 연다)
#    notebooks/00_dataset_overview.ipynb                  dataset 한 눈에
#    notebooks/classification/01_eda.ipynb                분류 dataset 살피기 · 사진 보기 · 걸러 보기
#    notebooks/classification/02_prompt_model_lab.ipynb   지시문 · 공급자 · 모델 바꿔 실험 → 원시 예측 내보내기
#    notebooks/classification/03_gate_lab.ipynb           Go가 채점한 run에서 임계값 후보 조사

# 3. API key는 환경변수뿐 — ANTHROPIC_API_KEY · OPENAI_API_KEY (notebook의 RUN=True와 pnpm eval run이 읽는다).
#    파일 · notebook · 산출물에 값을 적지 않는다

# 4. notebook이 쓰는 원시 예측 — 채점 결과가 아니라 모델의 답
#    임시:  tools/evals/lab/out/<experiment>.jsonl (+ <experiment>.json variant manifest)   git 무시
#    보존:  tools/evals/predictions/<experiment>.jsonl                                       커밋

# 5. Go로 replay — 여기서만 채점되고 정본 산출물이 생긴다
pnpm eval replay --dataset sample-classification --variant tools/evals/lab/out/<experiment>.json \
  --predictions tools/evals/lab/out/<experiment>.jsonl --run-id <experiment>
#    → tools/evals/results/<experiment>/{metadata.json, cases.jsonl, summary.json, summary.md}

# 6. candidate vs baseline — gate는 Go가 판정한다(종료 코드 4 = 실패)
pnpm eval compare --baseline <run>:<baseline variant> --candidate <run>:<candidate variant> \
  --gate tools/evals/gates/example.json --comparison-id <name>
#    → tools/evals/results/comparisons/<name>/comparison.{json,md}

# 7. DevHub에서 보기
pnpm dev:devhub                                       # http://localhost:3100/evals
```

key 없이 끝까지 가 보려면 5번에 `--variant replay-example --predictions tools/evals/predictions/lab-example.jsonl`(notebook writer가 쓴 파일)을 넣는다. 같은 `--run-id`는 다시 쓸 수 없다(덮어쓰지 않음).

<details>
<summary>VS Code에서 notebook을 열 때</summary>

커널을 한 번 등록하고 **Select Kernel → Select Another Kernel → Jupyter Kernel... → `snapdone eval lab`**을 고른다.

```bash
tools/evals/lab/.venv/bin/python -m ipykernel install --user --name snapdone-eval-lab --display-name "snapdone eval lab"
```

</details>

## split 규율

| split        | 언제                                                                    | 누가 여나                                                                                               |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `dev`        | 지시문 · 모델 · 설정을 고치며 반복해서 본다                             | notebook 기본, `pnpm eval` 기본(`--split dev`)                                                          |
| `validation` | 후보를 골랐을 때 한 번 확인한다. 사람 검토(`method: human`) case만 채점 | notebook `split="validation"`, `pnpm eval … --split validation`                                         |
| `held-out`   | 마지막 한 번. 결과를 보고 dataset · 설정을 고치지 않는다                | `pnpm eval … --split held-out --allow-held-out`. notebook의 `allow_held_out=True`는 실수 방지용 UX일 뿐 |

**경계는 Go다.** `--allow-held-out` 없이는 Go가 열지 않고, 예시(retrieval)는 dev에서만 온다. notebook의 guard는 편의이지 보안 경계가 아니다.

## 승격 — 탐색에서 production까지

```
notebook에서 탐색(dev)  →  후보(지시문 · 모델 · 임계값)  →  Go 정식 평가(pnpm eval run / replay)
→  Go 공식 gate(pnpm eval compare --gate)  →  사람의 결정  →  명시적 production 변경(PR)
```

- **후보를 Go의 기존 설정으로 적는다** — 지시문은 `experiments/<설정>.json` + `prompts/*.md`, 임계값은 `cascade.escalateOn`, 한계는 `gates/<name>.json`
- **production 변경은 코드 · 환경변수다** — 모델은 `PROCESSING_PROVIDER` · `PROCESSING_MODEL`(필요하면 `PROCESSING_BASE_URL`, 예시는 `apps/api/.env.example`), 지시문은 `apps/api/internal/processing/result.go`의 `instructions`. 둘 다 PR과 리뷰를 거친다
- 지시문을 옮긴 뒤 `pnpm nx run api:test`, 그리고 기본 지시문(`anthropic:<모델>`)으로 같은 비교를 한 번 더 돌려 후보와 같은 결과인지 본다
- 임계값(계단식)은 production 분류기에 아직 없다. 반영하려면 별도 코드 작업
- notebook → production 설정 자동 반영은 없다. notebook은 `lab/out/`과 `predictions/`에만 쓴다

## 명령

| 명령                                                 | 하는 일                                                                         | 모델 호출                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `pnpm eval list`                                     | dataset · variant · 실험 설정 · predictions와 준비 상태                         | 없음                             |
| `pnpm eval validate`                                 | dataset 구조 검증 · benchmark-ready(`--require-ready`면 아니면 종료 3)          | 없음                             |
| `pnpm eval plan`                                     | 고른 case · 호출 수 · preflight(빠진 key · placeholder)                         | 없음                             |
| `pnpm eval run`                                      | live 실행. `--allow-api --max-api-calls N` 둘 다 있어야 함(기준선만이면 불필요) | **있음**                         |
| `pnpm eval replay`                                   | `--predictions` 기록을 다시 채점                                                | 없음                             |
| `pnpm eval report`                                   | `summary.*`를 정본에서 같은 byte로 다시 씀                                      | 없음                             |
| `pnpm eval retry`                                    | 실패 · 미실행만 다시 부르고 끝난 결과는 옮김 → `<run>-retry`                    | **있음**                         |
| `pnpm eval compare`                                  | 두 run의 variant를 짝 비교 · `--gate`면 판정                                    | 없음                             |
| `pnpm eval retrieve`                                 | 비슷한 사례 검색만 잼(`--k 1..5`)                                               | 없음                             |
| `pnpm eval:check`                                    | Go 테스트 + sample 3개 validate                                                 | 없음                             |
| `pnpm eval:lab:setup` · `eval:lab` · `eval:lab:test` | notebook 설치 · 실행 · 테스트(notebook 정책 포함)                               | 없음(notebook `RUN=True`만 호출) |

공통 flag: `--root`(nx.json이 있는 곳, 자동) · `--out`(기본 `tools/evals/results`). plan · run · replay 공통: `--split` · `--case`(반복) · `--limit` · `--trials` · `--variant`(반복) · `--allow-drafts` · `--allow-held-out` · `--policy` · `--run-id`. 종료 코드: 0 정상 · 2 usage · 3 불완전(partial · 검증 실패 · 비교 불가) · 4 gate 실패. 정확한 코드가 필요하면 `go -C apps/api build -o <path> ./cmd/eval`로 빌드한 바이너리를 쓴다.

## 과제별로 무엇이 되나

| task                   | live 실행                                                 | replay | 형식 예시                | 기본 채점 규칙(다른 규칙)                                                         | 대표 지표                       |
| ---------------------- | --------------------------------------------------------- | ------ | ------------------------ | --------------------------------------------------------------------------------- | ------------------------------- |
| `image-classification` | **됨** — production 분류기(Claude · OpenAI 호환 · Ollama) | 됨     | `sample-classification`  | `classification-pass-v1`                                                          | category 정확도                 |
| `text-extraction`      | **없음** — production OCR 코드가 없다                     | 됨     | `sample-text-extraction` | `text-pass-v1`                                                                    | corpus CER                      |
| `translation`          | **없음** — production 번역 코드가 없다                    | 됨     | `sample-translation`     | `translation-reference-v1`(case를 채점하지 않음) · `translation-exact-v1`(strict) | 보존 구간(critical span) 재현율 |

- 분류 — category · 추천 행동(acceptable · forbidden) · 위험(critical) · confidence 분포, 추출값(facts) 재현율 · 행동 완료 가능률 · 자동 실행 점검. 추출값은 pass에 넣지 않는다
- 텍스트 추출 — 공백 정규화 뒤 rune CER · 단어 WER(`tokenizer: whitespace`인 case만) · field 정확도. Unicode 정규화는 하지 않는다
- 번역 — 승인된 reference와의 일치(**진단값**) · 보존 구간 · 선언 언어 metadata. BLEU · chrF · 의미 유사도는 `unsupported`, judge는 `not-measured`

## 디렉터리

```
datasets/<name>/
  manifest.json        이름 · version · task · tier · split 파일과 case 수 · category당 목표
  dev.jsonl · validation.jsonl · held-out.jsonl
  fixtures/            사진
variants/<name>.json   모델 이름이 필요 없는 비교 대상(기준선 · replay 이름표 · endpoint 틀)
experiments/<name>.json 모델 없는 실험 설정 — --variant <name>@<provider>:<model>; prompts/에 지시문
predictions/*.jsonl    replay가 읽는 기록된 출력(notebook 실험의 보존본 포함)
gates/<name>.json      compare --gate가 읽는 규칙. example.json은 모양 예시
lab/                   Python 연구 workspace — lab/README.md. lab/out/은 notebook 임시 출력(git 무시)
results/<runId>/       실행 산출물(generated, git 무시)
results/comparisons/<comparisonId>/   비교 산출물
```

## dataset

| tier               | 뜻                                         | 점수의 의미                      |
| ------------------ | ------------------------------------------ | -------------------------------- |
| `software-fixture` | loader 테스트 · 형식 예시(`sample-*`)      | 없음 — 배선 확인용               |
| `synthetic-pilot`  | 합성 사진으로 harness를 돌려 보는 단계     | 모델 비교의 참고, benchmark 아님 |
| `golden-benchmark` | 사람이 검토한 정답. 모든 split이 채점 가능 | 모델 비교의 근거                 |

- **benchmark-ready** — tier `golden-benchmark` · 모든 case 채점 자격 · split마다 `targetPerCategory` 충족. `pnpm eval validate`가 모자란 것을 적는다
- **채점 자격** — `annotation.review: reviewed` · `provenance.privacyReview: reviewed` · `ambiguity`가 `high`가 아님 · dev가 아닌 split은 `method: human`. 검토 사실은 값을 적은 사람의 책임이다
- **selection hash** — 고른 split의 case를 id 순으로 `id · JSONL 원문 · 사진 byte`를 이은 sha256. 같은 hash끼리만 비교한다
- 여러 case가 필요한 Go 테스트는 `apps/api/internal/evaluation/testdata/datasets/`의 fixture(합성 `pilot-v1` 포함)를 쓴다

### dataset 채우기

1. `cp -R datasets/sample-classification datasets/<name>` 뒤 `manifest.json`의 `name` · `guideline` · `tier`를 바꾼다
2. 사진을 `fixtures/`에 둔다(JPEG · PNG · GIF · WebP, 7,500,000 byte 이하, 확장자와 내용이 같아야 함). sha256은 `shasum -a 256 fixtures/<file>`
3. split 파일에 한 줄씩 더한다 — `id`(소문자 · 숫자 · `-`) · `revision` · `task` · `split` · `provenance` · `annotation` · `input.image{path, mediaType, sha256}` · `expected.<task>`. 모양은 [wire 계약](../../docs/architecture/agent-evaluation.md#dataset-case--jsonl-한-줄-schemaversion-1)
4. `manifest.json`의 split `cases` 수를 맞추고, 정답을 바꾸거나 case를 더했으면 `version`을 올린다. 같은 원본의 crop · 재압축은 같은 `sourceGroupId`
5. `pnpm eval validate --dataset <name>`

validation · held-out에는 사람 검토(`method: human`)만 넣고, draft를 자동으로 승격하지 않는다.

## variant와 실험 설정

**모델 이름은 파일에 적지 않는다.** 실행할 때 고른다.

- 모델만 — `--variant anthropic:<model>` · `--variant openai:<model>`. production 지시 그대로, key는 `ANTHROPIC_API_KEY` · `OPENAI_API_KEY`, variant id는 모델 이름
- 실험 — `--variant <설정>@anthropic:<model>`. 설정은 `experiments/<설정>.json`. 계단식은 `cascade@anthropic:<먼저 답할 모델>,<다시 물을 모델>`
- 파일 — 기준선(`baseline-always-other` · `baseline-nearest-case`), replay 이름표(`replay-example` 등, `placeholder: true`), endpoint 틀(`local.example.json`을 복사해 `model`을 채우고 `placeholder`를 지움)

| `config`      | 하는 일                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `promptPath`  | system 지시만 그 파일로 바꾼다(설정 파일 기준 상대 경로). 결과 schema · 검증은 production 그대로, 산출물엔 `promptHash` |
| `retrieval.k` | dev split에서 비슷한 사례 k개(1–5)의 정답을 지시 끝에 힌트로 붙인다                                                     |
| `cascade`     | 첫 모델 답의 confidence가 `escalateOn`에 있거나 답이 없으면 `cascade.model`에 다시 묻는다 — 임계값 후보는 여기 적는다   |
| `baseline`    | adapter `baseline`에서만. `constant`(정한 답) 또는 `nearest`(가장 비슷한 사례 복사, `retrieval` 필요)                   |

`temperature` · `seed` · `ensemble`은 지원하지 않는다(값이 있으면 거절). 여러 variant를 한 run에 넣으면 `summary.md` · DevHub에 나란히 나온다:

```bash
V="--variant baseline-always-other --variant anthropic:<작은> --variant anthropic:<큰> --variant facts-prompt@anthropic:<큰> --variant cascade@anthropic:<작은>,<큰>"
pnpm eval plan --dataset <내 dataset> $V                              # 호출 수 확인, 호출 0
ANTHROPIC_API_KEY=... pnpm eval run --dataset <내 dataset> $V --allow-api --max-api-calls 400 --run-id models
pnpm eval compare --baseline models:<큰 모델 id> --candidate models:facts-prompt-<큰 모델 id>
```

## live 실행과 안전장치

실제 provider(유료 API · 로컬 Ollama 포함) 호출은 `run` · `retry`뿐이고, `--allow-api`와 `--max-api-calls N`이 둘 다 있어야 한다.

- **예산** — `--max-api-calls`는 실제 HTTP 왕복(SDK 재시도 포함)의 총 상한. 기대 호출은 `지원 variant × case × trials`, Claude SDK 재시도로 최악 3배. 바닥나면 남은 case는 `not-run`, run은 `partial`
- **정답 격리** — adapter는 사진(또는 원문)만 받는다. 정답 · 주석 · case id는 요청에 실리지 않는다
- **secret** — key는 환경변수에서만 읽고 산출물 · 출력에 없다. 응답에 되풀이돼도 `[redacted]`
- **held-out** — `--allow-held-out` 없이는 열리지 않는다
- **retry** — `pnpm eval retry --run <run> --allow-api --max-api-calls N`. 끝난 결과는 호출 없이 옮기고(지금 채점기로 다시 채점) 실패 · 시간 초과 · 미실행만 다시 부른다. 원래 run은 그대로, 새 run은 `<run>-retry`. 조건이 달라졌으면 거절한다

## replay 기록 형식

`predictions/*.jsonl` 한 줄에 `variantId` · `caseId`(· `trial`, 기본 1 · `status`, 기본 `completed`)와

- 분류 — `prediction` `{category, facts, suggestedAction, confidence}`
- 텍스트 추출 — `text` · 선택 `fields`; 번역 — `text` · 선택 `targetLanguage`
- 실패 — `status`(`failed` · `timed-out`) + `failure` `{class, kind, message}`
- 분류의 선택 기록 — `retrieval` `{examples: [{caseId, category, similarity}]}` · `cascade` `{firstModel, firstConfidence, escalated}`

형식의 주인은 Go(`apps/api/internal/evaluation/replay.go`의 `ReplayRecord`)다. 모르는 필드(`passed` · `accuracy`처럼 채점 결과로 보이는 것 포함)는 파일과 줄을 말하며 거절한다 — 점수는 기록에 실릴 수 없다. `lab/`의 `snapdone_eval_lab.predictions`가 이 형식으로 쓰고, `predictions/lab-example.jsonl`이 그 파일이며 `pnpm eval:check`가 replay한다. 기록이 없는 case는 `not-run`(run은 `partial`), 고른 것과 맞지 않는 기록은 경고와 함께 무시된다.

## 산출물 — `results/<runId>/`

| 파일            | 성격 | 내용                                                                                                           |
| --------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `metadata.json` | 정본 | 무엇을 어떤 조건으로 돌렸는지 — dataset · selection hash · variant(`ref` 포함) · 채점 규칙 · 채점기 hash · git |
| `cases.jsonl`   | 정본 | invocation마다 한 줄 — 실행 · 판정 · 예측 · 정답 · case 지표 · 요청한 모델과 답한 모델                         |
| `summary.json`  | 파생 | 과제별 요약. 종합 점수 없이 품질 · 신뢰성 · 지연 · 비용이 따로. `officialEligible`과 이유                      |
| `summary.md`    | 파생 | 사람이 읽는 표                                                                                                 |

- `pnpm eval report --run <runId>`가 정본 두 파일에서 `summary.*`를 같은 byte로 다시 쓴다
- 같은 `runId`는 거절한다. replay run은 공식 benchmark가 아니다(`mode: replay`)
- 값의 유무 — `measured`(0도 값) · `partial` · `unavailable` · `unsupported` · `not-measured` · `not-applicable`. 없는 값은 0이 아니고 분모에서 빼지도 않는다
- **v1 호환** — 선택 field 추가는 v1 안에서, 삭제 · 이름 · 뜻 변경은 `schemaVersion`을 올린다([규칙](../../docs/architecture/agent-evaluation.md#artifact-v1-호환-규칙))

## 비교와 gate — `pnpm eval compare`

```bash
pnpm eval compare --baseline <runId>:<variantId>[:<trial>] --candidate <runId>:<variantId> [--gate gates/<name>.json] [--comparison-id id]
```

- `results/comparisons/<comparisonId>/comparison.{json,md}`에 쓴다. run 산출물은 건드리지 않는다
- **비교 가능** — dataset(이름 · version) · split · selection hash · 고른 case · task · mode · 채점 규칙 · label 목록 · 채점기가 같고 둘 다 완료된 run. 지시 · commit · 모델은 실험 변수다
- 결론은 **서술**이고 통계적 유의성을 주장하지 않는다(짝 30개 미만이면 경고)
- **gate** — `gates/<name>.json`의 `{"version", "maxNewCriticalErrors", "maxPassRateDropPp", "maxSchemaInvalidIncrease"}` 중 적은 규칙만 판정. 실패하면 종료 코드 4. partial · 채점기 차이면 적용하지 않는다. 후보 임계값은 `03_gate_lab.ipynb`가 Go가 채점한 `cases.jsonl`을 읽어 고르고, 파일은 사람이 쓴다
- `--allow-partial` · `--allow-evaluator-drift`는 서술 비교만 넓힌다(gate 없음)

## DevHub

`pnpm dev:devhub` → `http://localhost:3100`. `tools/evals/results`를 요청마다 읽으므로 새 run이 바로 보인다. 모델을 부르는 실행은 하지 않는다.

| 경로                            | 보이는 것                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/evals`                        | 과제별 요약 · 정식 run 명령 만들기 · 답 출처별 run · 저장된 짝 비교                                                                     |
| `/evals/tasks/<task>`           | run 목록 · 답 출처 · dataset 필터 · 저장된 비교 · 추세                                                                                  |
| `/evals/runs/<runId>`           | variant 표(Go 값 나란히 · 짝 비교 명령) · case × variant(갈림 · 모두 실패) · variant 자세히(지표 묶음 · 틀린 곳 · 지연 · 사용량 · case) |
| `/evals/compare/<comparisonId>` | 무엇을 비교했나 · gate · 축별 차이 · category별 F1 · case 변화(새로 틀림 · 고쳐짐 · 실행 오류 · critical)                               |

## 과제 더하기

zero-touch가 아니라 정해진 목록을 고친다. 빠뜨리면 컴파일 · `TestEveryTaskHasScoring` · 산출물 계약 테스트가 잡는다. 전체는 [새 task 추가](../../docs/architecture/agent-evaluation.md#새-task-추가).

1. `evaluation/contract.go` — `Task` 상수 · 입력 · 정답 모양과 검증
2. `evaluation/result.go` — 예측 모양과 검증
3. `evaluation/<task>.go` — case 판정 · trial 요약 · 비교 축
4. `evaluation/task.go` — `taskScorings`에 항목 하나
5. `aggregate.go`(요약 branch) · `artifact.go`(`summary.md` 표) · `dataset.go`(사진 여부 · readiness)
6. live가 있으면 adapter와 `variant.go`의 `adapterTasks`, 없으면 `evaluation/replay.go`의 `ReplayRecord` 검증
7. 산출물 golden · DevHub `apps/devhub/src/lib/evaluations`의 decoder와 화면
8. `datasets/sample-<task>` 형식 예시 · `predictions/sample-<task>.jsonl` · replay 이름표 manifest. Python `lab/`은 분류 실험만 알므로 새 과제의 live 실험은 별도 작업

## 검증

```bash
pnpm eval:check                 # Go — cmd/eval · evalcli · evaluation/... 테스트 + sample 3개 validate. 모델 호출 없음
pnpm eval:lab:test              # Python — loader · 예측 writer · 실험(가짜 공급자) · gate 연구 · notebook 정책. Go CLI를 빌드해 replay까지
pnpm nx run devhub:test         # DevHub — 산출물 decoder · repository · /evals 화면(Go golden을 그대로 읽음)
```

산출물 golden(`apps/api/internal/evaluation/testdata/artifacts` · `comparisons`)은 Go가 만든 byte이고 Go · DevHub · Python 테스트가 함께 읽는다. 채점 · 산출물을 바꿨으면 `EVAL_UPDATE_GOLDEN=1 go -C apps/api test ./internal/evaluation`으로 다시 만들고 차이를 확인한다.

## 문제 해결

| 증상(실제 메시지)                                                                                                              | 원인과 해결                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval: repository root not found (no nx.json above the working directory); pass --root`                                        | 저장소 밖에서 실행했다. 저장소 안에서 `pnpm eval ...`을 쓰거나 `--root <저장소 경로>`                                                               |
| `eval: structural validation failed: ...`                                                                                      | dataset이 없거나 manifest · JSONL · 사진이 계약에 안 맞는다. 메시지의 줄 · case id를 고친다                                                         |
| `eval: dataset is not benchmark-ready`(`--require-ready`)                                                                      | 구조는 맞지만 benchmark가 아니다. `validate` 출력의 이유(tier · 자격 · 목표 수)를 채운다                                                            |
| plan의 preflight `variant ... is marked placeholder ...; it is not for live runs`                                              | replay 이름표 manifest다. live는 `anthropic:<model>`처럼 적거나 `local.example.json`을 복사해 채운다                                                |
| preflight `variant ...: environment variable ANTHROPIC_API_KEY is empty`                                                       | key 환경변수가 비었다                                                                                                                               |
| `eval: run calls a real provider; pass --allow-api and --max-api-calls N (or --dry-run)`                                       | live는 opt-in이다. 호출하려면 둘 다, 확인만 하려면 `--dry-run` 또는 `plan`                                                                          |
| `eval: run is partial (budget exhausted)`                                                                                      | 예산이 모자랐다. `plan`의 planned × 재시도 여유(최대 3배)로 `--max-api-calls`를 다시 잡는다                                                         |
| plan의 `"reason": "adapter processing does not support text-extraction (replay only)"`                                         | 그 과제에는 live adapter가 없다. `replay`를 쓴다                                                                                                    |
| `eval: <파일> line 1: unexpected EOF`(또는 `... unknown field "passed"` · `... carries text, not a classification prediction`) | 기록 줄이 JSON이 아니거나, 모르는 필드(채점 결과처럼 보이는 것 포함)가 있거나, 과제와 모양이 다르다. [replay 기록 형식](#replay-기록-형식)을 따른다 |
| `eval: N replay records match no selected variant/case/trial and are ignored: ...`                                             | 기록의 variantId · caseId · trial이 고른 것과 맞지 않는다(오타 · 다른 variant). run은 그 case가 not-run이라 partial이다                             |
| `eval: run is partial (some selected invocations did not run; see not-run in summary.md)`                                      | 기록이 없는 case가 있다. predictions에 줄을 더하거나 `--case` · `--limit`로 고른다                                                                  |
| `eval: runs are not comparable: selection hash differs: ...`                                                                   | 다른 case · dataset · 규칙으로 돌린 run이다. 같은 조건으로 다시 돌리거나, partial이면 `--allow-partial`로 서술만                                    |
| `eval: run <id> already exists in ...`                                                                                         | 같은 run id는 덮어쓰지 않는다. 다른 `--run-id`를 쓰거나 `results/<id>`를 지운다                                                                     |
| `... run schemaVersion 2 is not supported (want 1)`                                                                            | 다른 build가 쓴 산출물이다. 그 build로 읽거나 이 build로 다시 돌린다                                                                                |
| `summary.json ... does not match its raw artifacts; regenerate it before comparing`                                            | 채점기가 바뀌었다. `pnpm eval report --run <id>`로 양쪽을 다시 만든 뒤 비교(필요하면 `--allow-evaluator-drift`)                                     |
| `eval: evaluation: retrieval needs eligible dev cases to draw examples from`                                                   | 예시를 고를 dev case가 없다. dataset의 dev에 채점 자격이 있는 사진 분류 case가 있어야 한다                                                          |
| notebook `PermissionError: held-out is closed for research`                                                                    | 마지막 확인이 아니면 열지 않는다. 정말 필요하면 `allow_held_out=True`. 정식 경계는 Go의 `--allow-held-out`                                          |
| DevHub `/evals`에 run이 없다                                                                                                   | `--out`을 다른 곳으로 줬거나 다른 저장소 root다. DevHub는 `<root>/tools/evals/results`만 읽는다                                                     |
| DevHub의 run이 "읽을 수 없음"                                                                                                  | 화면에 kind(산출물 오류 · 모르는 schema 버전 · 미완료)와 파일 경로가 있다. `pnpm eval report --run <id>`로 확인                                     |
