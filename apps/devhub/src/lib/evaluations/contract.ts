/**
 * 평가 산출물 v1 계약. Go harness(`apps/api/internal/evaluation`)가 쓰는 파일의 도메인 모양이고,
 * 화면 개념(차트 · 색 · 컴포넌트)은 없다. 모양은 `decode.ts`가 `unknown`에서 검증해 만든다.
 *
 * run 디렉터리: `metadata.json` · `cases.jsonl`이 정본, `summary.json` · `summary.md`는 파생물.
 * 비교 디렉터리: `comparison.json`(저장된 read model) · `comparison.md`(사람이 읽는 표).
 */

export const ARTIFACT_SCHEMA_VERSION = 1;

export const TASKS = ['image-classification', 'text-extraction', 'translation'] as const;
export type Task = (typeof TASKS)[number];

export const AVAILABILITIES = [
  'measured',
  'partial',
  'unavailable',
  'unsupported',
  'not-measured',
  'not-applicable',
] as const;
export type Availability = (typeof AVAILABILITIES)[number];

/** 측정값 하나. measured 0은 값이고, 값이 없는 네 경우는 이유를 가진다. 0으로 바꾸지 않는다. */
export type Measure =
  | { availability: 'measured'; value: number }
  | { availability: 'partial'; value: number; reason: string }
  | { availability: 'not-applicable'; value: null; reason: string | null }
  | { availability: 'unavailable' | 'unsupported' | 'not-measured'; value: null; reason: string };

export type Mode = 'live' | 'replay';
export type RunStatus = 'running' | 'completed' | 'partial';
export type ExecutionStatus = 'completed' | 'failed' | 'timed-out' | 'skipped' | 'not-run';
export type QualityOutcome = 'passed' | 'failed' | 'not-evaluated' | 'unscored';
export type ErrorClass = 'timeout' | 'provider' | 'contract' | 'transport' | 'other';
export type Tier = 'software-fixture' | 'synthetic-pilot' | 'golden-benchmark';
export type Split = 'dev' | 'validation' | 'held-out';

export type Variant = {
  id: string;
  version: number;
  task: Task;
  adapter: string;
  provider: string;
  model: string;
  baseHost: string | null;
  contractHash: string;
  /** 실험 설정. 없으면 production 분류기 그대로다. */
  experiment: VariantExperiment;
};

export type VariantExperiment = {
  /** 실험 지시의 sha256. production 지시면 null. */
  promptHash: string | null;
  retrieval: { k: number } | null;
  cascade: { model: string; escalateOn: string[] } | null;
  baseline: { strategy: string; category: string | null; suggestedAction: string | null } | null;
};

export type DatasetSelection = {
  name: string;
  version: number;
  tier: Tier;
  split: Split;
  selectionHash: string;
  caseCount: number;
};

export type Policy = { version: string };

/** `metadata.json`. run이 무엇을 어떤 조건으로 돌렸는지 — 비교 가능성의 근거. */
export type RunMetadata = {
  schemaVersion: 1;
  runId: string;
  task: Task;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  abort: string | null;
  mode: Mode;
  source: { commit: string; dirty: boolean; sourceHash: string; evaluatorHash: string };
  dataset: DatasetSelection;
  selectedCaseIds: string[];
  variants: Variant[];
  policy: Policy;
  evaluatorPolicyHash: string;
  labelContractHash: string;
  trials: number;
  controls: { allowApi: boolean; callBudget: number; allowDrafts: boolean; allowHeldOut: boolean };
  /** 실패한 것만 다시 실행한 run이면 원래 run id. 끝난 결과는 거기서 호출 없이 옮겨 왔다. */
  retriedFrom: string | null;
};

export type SanitizedError = { class: ErrorClass; kind: string | null; message: string };

export type Execution = { status: ExecutionStatus; attempts: number; error: SanitizedError | null };

export type Quality = {
  outcome: QualityOutcome;
  checks: { name: string; outcome: 'passed' | 'failed' }[];
};

export type Judgement = { availability: Availability; valid: boolean };

/** 관찰한 글자 값. 없으면 availability와 reason이 이유를 말한다. */
export type ObservedText = {
  availability: Availability;
  value: string | null;
  reason: string | null;
};

/** 이 호출에서 요청한 모델과 공급자가 답에 적은 모델. 계단식으로 다시 물었으면 두 번째 모델이다. */
export type ModelTrace = { requested: string; answered: ObservedText };

/** 모델 원문 판정. 원문 텍스트는 개인정보 검토를 마친 case에서만 값이 있다. */
export type RawObservation = {
  text: ObservedText;
  syntax: Judgement;
  shape: Judgement;
  parser: Judgement;
};

export type Usage = { inputTokens: Measure; outputTokens: Measure };

export type ImageInput = { path: string; mediaType: string; sha256: string };

type CaseResultBase = {
  schemaVersion: 1;
  runId: string;
  invocationId: string;
  caseId: string;
  caseRevision: number;
  variantId: string;
  trial: number;
  mode: Mode;
  execution: Execution;
  quality: Quality;
  /** 모델을 부르지 않은 결과(미실행 · 미지원 · 모델 이름 없는 replay 기록)면 null. */
  model: ModelTrace | null;
  metrics: Record<string, Measure>;
  durationMs: Measure;
  usage: Usage;
  cost: Measure;
  raw: RawObservation | null;
};

export type ClassificationPrediction = {
  category: string;
  facts: { label: string; value: string }[];
  suggestedAction: string;
  confidence: string;
};

export type ClassificationExpected = {
  category: string;
  intent: 'resolved' | 'adjudicated' | 'unresolved';
  acceptableActions: string[];
  forbiddenActions: string[];
  facts: ExpectedFact[];
};

/** 사진에서 읽어야 하는 값. requiredFor는 이 값이 없으면 끝낼 수 없는 행동이다. */
export type ExpectedFact = {
  id: string;
  label: string;
  kind: string;
  acceptedValues: string[];
  requiredFor: string[];
};

/** case에 붙인 비슷한 사례(모델에 보낸 예시). 정답 category가 같으면 맞는 예시다. */
export type RetrievalTrace = {
  examples: { caseId: string; category: string; similarity: number }[];
};

/** 계단식 호출의 경로. escalated면 결과는 두 번째 모델의 답이다. */
export type CascadeTrace = {
  firstModel: string;
  firstConfidence: string | null;
  escalated: boolean;
};

export type TextExpected = {
  text: string;
  readingOrder: string;
  tokenizer: string | null;
  fields: { id: string; aliases: string[]; acceptedValues: string[]; important: boolean }[];
};

export type TranslationInput = {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export type TranslationExpected = {
  references: string[];
  criticalSpans: { id: string; kind: string; accepted: string[] }[];
};

/** `cases.jsonl` 한 줄. task가 prediction · input · expected의 모양을 정한다. */
export type CaseResult =
  | (CaseResultBase & {
      task: 'image-classification';
      input: { image: ImageInput };
      expected: ClassificationExpected;
      prediction: ClassificationPrediction | null;
      retrieval: RetrievalTrace | null;
      cascade: CascadeTrace | null;
    })
  | (CaseResultBase & {
      task: 'text-extraction';
      input: { image: ImageInput; language: string | null };
      expected: TextExpected;
      prediction: { text: string; fields: Record<string, string> } | null;
    })
  | (CaseResultBase & {
      task: 'translation';
      input: TranslationInput;
      expected: TranslationExpected;
      prediction: { text: string; targetLanguage: string | null } | null;
    });

export type ClassificationQuality = {
  selected: number;
  evaluated: number;
  notRun: number;
  complete: boolean;
  predicted: number;
  passRate: Measure;
  categoryAccuracy: Measure;
  macroF1: Measure;
  macroCoverage: 'full' | 'subset';
  missingLabels: string[];
  labels: Record<
    string,
    {
      support: number;
      tp: number;
      fp: number;
      fn: number;
      precision: Measure;
      recall: Measure;
      f1: Measure;
    }
  >;
  /** 결과가 없거나 계약 밖이라 `__invalid__`로 간 case 수. */
  categoryInvalid: number;
  /** gold category → 예측 → 수. 예측 열에는 `__invalid__`(결과 없음 · 계약 밖)가 있다. */
  confusion: Record<string, Record<string, number>>;
  /** forbiddenActions가 있는 case의 위험 집계. unobserved는 실행 실패로 보지 못한 것이다. */
  risk: { eligible: number; observed: number; unobserved: number; critical: number };
  /** 모델 원문 판정 — JSON 문법 · schema 모양 · production parser. unobserved는 판정할 원문이 없던 것이다. */
  raw: Record<'syntax' | 'shape' | 'parser', Tally>;
  /** 추출값과 행동 완료 가능률. 이 집계가 생기기 전의 산출물이면 null. */
  facts: {
    annotated: number;
    expected: number;
    found: number;
    recall: Measure;
    readyEligible: number;
    ready: number;
    readyRate: Measure;
  } | null;
  /** confidence high면 확인 없이 실행한다는 규칙이 안전한지. 옛 산출물이면 null. */
  calibration: {
    high: number;
    highWrong: number;
    highWrongRate: Measure;
    autoExecuted: number;
    autoCorrect: number;
    autoPrecision: Measure;
    autoCoverage: Measure;
  } | null;
  /** 비슷한 사례 검색을 쓴 variant만. */
  retrieval: {
    queries: number;
    top1Correct: number;
    top1Rate: Measure;
    anyCorrect: number;
    hitRate: Measure;
    meanReciprocalRank: Measure;
  } | null;
  /** 계단식을 쓴 variant만. */
  cascade: { invocations: number; escalated: number; escalationRate: Measure } | null;
  canonicalActionExactMatch: Measure;
  acceptedActionAccuracy: Measure;
  jointExactMatch: Measure;
  criticalRate: Measure;
  criticalOrUnobservedRate: Measure;
};

export type Tally = { valid: number; invalid: number; unobserved: number };

export type TextQuality = {
  selected: number;
  evaluated: number;
  notRun: number;
  complete: boolean;
  predicted: number;
  passRate: Measure;
  normalization: string;
  unicode: string;
  rawExactMatchRate: Measure;
  normalizedExactMatchRate: Measure;
  corpusCer: Measure;
  meanCaseCer: Measure;
  corpusWer: Measure;
  meanCaseWer: Measure;
  fieldAccuracy: Measure;
  importantFieldRecall: Measure;
  emptyReferences: number;
  hallucinatedChars: number;
  /** field id별 집계. field 계약이 없는 run은 빈 목록(v1 선택 field). 판정은 Go가 하고 여기서 다시 맞춰 보지 않는다. */
  fieldStats: FieldStat[];
};

export type FieldStat = {
  id: string;
  support: number;
  important: number;
  /** 예측이 있어 판정한 수. support - evaluated는 실행 실패 · 미실행이다. */
  evaluated: number;
  correct: number;
  wrong: number;
  missing: number;
  accuracy: Measure;
};

export type TranslationQuality = {
  selected: number;
  evaluated: number;
  notRun: number;
  complete: boolean;
  predicted: number;
  passRate: Measure;
  normalization: string;
  unicode: string;
  rawExactMatchRate: Measure;
  normalizedExactMatchRate: Measure;
  languageMetadataRate: Measure;
  criticalSpanRecall: Measure;
  semanticSimilarity: Measure;
  bleu: Measure;
  chrf: Measure;
  judge: Measure;
  scored: boolean;
  unscored: number;
};

/** trial 하나의 품질. task마다 다른 표이고 다른 task의 열을 0으로 채우지 않는다. */
export type TrialQuality =
  | { task: 'image-classification'; trial: number; quality: ClassificationQuality }
  | { task: 'text-extraction'; trial: number; quality: TextQuality }
  | { task: 'translation'; trial: number; quality: TranslationQuality };

export type LatencyStats = { n: number; meanMs: Measure; medianMs: Measure; p95Ms: Measure };

export type VariantReport = {
  variant: Variant;
  trials: number;
  execution: {
    selected: number;
    invocations: number;
    attempted: number;
    completed: number;
    failed: number;
    timedOut: number;
    unsupported: number;
    notRun: number;
    cancelled: number;
    missing: number;
    /** completed 중 원래 run에서 호출 없이 옮긴 수. 다시 실행한 run이 아니면 0. */
    carried: number;
  };
  outcome: { passed: number; failed: number; unscored: number };
  quality: TrialQuality[];
  reliability: {
    attempted: number;
    completed: number;
    wireCalls: number;
    completionRate: Measure;
    errorsByClass: Record<string, number>;
    errorsByKind: Record<string, number>;
  };
  latency: { definition: string; attempted: LatencyStats; completed: LatencyStats };
  cost: {
    wireCalls: number;
    inputTokens: Measure;
    outputTokens: Measure;
    usageKnown: number;
    usageUnknown: number;
    estimated: Measure;
    actual: Measure;
  };
  /** 답한 모델별 호출 수. different는 요청한 모델(또는 날짜 붙은 판)이 아닌 모델이 답한 수. */
  models: { answered: Record<string, number>; unknown: number; different: number } | null;
};

/** `summary.json`. 정본 두 파일에서 다시 만든 파생물이고 종합 점수는 없다. */
export type RunSummary = {
  schemaVersion: 1;
  runId: string;
  mode: Mode;
  status: RunStatus;
  abort: string | null;
  dataset: DatasetSelection;
  policy: Policy;
  officialEligible: boolean;
  reasons: string[];
  variants: VariantReport[];
};

export type Change = 'improved' | 'regressed' | 'unchanged' | 'not-comparable';

export type MetricDelta = {
  name: string;
  direction: 'higher-is-better' | 'lower-is-better';
  baseline: Measure;
  candidate: Measure;
  absoluteDelta: Measure;
  deltaPp: Measure;
  relativePercent: Measure;
  change: Change;
};

export type CaseChange = {
  caseId: string;
  check: string;
  baseline: string;
  candidate: string;
  baselinePrediction: string;
  candidatePrediction: string;
};

export type RunRef = { runId: string; variantId: string; trial: number };

/** category 하나의 P · R · F1 변화. 분류 비교에만 있다. */
export type LabelDelta = {
  label: string;
  support: number;
  precision: MetricDelta;
  recall: MetricDelta;
  f1: MetricDelta;
};

/** `comparison.json`. 두 run을 짝 비교해 저장한 read model. 비교 불가면 delta가 없다. */
export type Comparison = {
  schemaVersion: 1;
  comparisonId: string;
  baseline: RunRef;
  baselineVariant: Variant;
  candidate: RunRef;
  candidateVariant: Variant;
  dataset: DatasetSelection;
  policy: Policy;
  comparable: boolean;
  incomparable: string[];
  warnings: string[];
  axes: { axis: string; comparable: boolean; reason: string | null; metrics: MetricDelta[] }[];
  /** 분류만. 다른 과제는 빈 목록이다. */
  labels: LabelDelta[];
  cases: {
    paired: number;
    unpaired: string[];
    predictionChanged: number;
    newlyFailed: CaseChange[];
    fixed: CaseChange[];
    newlyErrored: CaseChange[];
    errorsResolved: CaseChange[];
    newCritical: CaseChange[];
    criticalResolved: CaseChange[];
  };
  gate: {
    policyVersion: string;
    applicable: boolean;
    reason: string | null;
    passed: boolean;
    rules: { rule: string; limit: number; observed: Measure; passed: boolean }[];
  } | null;
  conclusion: string;
};
