import type { Scenario } from '../../domain/model';

import { step } from './step';

const EVAL = 'apps/api/internal/evaluation';
const CLI = 'apps/api/cmd/eval/main.go';

/**
 * 개발자 흐름. 사용자 화면이 아니라 터미널에서 도는 평가 harness다. 실제 provider 호출은 이 저장소 작업에서
 * 한 번도 실행하지 않았고, 모든 검증은 가짜 Transport와 replay로만 했다.
 */
export const evaluateModelVariants: Scenario = {
  id: 'evaluate-model-variants',
  title: '모델 · 지시 변경을 같은 dataset으로 비교하기',
  goal: 'provider · model · prompt가 바뀌어도 같은 dataset과 같은 채점기로 사진 분류 결과를 비교. 결과는 산출물로 남고 두 run을 짝 비교',
  track: 'developer',
  status: 'partial',
  docs: [
    { document: 'agent-evaluation', heading: '구현 현황' },
    { document: 'agent-evaluation', heading: '실행과 검증' },
  ],
  gaps: [
    {
      kind: 'external-unverified',
      note: '실제 provider(Claude · OpenAI 호환 · 로컬 Ollama)는 한 번도 부르지 않음. live 경로는 가짜 HTTP 응답으로만 검증. 모델 성능 수치 없음',
    },
    {
      kind: 'runtime-unverified',
      note: 'pilot-v1은 합성 텍스트 렌더 7건(dev)뿐이고 validation · held-out은 사람 검토가 없어 비어 있음. benchmark-ready 아님',
      tests: ['go-eval-dataset-pilot'],
    },
  ],
  steps: [
    step({
      id: 'run-cli',
      intent: '터미널에서 list · validate · plan · run · replay · report · compare 중 하나를 고름',
      behavior:
        'nx run api:eval이 go run ./cmd/eval로 인자를 그대로 넘김. 저장소 root를 cwd에서 찾고 상대 경로를 root 기준으로 풀며, run은 --allow-api와 --max-api-calls가 없으면 usage 오류(2)로 거절. 종료 코드는 0 · 2 · 3 · 4',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: CLI, symbol: 'run' },
        { path: CLI, symbol: 'findRoot' },
        { path: CLI, symbol: 'cmdRun' },
      ],
      tests: ['go-eval-cli-usage', 'go-eval-cli-exit-codes', 'go-eval-cli-replay-round-trip'],
      docs: [{ document: 'agent-evaluation', heading: '실행과 검증' }],
      next: ['validate-dataset'],
    }),
    step({
      id: 'validate-dataset',
      intent: 'dataset을 읽고 채점에 쓸 수 있는지 봄',
      behavior:
        'manifest와 split JSONL을 엄격하게 읽고 사진을 root 안에서만 열어 hash · 형식 · 크기를 대조. split 사이의 같은 사진 · 같은 원본을 막고, 검토 · 개인정보 · 모호성 값으로 채점 자격과 benchmark readiness를 냄. 빈 split은 성공이 아님',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/dataset.go`, symbol: 'LoadDataset' },
        { path: `${EVAL}/dataset.go`, symbol: 'Dataset.Select' },
        { path: `${EVAL}/contract.go`, symbol: 'Case.Validate' },
        { path: `${EVAL}/decode.go`, symbol: 'decodeStrict' },
      ],
      tests: ['go-eval-dataset-pilot', 'go-eval-dataset-rejects'],
      docs: [{ document: 'agent-evaluation', heading: '데이터와 산출물' }],
      next: ['plan-variants'],
    }),
    step({
      id: 'plan-variants',
      intent: '비교할 variant manifest를 고르고 무엇이 돌지 확정',
      behavior:
        'manifest의 expectedContractHash가 production 지시 · schema hash와 다르면 거절. 지원하지 않는 설정(temperature · seed · promptPath · rag · ensemble)도 거절. case를 id 순으로 고르고 selection hash를 내며, placeholder 모델 · 빈 key · 예산 없음은 preflight로 남겨 adapter를 만들지 않음',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/variant.go`, symbol: 'LoadVariants' },
        { path: `${EVAL}/runner.go`, symbol: 'NewPlan' },
        { path: `${EVAL}/runner.go`, symbol: 'CollectSource' },
      ],
      tests: ['go-eval-plan-reproducible', 'go-eval-preflight-no-calls', 'go-eval-variant-rejects'],
      docs: [{ document: 'agent-evaluation', heading: '실행과 검증' }],
      next: ['invoke-classifier', 'replay-recorded'],
    }),
    step({
      id: 'invoke-classifier',
      intent: '(live) production 분류기로 case를 하나씩 보냄',
      behavior:
        'processing.NewClaudeClassifier · NewOpenAIClassifier를 그대로 부르고 HTTP Transport만 관찰용으로 감쌈. 예산은 SDK 재시도까지 실제 왕복마다 줄고, 바닥나거나 취소되면 남은 case는 not-run. 응답에서 모델 텍스트 · effective model · stop reason · usage만 읽고 설정된 key가 되풀이되면 지움',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/runner.go`, symbol: 'Run' },
        { path: `${EVAL}/adapter_processing.go`, symbol: 'ProcessingAdapter.Invoke' },
        { path: `${EVAL}/transport.go`, symbol: 'observer.RoundTrip' },
        { path: `${EVAL}/shape.go`, symbol: 'judgeRaw' },
        { path: 'apps/api/internal/processing/contract.go', symbol: 'DescribeContract' },
      ],
      tests: [
        'go-eval-adapter-normal',
        'go-eval-adapter-redacts',
        'go-eval-budget-counts-retries',
        'go-eval-observer-budget-gate',
      ],
      docs: [{ document: 'agent-evaluation', heading: '평가 seam' }],
      gaps: [
        {
          kind: 'external-unverified',
          note: '실제 provider 응답으로는 돌려 본 적 없음. 가짜 Transport의 Claude · OpenAI 호환 응답으로만 확인',
        },
      ],
      next: ['score-cases'],
    }),
    step({
      id: 'replay-recorded',
      intent: '(offline) 기록된 예측을 다시 채점',
      behavior:
        'predictions JSONL의 기록만 읽어 같은 채점 경로를 돔. provider 호출 0회, latency는 not-measured. text-extraction · translation처럼 production adapter가 없는 task도 replay로는 돔',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: CLI, symbol: 'cmdReplay' },
        { path: CLI, symbol: 'loadReplayFixture' },
      ],
      tests: ['go-eval-cli-replay-round-trip', 'go-eval-replay-golden'],
      docs: [{ document: 'agent-evaluation', heading: '실행과 검증' }],
      next: ['score-cases'],
    }),
    step({
      id: 'score-cases',
      intent: '(자동) 결과를 채점',
      behavior:
        '분류는 category · accepted action · forbidden action을 한 호출에서 채점. 실패 · timeout · 미실행은 정답 0으로 분모에 남고, 값이 없는 것은 0이 아니라 unavailable. 종합 점수 없이 quality · reliability · latency · cost를 따로 집계',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/classification.go`, symbol: 'EvaluateClassification' },
        { path: `${EVAL}/aggregate.go`, symbol: 'SummarizeResults' },
        { path: `${EVAL}/measure.go`, symbol: 'Measure' },
      ],
      tests: [
        'go-eval-accuracy-vs-f1',
        'go-eval-risk-unobserved',
        'go-eval-summary-hand-calculated',
        'go-eval-measure-zero-vs-missing',
      ],
      docs: [{ document: 'agent-evaluation', heading: '측정 축' }],
      next: ['write-artifacts'],
    }),
    step({
      id: 'text-tasks',
      intent: '(offline) OCR · 번역 정답과 offline 채점',
      behavior:
        'text-extraction은 공백 정규화 뒤 rune CER · 단어 WER · field 정확도, translation은 승인 reference EM · critical span 보존만 냄. 의미 유사도 · BLEU · judge는 unsupported. production adapter가 없어 live에서는 호출 0회로 skipped',
      runtime: 'go-cli',
      owner: 'api',
      status: 'partial',
      source: [
        { path: `${EVAL}/text.go`, symbol: 'EvaluateText' },
        { path: `${EVAL}/translation.go`, symbol: 'EvaluateTranslation' },
      ],
      tests: [
        'go-eval-text-live-unsupported',
        'go-eval-translation-live-unsupported',
        'go-eval-text-whitespace-normalization',
      ],
      docs: [{ document: 'agent-evaluation', heading: '데이터와 산출물' }],
      gaps: [
        {
          kind: 'code-not-found',
          note: 'production에 텍스트 추출 · 번역 adapter 없음. 계약과 replay 채점만 있고 live 실행은 unsupported',
          tests: ['go-eval-text-live-unsupported', 'go-eval-translation-live-unsupported'],
        },
      ],
      next: ['write-artifacts'],
    }),
    step({
      id: 'write-artifacts',
      intent: '(자동) 결과를 산출물로 남김',
      behavior:
        'tools/evals/results/<runId>에 metadata.json · cases.jsonl(정본)과 summary.json · summary.md(파생물)를 씀. metadata(running) → case 줄 → summary → 종료 metadata 순이고 쓰기 실패는 성공이 아님. 같은 runId는 거절, 결과는 git이 무시',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/artifact.go`, symbol: 'RunWriter.Finish' },
        { path: `${EVAL}/artifact.go`, symbol: 'RegenerateSummary' },
        { path: `${EVAL}/result.go`, symbol: 'CaseResult' },
        { path: `${EVAL}/run.go`, symbol: 'RunMetadata' },
      ],
      tests: [
        'go-eval-artifacts-regenerable',
        'go-eval-replay-golden',
        'go-eval-run-metadata-rejects',
      ],
      docs: [{ document: 'agent-evaluation', heading: '데이터와 산출물' }],
      next: ['compare-runs'],
    }),
    step({
      id: 'compare-runs',
      intent: 'baseline과 candidate run을 짝 비교',
      behavior:
        '같은 dataset selection · split · policy · label 목록 · 채점기 · mode에 둘 다 완료된 run만 비교하고 아니면 이유만 적음. metric별 delta와 case별 newly failed · fixed · newly errored를 내며, 결론은 서술이고 gate는 명시된 규칙이 있을 때만 판정',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/compare.go`, symbol: 'Compare' },
        { path: `${EVAL}/compare.go`, symbol: 'WriteComparison' },
      ],
      tests: ['go-eval-compare-variants', 'go-eval-compare-mismatch'],
      docs: [{ document: 'agent-evaluation', heading: '데이터와 산출물' }],
      next: [],
    }),
  ],
};
