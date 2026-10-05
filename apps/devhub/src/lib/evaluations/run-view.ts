import type { CaseResult, Measure, RunSummary, Task, VariantReport } from './contract';
import { type DisplayMeasure, formatMeasure, type MeasureUnit, qualityRows } from './presentation';

/**
 * run 상세의 read model. 값은 Go 요약 · case 결과 그대로이고, 여기서는 variant끼리 나란히 놓고 case를 묶기만 한다.
 * 어느 쪽이 나은지 · 무엇이 나빠졌는지는 여기서 판정하지 않는다 — 그것은 `pnpm eval compare`가 쓰는 comparison 산출물이다.
 * 선택은 URL — `?variant=` 자세히 볼 variant, `?show=` case 필터.
 */

export type Direction = 'higher' | 'lower';

type Column = {
  label: string;
  unit: MeasureUnit;
  /** 지표의 뜻(높을수록 좋은 값인지). 표 머리글의 설명이고 판정에 쓰지 않는다. */
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

export type SummaryRow = { report: VariantReport; cells: DisplayMeasure[] };

/** variant × 대표 지표, Go 값 그대로. */
export const summaryTable = (summary: RunSummary, task: Task) => {
  const columns = SUMMARY_COLUMNS[task];
  const rows: SummaryRow[] = summary.variants.map((report) => ({
    report,
    cells: columns.map((c) => {
      const measure = c.pick(report);
      return measure
        ? formatMeasure(measure, c.unit)
        : {
            text: '없음',
            missing: true,
            availability: 'unavailable',
            reason: '이 요약에 없는 지표',
          };
    }),
  }));
  return { columns, rows };
};

/** 이 run의 첫 variant를 기준으로 다른 variant를 짝 비교하는 Go 명령. 판정은 그 명령의 산출물이 한다. */
export const compareCommands = (runId: string, variantIds: string[]) =>
  variantIds
    .slice(1)
    .map(
      (id) => `pnpm eval compare --baseline ${runId}:${variantIds[0]} --candidate ${runId}:${id}`,
    );

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

export type MatrixFilter = 'all' | 'diff' | 'failed';

export const MATRIX_FILTERS: Record<MatrixFilter, string> = {
  all: '전체',
  diff: 'variant끼리 갈림',
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

/** case × variant(trial 1). 필터는 Go 판정으로 묶기만 한다 — 갈린 case, 모두 실패한 case. */
export const caseMatrix = (cases: CaseResult[], variantIds: string[]) => {
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
  const matches: Record<MatrixFilter, (row: MatrixRow) => boolean> = {
    all: () => true,
    diff: (row) => new Set(row.cells.map((cell) => cell?.outcome ?? 'none')).size > 1,
    failed: (row) =>
      row.cells.every((cell) => cell?.outcome === 'failed' || cell?.outcome === 'error'),
  };
  const counts = Object.fromEntries(
    (Object.keys(MATRIX_FILTERS) as MatrixFilter[]).map((f) => [f, rows.filter(matches[f]).length]),
  ) as Record<MatrixFilter, number>;
  return { rows, counts, matches };
};
