import type { Scenario } from '../../domain/model';

import { step } from './step';

const EVAL = 'apps/api/internal/evaluation';
const CLI = 'apps/api/internal/evalcli';

/**
 * 개발자 흐름. 사용자 화면이 아니라 터미널에서 도는 평가 harness다. 실제 provider 호출은 이 저장소 작업에서
 * 한 번도 실행하지 않았고, 모든 검증은 가짜 Transport와 replay로만 했다.
 */
export const evaluateModelVariants: Scenario = {
  id: 'evaluate-model-variants',
  title: '모델 · 지시 변경을 같은 dataset으로 비교하기',
  goal: 'provider · model · 지시 · 비슷한 사례 예시 · 계단식이 바뀌어도 같은 dataset과 같은 채점기로 결과를 비교. 모델 없는 기준선과 나란히 두고, category · 행동뿐 아니라 추출값 · 행동 완료 가능률 · 자동 실행 안전성까지 잼. 텍스트 추출 · 번역은 replay로 채점하고, 결과는 버전이 붙은 파일 산출물로 남아 두 run을 짝 비교',
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
      note: 'tools/evals/datasets에는 과제마다 형식 예시 1건뿐이라 평가 dataset은 사용자가 채움. 여러 case가 필요한 테스트는 testdata의 pilot-v1(합성 렌더 21건, dev, category당 3건)을 쓰고 validation · held-out은 사람 검토가 없어 비어 있음. benchmark-ready 아님',
      tests: ['go-eval-dataset-pilot'],
    },
  ],
  steps: [
    step({
      id: 'run-cli',
      intent:
        '터미널에서 list · validate · plan · run · replay · report · compare · retrieve 중 하나를 고름',
      behavior:
        'nx run api:eval이 go run ./cmd/eval로 인자를 그대로 넘김. 저장소 root를 cwd에서 찾고 상대 경로를 root 기준으로 풀며, 모델을 부르는 variant가 있는 run은 --allow-api와 --max-api-calls가 없으면 usage 오류(2)로 거절. 기준선만 도는 run은 호출이 없어 opt-in이 필요 없음. 종료 코드는 0 · 2 · 3 · 4',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${CLI}/app.go`, symbol: 'Run' },
        { path: `${CLI}/paths.go`, symbol: 'findRoot' },
        { path: `${CLI}/execute.go`, symbol: 'cmdRun' },
      ],
      tests: [
        'go-eval-cli-usage',
        'go-eval-cli-exit-codes',
        'go-eval-cli-replay-round-trip',
        'go-eval-cli-baseline-run',
      ],
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
      tests: ['go-eval-dataset-pilot', 'go-eval-dataset-rejects', 'go-eval-pilot-facts-in-source'],
      docs: [{ document: 'agent-evaluation', heading: '데이터와 산출물' }],
      next: ['plan-variants'],
    }),
    step({
      id: 'plan-variants',
      intent: '비교할 variant manifest를 고르고 무엇이 돌지 확정',
      behavior:
        'manifest의 expectedContractHash가 production 지시 · schema hash와 다르면 거절. 실험 설정은 지시 파일(promptPath) · 비슷한 사례 예시(retrieval) · 계단식(cascade) · 기준선(baseline)만 받고 temperature · seed · ensemble은 거절. 모델을 쓰는 실험은 모델 없는 설정 파일(experiments)에 두고 실행할 때 `<설정>@공급자:모델`로 모델을 얹음. 지시 파일은 설정 파일 옆에서만 읽고 산출물에는 hash만 남김. case를 id 순으로 고르고 selection hash를 내며, placeholder 모델 · 빈 key · 예산 없음은 preflight로 남겨 adapter를 만들지 않음',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/variant.go`, symbol: 'LoadVariants' },
        { path: `${EVAL}/runner.go`, symbol: 'NewPlan' },
        { path: `${EVAL}/runner.go`, symbol: 'CollectSource' },
      ],
      tests: [
        'go-eval-plan-reproducible',
        'go-eval-preflight-no-calls',
        'go-eval-variant-rejects',
        'go-eval-baseline-variant',
        'go-eval-prompt-path',
      ],
      docs: [{ document: 'agent-evaluation', heading: '실행과 검증' }],
      next: ['invoke-classifier', 'run-baseline', 'replay-recorded'],
    }),
    step({
      id: 'run-baseline',
      intent: '(live, 호출 없음) 모델 없는 기준선을 같은 dataset에 돌림',
      behavior:
        'baseline adapter는 늘 같은 답(constant)이나 가장 비슷한 dev 사례의 정답(nearest)을 냄. provider · key · 예산이 없고 호출은 0회. 모델 variant와 같은 채점 · 산출물 경로를 지나 모델이 규칙보다 나은지를 같은 표에서 봄',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/baseline.go`, symbol: 'baselineAdapter.Invoke' },
        { path: `${EVAL}/runner.go`, symbol: 'runner.adapterFor' },
      ],
      tests: ['go-eval-baseline-run', 'go-eval-cli-baseline-run'],
      docs: [{ document: 'agent-evaluation', heading: '실험 설정' }],
      next: ['score-cases'],
    }),
    step({
      id: 'invoke-classifier',
      intent: '(live) production 분류기로 case를 하나씩 보냄',
      behavior:
        'processing.NewClaudeClassifier · NewOpenAIClassifier를 그대로 부르고 HTTP Transport만 관찰용으로 감쌈. 실험 variant면 지시를 실험 파일로 바꾸거나(WithInstructions) 비슷한 dev 사례의 정답을 힌트로 붙이고, 계단식이면 첫 모델이 불확실할 때 큰 모델에 다시 물음. 예산은 SDK 재시도까지 실제 왕복마다 줄고, 바닥나거나 취소되면 남은 case는 not-run. 응답에서 모델 텍스트 · effective model · stop reason · usage만 읽고 설정된 key가 되풀이되면 지움',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/runner.go`, symbol: 'Run' },
        { path: `${EVAL}/processingadapter/adapter.go`, symbol: 'Factory' },
        { path: `${EVAL}/processingadapter/adapter.go`, symbol: 'Adapter.Invoke' },
        { path: `${EVAL}/processingadapter/transport.go`, symbol: 'observer.RoundTrip' },
        { path: `${EVAL}/processingadapter/shape.go`, symbol: 'judgeRaw' },
        { path: 'apps/api/internal/processing/contract.go', symbol: 'DescribeContract' },
        {
          path: 'apps/api/internal/processing/claude.go',
          symbol: 'ClaudeClassifier.WithInstructions',
        },
        { path: `${EVAL}/processingadapter/adapter.go`, symbol: 'Adapter.escalate' },
        { path: `${EVAL}/processingadapter/adapter.go`, symbol: 'withExamples' },
        { path: `${EVAL}/retrieval.go`, symbol: 'exampleBank.nearest' },
      ],
      tests: [
        'go-eval-cascade-escalation',
        'go-eval-prompt-examples-request',
        'go-processing-with-instructions',
        'go-eval-adapter-normal',
        'go-eval-adapter-redacts',
        'go-eval-budget-counts-retries',
        'go-eval-observer-budget-gate',
        'go-eval-adapter-factory',
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
        { path: `${CLI}/execute.go`, symbol: 'cmdReplay' },
        { path: `${EVAL}/replay.go`, symbol: 'LoadReplayFixture' },
      ],
      tests: [
        'go-eval-cli-replay-round-trip',
        'go-eval-replay-golden',
        'go-eval-public-replay-demos',
      ],
      docs: [{ document: 'agent-evaluation', heading: '실행과 검증' }],
      next: ['score-cases'],
    }),
    step({
      id: 'score-cases',
      intent: '(자동) 결과를 채점',
      behavior:
        '분류는 category · accepted action · forbidden action을 한 호출에서 채점. 추출값은 값만 보고(금액은 수, 날짜 · 시간은 숫자 묶음, 글자는 공백 무시 포함) 찾고, 고른 행동에 필요한 값을 모두 읽었으면 행동 완료 가능. high인데 틀린 비율과 확인 없이 실행할 답의 정확도 · 비율, 예시 적중률(MRR), 재질문 비율을 따로 냄. pass 규칙은 그대로. 실패 · timeout · 미실행은 정답 0으로 분모에 남고, 값이 없는 것은 0이 아니라 unavailable. 종합 점수 없이 quality · reliability · latency · cost를 따로 집계',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${EVAL}/task.go`, symbol: 'taskScorings' },
        { path: `${EVAL}/result.go`, symbol: 'NewCaseResult' },
        { path: `${EVAL}/classification.go`, symbol: 'EvaluateClassification' },
        { path: `${EVAL}/aggregate.go`, symbol: 'SummarizeResults' },
        { path: `${EVAL}/measure.go`, symbol: 'Measure' },
        { path: `${EVAL}/facts.go`, symbol: 'factMatches' },
        { path: `${EVAL}/classification.go`, symbol: 'CaseContribution.scoreFacts' },
      ],
      tests: [
        'go-eval-fact-matching',
        'go-eval-facts-readiness-calibration',
        'go-eval-facts-no-prediction',
        'go-eval-cascade-summary',
        'go-eval-accuracy-vs-f1',
        'go-eval-risk-unobserved',
        'go-eval-summary-hand-calculated',
        'go-eval-measure-zero-vs-missing',
        'go-eval-every-task-scored',
      ],
      docs: [{ document: 'agent-evaluation', heading: '측정 축' }],
      next: ['write-artifacts'],
    }),
    step({
      id: 'text-tasks',
      intent: '(offline) OCR · 번역 정답과 offline 채점',
      behavior:
        'text-extraction은 공백 정규화 뒤 rune CER · 단어 WER · field 정확도와 field id별 집계, translation은 승인 reference EM · critical span 보존만 냄. 의미 유사도 · BLEU · judge는 unsupported. production adapter가 없어 live에서는 호출 0회로 skipped. tools/evals의 sample-*(과제마다 1건)로 replay 예시가 됨',
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
        'go-eval-text-field-stats',
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
        'tools/evals/results/<runId>에 metadata.json · cases.jsonl(정본)과 summary.json · summary.md(파생물)를 씀. case 줄마다 요청한 모델과 공급자가 답에 적은 모델을 남기고, 요약은 답한 모델별 수와 요청과 다른 모델이 답한 수를 셈. metadata(running) → case 줄 → summary → 종료 metadata 순이고 쓰기 실패는 성공이 아님. 같은 runId는 거절, 결과는 git이 무시',
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
        'go-eval-artifact-v1-goldens',
        'go-eval-answered-model',
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
    step({
      id: 'probe-retrieval',
      intent: '(offline) 비슷한 사례 검색이 맞는 예시를 가져오는지만 잼',
      behavior:
        'eval retrieve가 split의 case마다 dev에서 k개를 찾고 정답 category가 같은 예시를 맞는 것으로 세어 첫 예시 적중 · k개 안 적중 · MRR을 냄. 예시는 dev에서만, 자신과 같은 원본 묶음은 빼고 고름. 사진을 줄인 밝기 격자의 cosine이라 글자 사진에서는 약하다는 것이 이 수치로 드러남',
      runtime: 'go-cli',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: `${CLI}/retrieve.go`, symbol: 'cmdRetrieve' },
        { path: `${EVAL}/retrieval.go`, symbol: 'ProbeRetrieval' },
        { path: `${EVAL}/retrieval.go`, symbol: 'imageVector' },
      ],
      tests: ['go-eval-retrieval-probe', 'go-eval-cli-retrieve'],
      docs: [{ document: 'agent-evaluation', heading: '실험 설정' }],
      next: [],
    }),
  ],
};
