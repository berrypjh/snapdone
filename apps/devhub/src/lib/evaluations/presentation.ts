import type {
  Availability,
  ClassificationQuality,
  Measure,
  Mode,
  Task,
  TrialQuality,
  Variant,
} from './contract';

/**
 * 평가 산출물을 화면 글자로 바꾸는 순수 함수. Go가 낸 값을 고르고 꾸밀 뿐, 맞았는지 다시 판정하지 않는다.
 * 값이 없는 측정은 0이나 빈칸이 아니라 이유와 함께 "값 없음"으로 보인다.
 */

export const TASK_LABELS: Record<Task, string> = {
  'image-classification': '사진 분류',
  'text-extraction': '텍스트 추출',
  translation: '번역',
};

/** 과제가 무엇을 재는지 한 줄. 과제 화면의 첫 문장이다. */
export const TASK_NOTES: Record<Task, string> = {
  'image-classification': '사진의 종류 · 할 일 · 읽을 값을 맞히는지 — 실제 모델 호출 가능',
  'text-extraction': '사진 속 글자를 그대로 옮기는지 — 기록 재채점만',
  translation: '확정된 원문을 번역하는지 — 기록 재채점만',
};

const AVAILABILITY_LABELS: Record<Availability, string> = {
  measured: '측정',
  partial: '일부 측정',
  unavailable: '값 없음',
  unsupported: '지원 안 함',
  'not-measured': '측정 안 함',
  'not-applicable': '해당 없음',
};

/** 값의 단위. rate는 0..1 비율, ratio는 1을 넘을 수 있는 비율(CER · WER), ms는 시간이다. */
export type MeasureUnit = 'rate' | 'ratio' | 'count' | 'ms';

export type DisplayMeasure = {
  text: string;
  /** 값이 없으면 참. 화면은 흐리게 두고 reason을 보여 준다. */
  missing: boolean;
  availability: Availability;
  reason: string | null;
};

const formatValue = (value: number, unit: MeasureUnit) => {
  switch (unit) {
    case 'rate':
      return `${(value * 100).toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(3);
    case 'count':
      return Math.round(value).toLocaleString('ko-KR');
    case 'ms':
      return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
  }
};

export const formatMeasure = (measure: Measure, unit: MeasureUnit): DisplayMeasure => {
  if (measure.availability === 'measured') {
    return {
      text: formatValue(measure.value, unit),
      missing: false,
      availability: 'measured',
      reason: null,
    };
  }
  if (measure.availability === 'partial') {
    return {
      text: `${formatValue(measure.value, unit)} (일부)`,
      missing: false,
      availability: 'partial',
      reason: measure.reason,
    };
  }
  return {
    text: AVAILABILITY_LABELS[measure.availability],
    missing: true,
    availability: measure.availability,
    reason: measure.reason,
  };
};

export type PrimaryMetric = {
  label: string;
  measure: Measure;
  unit: MeasureUnit;
  direction: 'higher-is-better' | 'lower-is-better';
};

/**
 * trial 요약에서 머리에 둘 지표 하나. 번역은 기본 policy가 채점하지 않으므로 pass rate 대신 보존 구간 재현율을
 * 두고, reference 일치는 진단값이라 머리에 두지 않는다.
 */
export const primaryMetric = (trial: TrialQuality): PrimaryMetric => {
  switch (trial.task) {
    case 'image-classification':
      return {
        label: 'category 정확도',
        measure: trial.quality.categoryAccuracy,
        unit: 'rate',
        direction: 'higher-is-better',
      };
    case 'text-extraction':
      return {
        label: 'corpus CER',
        measure: trial.quality.corpusCer,
        unit: 'ratio',
        direction: 'lower-is-better',
      };
    case 'translation':
      return {
        label: '보존 구간 재현율',
        measure: trial.quality.criticalSpanRecall,
        unit: 'rate',
        direction: 'higher-is-better',
      };
  }
};

/**
 * 이 variant의 답을 누가 냈는지. 채점이 아니라 metadata(mode · adapter)만 본다.
 * model — 이 run에서 모델을 실제로 부름. rule — 모델 없는 기준선. recorded — 파일에 적힌 예측을 다시 채점.
 */
export type AnswerSource = 'model' | 'rule' | 'recorded';

export const ANSWER_SOURCE: Record<AnswerSource, { label: string; glyph: string; note: string }> = {
  model: { label: '실제 모델 호출', glyph: '●', note: '이 run에서 모델이 직접 낸 답을 채점' },
  rule: {
    label: '규칙 기준선',
    glyph: '◇',
    note: '모델 없이 정한 규칙이 낸 답 — 모델 성능이 아님',
  },
  recorded: {
    label: '기록 재채점',
    glyph: '○',
    note: '파일에 적힌 예측을 다시 채점 — 이 run에서 모델 호출 없음, 모델 성능이 아님',
  },
};

export const answerSource = (mode: Mode, variant: Variant): AnswerSource =>
  variant.adapter === 'baseline' ? 'rule' : mode === 'live' ? 'model' : 'recorded';

/** variant의 실험 설정을 한 줄로. production 분류기 그대로면 null이다. */
export const experimentLabel = ({ experiment: e }: Variant): string | null => {
  const parts = [
    e.baseline &&
      (e.baseline.strategy === 'constant'
        ? `기준선 — 늘 ${e.baseline.category} / ${e.baseline.suggestedAction}`
        : '기준선 — 가장 비슷한 사례의 정답을 그대로'),
    e.promptHash && `실험 지시 ${e.promptHash.slice(0, 12)}`,
    e.retrieval && `비슷한 사례 ${e.retrieval.k}개를 예시로`,
    e.cascade && `불확실(${e.cascade.escalateOn.join(', ')})하면 ${e.cascade.model}에 다시 물음`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** 품질 지표의 묶음. run 상세는 묶음마다 제목과 한 줄 설명을 둔다. */
export type QualityGroup = 'category' | 'action' | 'safety' | 'act' | 'experiment' | 'text';

export const QUALITY_GROUPS: Record<QualityGroup, { title: string; note: string }> = {
  category: { title: '분류', note: '사진 종류(장소 · 일정 · 영수증 …)를 맞혔는지' },
  action: { title: '행동', note: '추천한 행동이 정답이 허용한 행동인지' },
  safety: { title: '안전', note: '해서는 안 되는 답을 얼마나 냈는지 — 낮을수록 좋음' },
  act: {
    title: '추출값 · 자동 실행',
    note: '행동에 필요한 값을 읽었는지, 확인 없이 실행해도 되는 답이었는지',
  },
  experiment: { title: '실험', note: '비슷한 사례 예시 · 계단식을 쓴 variant에만 있음' },
  text: { title: '품질', note: 'Go 요약의 값 그대로' },
};

export type QualityRow = {
  label: string;
  measure: Measure;
  unit: MeasureUnit;
  group: QualityGroup;
  note?: string;
};

/** 추출값 · 자동 실행 · 비슷한 사례 · 계단식 줄. 그 집계가 없는 run(옛 산출물 · 쓰지 않은 variant)에는 없다. */
const experimentRows = (q: ClassificationQuality): QualityRow[] => [
  ...(q.calibration
    ? [
        {
          label: 'high인데 틀림',
          measure: q.calibration.highWrongRate,
          unit: 'rate' as const,
          group: 'safety' as const,
          note: `신뢰도 high ${q.calibration.high}개 중 해서는 안 되는 답`,
        },
      ]
    : []),
  ...(q.facts
    ? [
        {
          label: '추출값 재현율',
          measure: q.facts.recall,
          unit: 'rate' as const,
          group: 'act' as const,
          note: `읽어야 할 값 ${q.facts.expected}개 중 ${q.facts.found}개 찾음`,
        },
        {
          label: '행동 완료 가능률',
          measure: q.facts.readyRate,
          unit: 'rate' as const,
          group: 'act' as const,
          note: '맞는 행동을 골랐고 그 행동에 필요한 값을 모두 읽음',
        },
      ]
    : []),
  ...(q.calibration
    ? [
        {
          label: '자동 실행 정확도',
          measure: q.calibration.autoPrecision,
          unit: 'rate' as const,
          group: 'act' as const,
          note: `확인 없이 실행할 답(high · 행동 있음) ${q.calibration.autoExecuted}개 중 맞음`,
        },
        {
          label: '자동 실행 비율',
          measure: q.calibration.autoCoverage,
          unit: 'rate' as const,
          group: 'act' as const,
          note: '나머지는 사용자 확인을 거침',
        },
      ]
    : []),
  ...(q.retrieval
    ? [
        {
          label: '비슷한 사례 첫 예시 적중',
          measure: q.retrieval.top1Rate,
          unit: 'rate' as const,
          group: 'experiment' as const,
          note: `첫 예시의 종류가 정답과 같음 · ${q.retrieval.queries} case`,
        },
        {
          label: '비슷한 사례 MRR',
          measure: q.retrieval.meanReciprocalRank,
          unit: 'ratio' as const,
          group: 'experiment' as const,
          note: '맞는 예시가 앞에 올수록 1에 가까움',
        },
      ]
    : []),
  ...(q.cascade
    ? [
        {
          label: '큰 모델 재질문 비율',
          measure: q.cascade.escalationRate,
          unit: 'rate' as const,
          group: 'experiment' as const,
          note: `${q.cascade.invocations}번 중 ${q.cascade.escalated}번 다시 물음`,
        },
      ]
    : []),
];

/**
 * run 상세의 품질 지표. Go 요약의 값을 과제별로 고를 뿐이다. 번역은 기본 규칙이 case를 채점하지 않으면(scored가
 * 거짓) pass rate 줄을 두지 않고, reference 일치는 진단값이라고 적는다.
 */
export const qualityRows = (trial: TrialQuality): QualityRow[] => {
  switch (trial.task) {
    case 'image-classification': {
      const q = trial.quality;
      return [
        {
          label: 'category 정확도',
          measure: q.categoryAccuracy,
          unit: 'rate',
          group: 'category',
          note: '사진 종류를 맞힌 몫',
        },
        {
          label: `macro F1 (${q.macroCoverage})`,
          measure: q.macroF1,
          unit: 'rate',
          group: 'category',
          note: '종류마다 같은 무게로 본 평균 — 드문 종류를 놓치면 낮아짐',
        },
        {
          label: '허용 행동 정확도',
          measure: q.acceptedActionAccuracy,
          unit: 'rate',
          group: 'action',
          note: '정답이 허용한 행동 중 하나를 추천',
        },
        {
          label: '대표 행동 일치',
          measure: q.canonicalActionExactMatch,
          unit: 'rate',
          group: 'action',
          note: '정답의 첫 행동(canonical)과 같음',
        },
        {
          label: '종류 · 행동 동시 일치',
          measure: q.jointExactMatch,
          unit: 'rate',
          group: 'action',
        },
        {
          label: 'pass rate',
          measure: q.passRate,
          unit: 'rate',
          group: 'action',
          note: '채점 규칙의 모든 확인을 통과',
        },
        {
          label: 'critical 비율',
          measure: q.criticalRate,
          unit: 'rate',
          group: 'safety',
          note: '절대 나오면 안 되는 행동을 추천',
        },
        {
          label: 'critical 또는 관측 못 함',
          measure: q.criticalOrUnobservedRate,
          unit: 'rate',
          group: 'safety',
          note: '실행 실패로 보지 못한 case까지 위험으로 셈',
        },
        ...experimentRows(q),
      ];
    }
    case 'text-extraction': {
      const q = trial.quality;
      const rows: Omit<QualityRow, 'group'>[] = [
        { label: '원문 그대로 일치', measure: q.rawExactMatchRate, unit: 'rate' },
        { label: '공백 정규화 뒤 일치', measure: q.normalizedExactMatchRate, unit: 'rate' },
        {
          label: 'corpus CER',
          measure: q.corpusCer,
          unit: 'ratio',
          note: '글자 오류율 — 낮을수록 좋음',
        },
        { label: 'case 평균 CER', measure: q.meanCaseCer, unit: 'ratio', note: '낮을수록 좋음' },
        {
          label: 'corpus WER',
          measure: q.corpusWer,
          unit: 'ratio',
          note: '단어 오류율 — 낮을수록 좋음',
        },
        { label: 'field 정확도', measure: q.fieldAccuracy, unit: 'rate' },
        { label: '중요 field 재현율', measure: q.importantFieldRecall, unit: 'rate' },
        { label: 'pass rate', measure: q.passRate, unit: 'rate' },
      ];
      return rows.map((row) => ({ ...row, group: 'text' }));
    }
    case 'translation': {
      const q = trial.quality;
      const rows: Omit<QualityRow, 'group'>[] = [
        {
          label: 'reference 일치(원문)',
          measure: q.rawExactMatchRate,
          unit: 'rate',
          note: '진단값 — 의역은 틀림이 아님',
        },
        {
          label: 'reference 일치(정규화)',
          measure: q.normalizedExactMatchRate,
          unit: 'rate',
          note: '진단값',
        },
        { label: '보존 구간 재현율', measure: q.criticalSpanRecall, unit: 'rate' },
        {
          label: '선언 언어 일치',
          measure: q.languageMetadataRate,
          unit: 'rate',
          note: '언어 감지가 아님',
        },
        { label: '의미 유사도', measure: q.semanticSimilarity, unit: 'rate' },
        { label: 'BLEU', measure: q.bleu, unit: 'rate' },
        { label: 'chrF', measure: q.chrf, unit: 'rate' },
        { label: 'judge', measure: q.judge, unit: 'rate' },
        ...(q.scored ? [{ label: 'pass rate', measure: q.passRate, unit: 'rate' as const }] : []),
      ];
      return rows.map((row) => ({ ...row, group: 'text' }));
    }
  }
};

/** run 상세 맨 위 "한눈에"에 둘 지표 — 과제의 대표 지표와, 분류면 행동 · 안전 · 완료 가능. */
export const keyRows = (trial: TrialQuality): QualityRow[] => {
  const keys: Record<Task, string[]> = {
    'image-classification': [
      'category 정확도',
      '허용 행동 정확도',
      'critical 비율',
      '행동 완료 가능률',
      '자동 실행 정확도',
    ],
    'text-extraction': ['corpus CER', 'field 정확도', 'pass rate'],
    translation: ['보존 구간 재현율', 'pass rate'],
  };
  const rows = qualityRows(trial);
  return keys[trial.task].flatMap((label) => rows.filter((row) => row.label === label));
};
