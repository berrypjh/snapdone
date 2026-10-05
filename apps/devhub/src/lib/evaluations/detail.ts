import type { CaseResult, ClassificationQuality, VariantReport } from './contract';

/**
 * run 상세의 read model. Go가 쓴 case 결과와 요약에서 값을 고르고 묶을 뿐 다시 판정하지 않는다. 값이 없는 측정은
 * 버리지 않고 이유와 함께 따로 둔다.
 */

export const INVALID_LABEL = '__invalid__';

export type SegmentKey = 'completed' | 'failed' | 'timedOut' | 'notRun' | 'unsupported';

export const SEGMENTS: Record<SegmentKey, { label: string; glyph: string }> = {
  completed: { label: '완료', glyph: '●' },
  failed: { label: '실패', glyph: '×' },
  timedOut: { label: '시간 초과', glyph: '◷' },
  notRun: { label: '미실행', glyph: '○' },
  unsupported: { label: '미지원', glyph: '–' },
};

export type Segment = { key: SegmentKey; count: number };

/** 한 variant의 호출이 어떻게 끝났는지. 합은 호출 수(case × trial)다. 줄이 빠진 호출은 미실행으로 센다. */
export const executionSegments = (
  report: VariantReport,
): { total: number; segments: Segment[] } => {
  const e = report.execution;
  return {
    total: e.invocations,
    segments: [
      { key: 'completed', count: e.completed },
      { key: 'failed', count: e.failed },
      { key: 'timedOut', count: e.timedOut },
      { key: 'notRun', count: e.notRun + e.missing },
      { key: 'unsupported', count: e.unsupported },
    ],
  };
};

/** 실패 · 시간 초과의 class · kind별 수. 많은 것부터. */
export const failureCounts = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));

export type ConfusionMatrix = {
  /** gold category. */
  rows: string[];
  /** 예측. gold와 같은 순서가 먼저, 그 밖의 예측, 마지막이 `__invalid__`. */
  columns: string[];
  cells: number[][];
  rowTotals: number[];
};

/** Go의 `category.confusion`을 표로 편다. 셈은 Go 값 그대로다. */
export const confusionMatrix = (q: ClassificationQuality): ConfusionMatrix => {
  const rows = Object.keys(q.confusion).sort();
  const predicted = new Set(rows.flatMap((r) => Object.keys(q.confusion[r])));
  const others = [...predicted].filter((p) => !rows.includes(p) && p !== INVALID_LABEL).sort();
  const columns = [...rows, ...others, ...(predicted.has(INVALID_LABEL) ? [INVALID_LABEL] : [])];
  const cells = rows.map((r) => columns.map((c) => q.confusion[r][c] ?? 0));
  return { rows, columns, cells, rowTotals: cells.map((row) => row.reduce((a, b) => a + b, 0)) };
};

/** label별 P · R · F1. gold가 있는 label을 support 순으로, gold가 없는 label은 뒤에 둔다. */
export const labelRows = (q: ClassificationQuality) =>
  Object.entries(q.labels)
    .map(([label, stats]) => ({ label, ...stats }))
    .sort((a, b) => b.support - a.support || (a.label < b.label ? -1 : 1));

export type CaseFilter = 'all' | 'quality-failed' | 'errors' | 'timed-out' | 'not-run';

export const CASE_FILTERS: Record<CaseFilter, string> = {
  all: '전체',
  'quality-failed': '품질 실패',
  errors: '실행 오류',
  'timed-out': '시간 초과',
  'not-run': '미실행',
};

export const parseCaseFilter = (value: unknown): CaseFilter =>
  typeof value === 'string' && value in CASE_FILTERS ? (value as CaseFilter) : 'all';

/** 필터에 맞는 case인지. 판정은 Go의 quality.outcome · execution.status 그대로다. */
export const matchesCaseFilter = (filter: CaseFilter, c: CaseResult) => {
  switch (filter) {
    case 'all':
      return true;
    case 'quality-failed':
      return c.quality.outcome === 'failed';
    case 'errors':
      return c.execution.status === 'failed' || c.execution.status === 'timed-out';
    case 'timed-out':
      return c.execution.status === 'timed-out';
    case 'not-run':
      return c.execution.status === 'not-run';
  }
};

export const caseFilterCounts = (cases: CaseResult[]) =>
  Object.fromEntries(
    (Object.keys(CASE_FILTERS) as CaseFilter[]).map((f) => [
      f,
      cases.filter((c) => matchesCaseFilter(f, c)).length,
    ]),
  ) as Record<CaseFilter, number>;

/** case 지표 하나를 값 순으로. 값이 없는 case는 이유와 함께 따로 둔다. */
export const caseMetric = (
  cases: CaseResult[],
  variantId: string,
  metric: string,
  order: 'desc' | 'asc' = 'desc',
) => {
  const mine = cases.filter((c) => c.variantId === variantId && c.trial === 1);
  const measured = mine
    .flatMap((c) => {
      const m = c.metrics[metric];
      return m?.availability === 'measured' ? [{ caseId: c.caseId, value: m.value }] : [];
    })
    .sort(
      (a, b) =>
        (order === 'desc' ? b.value - a.value : a.value - b.value) ||
        (a.caseId < b.caseId ? -1 : 1),
    );
  const missing = mine.flatMap((c) => {
    const m = c.metrics[metric];
    if (m?.availability === 'measured') return [];
    return [
      {
        caseId: c.caseId,
        availability: m?.availability ?? null,
        reason: m ? m.reason : 'no such metric for this case',
      },
    ];
  });
  return { measured, missing };
};
