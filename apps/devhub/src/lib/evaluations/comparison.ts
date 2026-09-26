import type { CaseChange, Change, Comparison, MetricDelta } from './contract';
import { type DisplayMeasure, formatMeasure, type MeasureUnit } from './presentation';

/**
 * 비교 화면의 read model. 비교 가능 여부 · 방향 · 차이 · 개선/악화 · case 변화 · gate는 전부 Go `Compare`가 정했고
 * 여기서는 글자와 막대 길이로 바꿀 뿐이다. 값이 없는 차이는 막대 없이 이유를 둔다.
 */

export const comparisonHref = (id: string) => `/evals/compare/${id}`;

export const CHANGE: Record<Change, { label: string; glyph: string }> = {
  improved: { label: '개선', glyph: '▲' },
  regressed: { label: '악화', glyph: '▼' },
  unchanged: { label: '같음', glyph: '=' },
  'not-comparable': { label: '비교 불가', glyph: '–' },
};

export const AXIS_LABELS: Record<string, string> = {
  quality: '품질',
  reliability: '신뢰성',
  latency: '지연',
  cost: 'token · 비용',
};

export const DIRECTION_LABELS: Record<MetricDelta['direction'], string> = {
  'higher-is-better': '높을수록 좋음',
  'lower-is-better': '낮을수록 좋음',
};

export type DeltaView = {
  name: string;
  direction: string;
  change: Change;
  baseline: DisplayMeasure;
  candidate: DisplayMeasure;
  /** 차이의 글자. 비교할 수 없으면 이유다. */
  delta: DisplayMeasure;
  /** 막대 길이(0–1)와 방향. 차이를 잴 수 없으면 null이고 막대를 그리지 않는다. */
  bar: { magnitude: number; sign: -1 | 0 | 1 } | null;
};

/**
 * 표시 단위. Go는 비율 지표에만 percentage point 차이를 준다(`deltaPp`가 measured). 지연 축은 ms이고 나머지는
 * 수(개수 · token)다.
 */
const unitOf = (m: MetricDelta, axis: string): MeasureUnit =>
  m.deltaPp.availability === 'measured' ? 'rate' : axis === 'latency' ? 'ms' : 'count';

const signed = (text: string, value: number) =>
  value > 0 ? `+${text}` : value < 0 ? `−${text.replace(/^-/, '')}` : text;

export const deltaView = (m: MetricDelta, axis: string): DeltaView => {
  const unit = unitOf(m, axis);
  const view = {
    name: m.name,
    direction: DIRECTION_LABELS[m.direction],
    change: m.change,
    baseline: formatMeasure(m.baseline, unit),
    candidate: formatMeasure(m.candidate, unit),
  };
  if (m.change === 'not-comparable' || m.absoluteDelta.availability !== 'measured') {
    return { ...view, delta: formatMeasure(m.absoluteDelta, unit), bar: null };
  }
  const abs = m.absoluteDelta.value;
  const sign = abs > 0 ? 1 : abs < 0 ? -1 : 0;
  if (m.deltaPp.availability === 'measured') {
    const pp = m.deltaPp.value;
    return {
      ...view,
      delta: {
        text: signed(`${Math.abs(pp).toFixed(1)}pp`, pp),
        missing: false,
        availability: 'measured',
        reason: null,
      },
      bar: { magnitude: Math.min(1, Math.abs(pp) / 100), sign },
    };
  }
  const rel = m.relativePercent;
  return {
    ...view,
    delta: {
      text:
        signed(formatMeasure({ availability: 'measured', value: Math.abs(abs) }, unit).text, abs) +
        (rel.availability === 'measured'
          ? ` (${signed(`${Math.abs(rel.value).toFixed(1)}%`, rel.value)})`
          : ''),
      missing: false,
      availability: 'measured',
      reason: null,
    },
    bar:
      rel.availability === 'measured'
        ? { magnitude: Math.min(1, Math.abs(rel.value) / 100), sign }
        : null,
  };
};

export type CaseGroupKey = keyof Omit<
  Comparison['cases'],
  'paired' | 'unpaired' | 'predictionChanged'
>;

/** case 변화 묶음. 나빠진 것을 먼저 둔다. */
export const CASE_GROUPS: { key: CaseGroupKey; label: string; tone: 'regressed' | 'improved' }[] = [
  { key: 'newlyFailed', label: '새로 틀림', tone: 'regressed' },
  { key: 'newlyErrored', label: '새로 실행 오류', tone: 'regressed' },
  { key: 'newCritical', label: '새 critical(금지 행동 추천)', tone: 'regressed' },
  { key: 'fixed', label: '고쳐짐', tone: 'improved' },
  { key: 'errorsResolved', label: '실행 오류 해소', tone: 'improved' },
  { key: 'criticalResolved', label: 'critical 해소', tone: 'improved' },
];

export const caseGroups = (c: Comparison) =>
  CASE_GROUPS.map((g) => ({ ...g, changes: c.cases[g.key] as CaseChange[] }));
