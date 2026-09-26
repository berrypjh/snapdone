import type { CaseResult, Measure, RunSummary, Task, VariantReport } from './contract';
import { type DisplayMeasure, formatMeasure, type MeasureUnit, qualityRows } from './presentation';

/**
 * run 상세의 비교 read model. 값은 Go 요약 · case 결과 그대로이고, 여기서는 variant끼리 나란히 놓고 기준 variant와의
 * 차이 방향만 읽는다(다시 채점하지 않음). 선택은 URL — `?variant=` 자세히 볼 variant, `?base=` 기준, `?show=` case 필터.
 */

export type Direction = 'higher' | 'lower';

type Column = {
  label: string;
  unit: MeasureUnit;
  direction: Direction;
  pick: (r: VariantReport) => Measure | null;
};

/** Go 요약의 품질 줄에서 이름으로 고른다. 없는 줄(옛 산출물)은 null. */
const quality = (label: string) => (r: VariantReport) => {
  const [trial] = r.quality;
  return trial ? (qualityRows(trial).find((row) => row.label === label)?.measure ?? null) : null;
};

const completion: Column = {
  label: '실행 완료율',
  unit: 'rate',
  direction: 'higher',
  pick: (r) => r.reliability.completionRate,
};

/** 비교표의 고정 열. 과제마다 대표 지표와 안전 지표, 실행 완료율. */
export const SUMMARY_COLUMNS: Record<Task, Column[]> = {
  'image-classification': [
    {
      label: 'category 정확도',
      unit: 'rate',
      direction: 'higher',
      pick: quality('category 정확도'),
    },
    {
      label: '허용 행동 정확도',
      unit: 'rate',
      direction: 'higher',
      pick: quality('허용 행동 정확도'),
    },
    { label: 'critical 비율', unit: 'rate', direction: 'lower', pick: quality('critical 비율') },
    {
      label: '행동 완료 가능률',
      unit: 'rate',
      direction: 'higher',
      pick: quality('행동 완료 가능률'),
    },
    { label: 'high인데 틀림', unit: 'rate', direction: 'lower', pick: quality('high인데 틀림') },
    completion,
  ],
  'text-extraction': [
    { label: 'corpus CER', unit: 'ratio', direction: 'lower', pick: quality('corpus CER') },
    { label: 'field 정확도', unit: 'rate', direction: 'higher', pick: quality('field 정확도') },
    { label: 'pass rate', unit: 'rate', direction: 'higher', pick: quality('pass rate') },
    completion,
  ],
  translation: [
    {
      label: '보존 구간 재현율',
      unit: 'rate',
      direction: 'higher',
      pick: quality('보존 구간 재현율'),
    },
    {
      label: 'reference 일치(정규화)',
      unit: 'rate',
      direction: 'higher',
      pick: quality('reference 일치(정규화)'),
    },
    completion,
  ],
};

export type Change = 'better' | 'worse' | 'same';

export type SummaryCell = {
  display: DisplayMeasure;
  /** 기준 variant와의 차이. 기준 자신이거나 어느 쪽이든 값이 없으면 null. */
  delta: { text: string; change: Change } | null;
  /** 이 열에서 가장 좋은 값(같은 값 여럿이면 모두). 값이 둘 이상이고 서로 다를 때만. */
  best: boolean;
};

export type SummaryRow = {
  report: VariantReport;
  isBase: boolean;
  cells: SummaryCell[];
  better: number;
  worse: number;
};

const value = (m: Measure | null) => (m && m.availability === 'measured' ? m.value : null);

const deltaText = (diff: number, unit: MeasureUnit) => {
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  const abs = Math.abs(diff);
  if (unit === 'rate') return `${sign}${(abs * 100).toFixed(1)}pp`;
  if (unit === 'ms') return `${sign}${Math.round(abs)} ms`;
  return `${sign}${abs.toFixed(3)}`;
};

/** variant × 대표 지표. 기준은 `baseId`(없거나 모르면 첫 variant). */
export const summaryTable = (summary: RunSummary, task: Task, baseId: string | null) => {
  const columns = SUMMARY_COLUMNS[task];
  const base = summary.variants.find((r) => r.variant.id === baseId) ?? summary.variants[0];
  const values = summary.variants.map((r) => columns.map((c) => value(c.pick(r))));
  const bests = columns.map((c, i) => {
    const measured = values.map((row) => row[i]).filter((v): v is number => v !== null);
    if (measured.length < 2 || measured.every((v) => Math.abs(v - measured[0]) < 1e-9)) return null;
    return c.direction === 'higher' ? Math.max(...measured) : Math.min(...measured);
  });
  const baseIndex = summary.variants.indexOf(base);
  const rows: SummaryRow[] = summary.variants.map((report, r) => {
    let better = 0;
    let worse = 0;
    const cells = columns.map((c, i): SummaryCell => {
      const measure = c.pick(report);
      const own = values[r][i];
      const ref = values[baseIndex][i];
      let delta: SummaryCell['delta'] = null;
      if (report !== base && own !== null && ref !== null) {
        const diff = own - ref;
        const change: Change =
          Math.abs(diff) < 1e-9
            ? 'same'
            : diff > 0 === (c.direction === 'higher')
              ? 'better'
              : 'worse';
        if (change === 'better') better++;
        if (change === 'worse') worse++;
        delta = { text: deltaText(diff, c.unit), change };
      }
      return {
        display: measure
          ? formatMeasure(measure, c.unit)
          : {
              text: '없음',
              missing: true,
              availability: 'unavailable',
              reason: '이 요약에 없는 지표',
            },
        delta,
        best: own !== null && bests[i] !== null && Math.abs(own - (bests[i] as number)) < 1e-9,
      };
    });
    return { report, isBase: report === base, cells, better, worse };
  });
  return { columns, base, rows };
};

/** 기준과 견준 한 줄 판정 — 좋아진 지표만 있으면 개선, 나빠진 것만 있으면 악화, 둘 다면 엇갈림. */
export const grade = (row: SummaryRow) =>
  row.isBase
    ? '기준'
    : row.better > 0 && row.worse > 0
      ? `엇갈림 — 좋아짐 ${row.better} · 나빠짐 ${row.worse}`
      : row.better > 0
        ? `개선 — 좋아짐 ${row.better}`
        : row.worse > 0
          ? `악화 — 나빠짐 ${row.worse}`
          : '차이 없음';

export type Outcome = 'passed' | 'failed' | 'unscored' | 'error' | 'not-run' | 'skipped';

export const OUTCOME: Record<Outcome, { glyph: string; label: string }> = {
  passed: { glyph: '●', label: '통과' },
  failed: { glyph: '×', label: '실패' },
  unscored: { glyph: '–', label: '채점 안 함' },
  error: { glyph: '!', label: '실행 오류' },
  'not-run': { glyph: '○', label: '미실행' },
  skipped: { glyph: '–', label: '미지원' },
};

const outcomeOf = (c: CaseResult): Outcome => {
  switch (c.execution.status) {
    case 'not-run':
      return 'not-run';
    case 'skipped':
      return 'skipped';
    case 'failed':
    case 'timed-out':
      return 'error';
  }
  return c.quality.outcome === 'passed'
    ? 'passed'
    : c.quality.outcome === 'failed'
      ? 'failed'
      : 'unscored';
};

/** 칸에 보일 짧은 예측. 분류는 category / 행동, 그 밖에는 없음. */
const answerOf = (c: CaseResult) =>
  c.task === 'image-classification' && c.prediction
    ? `${c.prediction.category} / ${c.prediction.suggestedAction}`
    : null;

export type MatrixFilter = 'all' | 'diff' | 'regressed' | 'failed';

export const MATRIX_FILTERS: Record<MatrixFilter, string> = {
  all: '전체',
  diff: 'variant끼리 갈림',
  regressed: '기준보다 나빠짐',
  failed: '모두 실패',
};

export const parseMatrixFilter = (value: unknown): MatrixFilter =>
  typeof value === 'string' && value in MATRIX_FILTERS ? (value as MatrixFilter) : 'all';

export type MatrixCell = { outcome: Outcome; answer: string | null } | null;
export type MatrixRow = { caseId: string; gold: string | null; cells: MatrixCell[] };

const goldOf = (c: CaseResult) =>
  c.task === 'image-classification'
    ? `${c.expected.category} / ${c.expected.acceptableActions.join(' · ') || '행동 없음'}`
    : null;

/** case × variant(trial 1). 기준 variant가 통과했는데 다른 variant가 실패한 case가 "나빠짐"이다. */
export const caseMatrix = (cases: CaseResult[], variantIds: string[], baseId: string) => {
  const byCase = new Map<string, Map<string, CaseResult>>();
  for (const c of cases) {
    if (c.trial !== 1) continue;
    if (!byCase.has(c.caseId)) byCase.set(c.caseId, new Map());
    byCase.get(c.caseId)?.set(c.variantId, c);
  }
  const rows: MatrixRow[] = [...byCase.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([caseId, results]) => {
      const first = [...results.values()][0];
      return {
        caseId,
        gold: goldOf(first),
        cells: variantIds.map((id) => {
          const c = results.get(id);
          return c ? { outcome: outcomeOf(c), answer: answerOf(c) } : null;
        }),
      };
    });
  const baseIndex = Math.max(0, variantIds.indexOf(baseId));
  const matches: Record<MatrixFilter, (row: MatrixRow) => boolean> = {
    all: () => true,
    diff: (row) => new Set(row.cells.map((cell) => cell?.outcome ?? 'none')).size > 1,
    regressed: (row) =>
      row.cells[baseIndex]?.outcome === 'passed' &&
      row.cells.some((cell, i) => i !== baseIndex && cell?.outcome !== 'passed'),
    failed: (row) =>
      row.cells.every((cell) => cell?.outcome === 'failed' || cell?.outcome === 'error'),
  };
  const counts = Object.fromEntries(
    (Object.keys(MATRIX_FILTERS) as MatrixFilter[]).map((f) => [f, rows.filter(matches[f]).length]),
  ) as Record<MatrixFilter, number>;
  return { rows, counts, matches };
};
