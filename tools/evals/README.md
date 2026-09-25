# evals

`apps/api/internal/evaluation`이 읽는 평가 dataset과 실행 산출물. 설계는 [agent-evaluation.md](../../docs/architecture/agent-evaluation.md).

## 구조

```
datasets/<name>/
  manifest.json        이름 · version · task · tier · split 파일과 case 수 · category당 목표
  dev.jsonl            지시를 고치며 반복해서 보는 몫
  validation.jsonl     고른 뒤 확인하는 몫 — 사람 검토만 채점
  held-out.jsonl       마지막에만 보는 몫 — 사람 검토만 채점, AllowHeldOut 없이는 열리지 않음
  fixtures/            사진. sources/에는 합성 사진의 원본 텍스트와 렌더 스크립트
  drafts/              아직 사진이나 검토가 없는 후보(candidates.md)와 정답 지침(rubric.md)
results/<runId>/       실행 산출물(generated). git에 넣지 않는다 — metadata.json · cases.jsonl이 정본, summary.json · summary.md는 파생물
```

case 한 줄의 모양과 필수 값은 설계 문서의 wire 계약 절에 있다. loader는 모르는 필드 · 뒤따르는 값 · 잘못된 UTF-8 · 빈 줄 · hash 불일치 · 형식 · 확장자 불일치 · 크기 초과 · root 밖 경로(symlink 포함)를 거절하고, split 사이의 같은 사진 · 같은 `sourceGroupId`를 막는다. 비슷한 사진(near-duplicate)은 잡지 못하므로 같은 원본은 사람이 `sourceGroupId`로 묶는다.

## task

| task                   | 정답                                                     | 예측                | live adapter                                           |
| ---------------------- | -------------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| `image-classification` | category · intent · acceptableActions · forbiddenActions | production `Result` | 있음                                                   |
| `text-extraction`      | text · readingOrder · 선택 tokenizer · 선택 fields       | text · 선택 fields  | **없음** — replay만. production `facts`는 OCR이 아니다 |
| `translation`          | text · sourceLanguage · targetLanguage                   | text                | 없음, evaluator도 없음                                 |

text-extraction metric은 공백 정규화(`text-ws-v1`) 뒤 rune 단위 CER · 단어 WER(`tokenizer: whitespace`인 case만) · field accuracy이고, Unicode 정규화는 하지 않는다(NFC · NFD는 다른 문자열). translation은 승인된 reference와의 EM(같은 문자열인지의 진단값) · critical span 보존 · 선언 언어 metadata 일치만 계산하고 기본 policy는 case를 채점하지 않는다(`unscored`). `--policy translation-exact-v1`이면 strict pass · fail. BLEU · chrF · 의미 유사도 · judge는 unsupported다.

## tier

| tier               | 뜻                                                       | 점수의 의미                      |
| ------------------ | -------------------------------------------------------- | -------------------------------- |
| `software-fixture` | loader 테스트용. `apps/api/internal/evaluation/testdata` | 없음                             |
| `synthetic-pilot`  | 합성 사진으로 harness를 돌려 보는 단계                   | 모델 비교의 참고, benchmark 아님 |
| `golden-benchmark` | 사람이 검토한 정답. 모든 split이 채점 가능               | 모델 비교의 근거                 |

benchmark-ready 판정은 loader의 `Readiness`가 낸다 — tier가 `golden-benchmark`이고 모든 case가 채점 가능하며 split마다 category당 목표 수를 채웠을 때.

## 채점 자격

case가 점수에 들어가려면 전부 필요하다.

- `annotation.review: reviewed` · `provenance.privacyReview: reviewed`
- `annotation.ambiguity`가 `high`가 아님
- dev가 아닌 split은 `annotation.method: human`

값이 있다고 검토가 있었던 것은 아니다. **검토 사실은 값을 적은 사람의 책임**이고 코드는 값만 본다.

## 정답 격리

- prompt · few-shot · 학습 · RAG corpus는 `datasets/*/validation.jsonl` · `held-out.jsonl` · 그 `fixtures/`를 읽지 않는다. 공유해도 되는 것은 `drafts/rubric.md`의 기준뿐이다
- 개발 중 held-out 파일의 내용을 출력 · 로그 · 대화에 붙이지 않는다. loader 오류도 case id와 이유만 담는다
- exporter · fine-tuning 경로는 없다. 생기면 위 파일을 읽지 않는 것을 검사로 강제한다

## dataset version과 hash

- `manifest.version`은 사람이 올리는 정수 — case를 더하거나 정답을 고칠 때
- selection hash는 loader가 계산한다 — 고른 split의 case를 id 순으로 정렬해 `id · JSONL 원문 · 사진 byte`를 sha256. 파일 순서와 무관하고 어느 한 byte가 바뀌면 달라진다
- 같은 hash끼리만 결과를 비교한다

## pilot-v1

`synthetic-pilot`. license CC0-1.0, 지침 `drafts/rubric.md`.

| split      | cases | 채점 가능 | 출처                                                                                                |
| ---------- | ----- | --------- | --------------------------------------------------------------------------------------------------- |
| dev        | 7     | 7         | `fixtures/sources/*.txt`를 `render.swift`로 그린 합성 텍스트. AI 세션이 눈으로 확인(`agent-visual`) |
| validation | 0     | 0         | 사람 검토 사진 없음                                                                                 |
| held-out   | 0     | 0         | 사람 검토 사진 없음                                                                                 |

benchmark-ready 아님. 28건의 후보는 `drafts/candidates.md`. 합성 사진을 다시 만들려면 macOS에서 `swiftc -O -o render fixtures/sources/render.swift` 뒤 `./render <txt> <png> 720 960 32`.

## 값을 읽는 법 — 헷갈리기 쉬운 네 쌍

| 다른 두 값                                         | 뜻                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rawShape`(schema 판정)와 `parser`(정규화 뒤 성공) | 모델 원문이 descriptor schema에 맞는지와 production `parseResult`가 받았는지는 다르다. `facts: null`은 schema 틀림 + parser 통과, 빈 fact 문자열은 schema 맞음 + parser 거절. 둘 다 그대로 남기고 accuracy는 parser 기준 |
| action 추천과 실제 실행                            | 채점하는 것은 `suggestedAction`이 acceptableActions에 있는지뿐. 캘린더 등록 같은 실제 실행은 production에 없고 "routing 완료율"은 측정하지 않는다                                                                        |
| 번역 EM과 의미 품질                                | reference와 같은 문자열인지의 진단값이다. 적절한 의역은 EM에 실패하지만 오답이 아니며 기본 policy는 `unscored`. semantic · BLEU · chrF · judge는 unsupported                                                             |
| measured 0과 unknown                               | `{"availability":"measured","value":0}`은 잰 값이 0인 것(토큰 0 · 정확도 0). `unavailable` · `unsupported` · `not-measured` · `not-applicable`은 값이 없고 이유가 있다. 0으로 바꾸거나 분모에서 빼지 않는다              |

## 공개 전 검수 · held-out · training denylist

- **공개 전** — 모든 fixture의 `provenance.license`와 `privacyReview: reviewed`를 사람이 다시 본다. 합성 사진이라도 실제 상호 · 이름이 들어가지 않았는지 확인한다
- **held-out** — `--allow-held-out`이 있어야 열리고, 개발 중 내용을 출력 · 대화에 붙이지 않는다. 마지막 확인에만 쓰고 결과를 보고 dataset을 고치지 않는다
- **training denylist** — `datasets/*/validation.jsonl` · `held-out.jsonl`과 그 `fixtures/`, `predictions/`는 prompt · few-shot · fine-tuning · RAG corpus · exporter 어디에도 넣지 않는다. exporter가 생기면 이 경로를 읽지 않는 검사를 붙인다
- **승격** — draft를 golden으로 자동 승격하지 않는다. 사람 검토(`method: human`)가 있어야 validation · held-out에 들어간다

## 호출 예산

`--max-api-calls`는 실제 HTTP 왕복(SDK 재시도 포함)의 총 상한이다. 기대 호출 수는 `지원 variant 수 × 고른 case 수 × trials`이고, Claude SDK는 429 · 5xx를 최대 2회 재시도하므로 최악 3배다. 예산이 바닥나면 남은 case는 `not-run`으로 남고 run은 `partial`이다.

```bash
# 7 case · variant 1 · trial 1 → 기대 7회, 재시도 여유를 두면 21
pnpm eval plan --dataset pilot-v1 --variant <manifest>            # planned 수 확인, 호출 0
pnpm eval run  --dataset pilot-v1 --variant <manifest> --case event-01 --limit 1 --allow-api --max-api-calls 3
```

## 실행 산출물 — `results/<runId>/`

`.gitignore`가 `/tools/evals/results/`만 무시한다. reviewed dataset · variant manifest · `apps/api/internal/evaluation/testdata`는 추적 대상이고, generated 결과를 git benchmark로 착각하지 않는다.

| 파일            | 역할                                                                                 |
| --------------- | ------------------------------------------------------------------------------------ |
| `metadata.json` | 정본. `status`가 `running` → `completed` · `partial`로 바뀌는 마지막 쓰기            |
| `cases.jsonl`   | 정본. invocation마다 한 줄(not-run 포함). 쓰다 멈추면 마지막 줄이 잘려 요약이 거절함 |
| `summary.json`  | 파생물. raw 두 파일에서 다시 만들면 같은 byte. 종합 점수 없음 — 네 축이 따로         |
| `summary.md`    | 파생물. 사람이 읽는 표                                                               |

- 쓰는 순서 — metadata(running) → case 한 줄씩 → flush · close → summary(임시 파일 뒤 rename) → metadata(종료). 어느 단계의 실패도 성공이 아님
- 같은 `runId`가 있으면 거절. dataset 디렉터리를 결과 root로 쓰지 못함
- replay 결과의 latency는 `not-measured`, cost는 가격표가 없어 `unavailable`. 최신 가격을 코드에 넣지 않음
- 모델 원문 텍스트는 `privacyReview: reviewed`인 case에서만 남김. API key · 헤더 · 본문 · base64는 어느 파일에도 없음

### 비교 — `results/comparisons/<comparisonId>/`

두 run의 raw에서 요약을 다시 만들어 짝 비교한 `comparison.json` · `comparison.md`. 같은 dataset selection · split · policy · label 목록 · 채점기 · mode에 둘 다 완료된 run만 비교하고, 아니면 이유만 적고 delta를 내지 않는다. 지시 · commit · 모델 차이는 실험 변수다. 결론은 서술이고 통계적 유의성을 주장하지 않는다. gate는 명시된 규칙이 있을 때만 판정한다.

## CLI — `pnpm eval`

`apps/api/cmd/eval`. Nx는 `--` 뒤의 인자를 그대로 붙인다(`pnpm eval list` → `go run ./cmd/eval list`, 실제로 확인). 상대 경로는 저장소 root(`nx.json`이 있는 곳) 기준이고 dataset · variant는 이름만 써도 된다.

```bash
pnpm eval list                                  # dataset · variant와 readiness. 모델 호출 없음
pnpm eval validate --dataset pilot-v1           # 구조 검증 + readiness. --require-ready면 준비 안 됐을 때 3
pnpm eval plan --dataset pilot-v1 --variant local.example
pnpm eval replay --dataset pilot-v1 --variant replay-example   --predictions tools/evals/predictions/pilot-v1-replay-pair.jsonl --run-id pair-base
pnpm eval replay --dataset pilot-v1 --variant replay-candidate --predictions tools/evals/predictions/pilot-v1-replay-pair.jsonl --run-id pair-cand
pnpm eval report --run pair-cand
pnpm eval compare --baseline pair-base:replay-example --candidate pair-cand:replay-candidate [--gate gate.json] [--comparison-id id]
```

위 replay 쌍은 손으로 쓴 기록이다. candidate는 category 하나 · action 하나를 일부러 바꾸고 timeout · failed를 하나씩 둬서 comparison에 newly failed · newly errored가 어떻게 보이는지 확인하는 용도이며 모델 출력이 아니다. 선택 flag는 `--split` · `--case`(반복) · `--limit` · `--trials` · `--variant`(반복) · `--allow-drafts` · `--allow-held-out` · `--policy` · `--run-id`다.

실제 provider 호출(유료 · 로컬 Ollama 포함)은 `run`뿐이고 `--allow-api --max-api-calls N`이 둘 다 있어야 한다. 예산은 SDK 재시도까지 센다. `"placeholder": true`인 manifest(저장소의 예시 · replay 전용 파일 전부)와 빈 key 환경변수는 preflight에서 거절된다. 실제로 돌리려면 placeholder 표시가 없는 manifest를 새로 만든다. 아래는 문서용 예시이고 이 저장소 작업에서 실행하지 않았다.

```bash
PROCESSING_API_KEY=... pnpm eval run --dataset pilot-v1 --variant <manifest> --allow-api --max-api-calls 30
```

종료 코드: 0 정상 · 2 flag/usage 오류 · 3 불완전(partial run · 검증 실패 · 비교 불가) · 4 regression gate 실패. `go run`은 자식의 코드를 그대로 돌려주지 않을 수 있으므로 정확한 코드가 필요한 gate는 `go -C apps/api build -o <path> ./cmd/eval`로 빌드한 바이너리를 쓴다(테스트가 바이너리 코드를 확인).

`pnpm eval:check`는 offline Go 테스트(`cmd/eval` · `internal/evaluation`)와 pilot dataset 검증 · readiness 출력이다. draft가 있는 것은 구조 검사 실패가 아니며 benchmark-ready 여부는 따로 출력된다. 캐시하지 않고 모델을 부르지 않는다.

`replay`는 `predictions/*.jsonl`의 기록만 읽는다 — 한 줄에 `variantId` · `caseId`와 분류면 `prediction`, text-extraction이면 `text` · 선택 `fields`, translation이면 `text` · 선택 `targetLanguage`(또는 `status` + `failure`). `predictions/pilot-v1-replay-example.jsonl`은 손으로 쓴 예시이고 모델 출력이 아니다. dataset의 정답을 예측으로 베끼지 않는다.
