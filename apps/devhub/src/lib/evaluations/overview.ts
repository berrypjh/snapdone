import type { Measure, RunMetadata, RunSummary, Task, TrialQuality } from './contract';
import {
  type AnswerSource,
  answerSource,
  type DisplayMeasure,
  formatMeasure,
  primaryMetric,
  TASK_LABELS,
} from './presentation';
import type { EvaluationErrorKind, RunEntry } from './repository';

/**
 * `/evals` 개요의 read model. repository가 읽은 Go 산출물을 표 · 추세로 묶기만 하고 다시 채점하지 않는다.
 * 지표 값 · 완료 여부는 전부 Go 요약에서 온다.
 */

export const runHref = (id: string) => `/evals/runs/${id}`;

export type RunState = 'completed' | 'partial' | 'incomplete' | 'unreadable';

export const RUN_STATE: Record<RunState, { label: string; glyph: string }> = {
  completed: { label: '완료', glyph: '●' },
  partial: { label: '일부만 실행', glyph: '◐' },
  incomplete: { label: '실행 중 · 중단', glyph: '◇' },
  unreadable: { label: '읽을 수 없음', glyph: '×' },
};

export const ERROR_KIND: Record<EvaluationErrorKind, string> = {
  'not-found': '없음',
  'invalid-id': '잘못된 id',
  'invalid-artifact': '산출물 오류',
  'unsupported-schema': '모르는 schema 버전',
  incomplete: '미완료',
};

export type VariantCell = {
  id: string;
  model: string;
  provider: string;
  /** 답을 누가 냈는지 — 실제 모델 · 규칙 기준선 · 기록 재채점. */
  source: AnswerSource;
  /** trial 1의 대표 지표. 요약이 없으면 null. */
  metric: { label: string; display: DisplayMeasure } | null;
  /** 이 variant의 호출이 어떻게 끝났는지(Go 요약). 실패는 정확도 분모에 남아 0%로 보이므로 따로 알린다. */
  execution: { invocations: number; completed: number; errors: number; notRun: number } | null;
  /** 같은 비교 묶음에서 바로 앞의 run. 없으면 null. */
  previousRunId: string | null;
};

export type RunRow = {
  id: string;
  href: string;
  startedAt: string | null;
  task: Task | null;
  taskLabel: string;
  dataset: string | null;
  split: string | null;
  mode: RunMetadata['mode'] | null;
  state: RunState;
  abort: string | null;
  selected: number | null;
  trials: number | null;
  /** 모든 variant의 실행 수를 더한 것. 요약이 없으면 null. */
  execution: {
    completed: number;
    failed: number;
    timedOut: number;
    notRun: number;
    unsupported: number;
  } | null;
  variants: VariantCell[];
  error: { kind: string; message: string } | null;
};

const datasetLabel = (m: RunMetadata) => `${m.dataset.name} v${m.dataset.version}`;

/**
 * 추세를 이을 수 있는 run의 묶음 키. 같은 task · dataset(이름 · 버전) · split · 고른 case(selection hash) · mode ·
 * 채점 규칙 · label 목록이어야 하고, variant가 같아야 한 선이 된다. 정식 비교는 여전히 `pnpm eval compare`다.
 */
const seriesKey = (m: RunMetadata, variantId: string) =>
  [
    m.task,
    m.dataset.name,
    m.dataset.version,
    m.dataset.split,
    m.dataset.selectionHash,
    m.mode,
    m.policy.version,
    m.labelContractHash,
    variantId,
  ].join('|');

export type TrendPoint = {
  runId: string;
  href: string;
  startedAt: string;
  measure: Measure;
  display: DisplayMeasure;
  /** 선에 올릴 값. 값이 없으면 null이고 선은 끊긴다(0으로 그리지 않는다). */
  value: number | null;
};

export type TrendSeries = {
  key: string;
  task: Task;
  taskLabel: string;
  dataset: string;
  split: string;
  mode: RunMetadata['mode'];
  policy: string;
  variantId: string;
  model: string;
  metric: {
    label: string;
    unit: ReturnType<typeof primaryMetric>['unit'];
    direction: ReturnType<typeof primaryMetric>['direction'];
  };
  /** 오래된 것부터. */
  points: TrendPoint[];
  /** 채점기 build(evaluatorHash) 수. 1보다 크면 지표 정의가 달랐을 수 있다. */
  evaluatorBuilds: number;
};

export type TrendOverview = {
  /** 두 run 이상인 묶음. 한 run뿐인 묶음은 이을 것이 없다. */
  series: TrendSeries[];
  /** 추세에서 뺀 partial run 수 — 실행되지 않은 case가 오답으로 세여 추세를 왜곡한다. */
  excludedPartial: number;
  /** 실패한 것만 다시 실행한 run이 대신하는 원래 run 수. 옮긴 결과가 두 점으로 찍히지 않게 뺀다. */
  excludedRetried: number;
};

type ReadyRun = Extract<RunEntry, { state: 'ready' }>;

const variantExecution = (summary: RunSummary, variantId: string) => {
  const e = summary.variants.find((v) => v.variant.id === variantId)?.execution;
  return e
    ? {
        invocations: e.invocations,
        completed: e.completed,
        errors: e.failed + e.timedOut,
        notRun: e.notRun + e.missing,
      }
    : null;
};

const firstTrial = (summary: RunSummary, variantId: string): TrialQuality | null =>
  summary.variants.find((v) => v.variant.id === variantId)?.quality[0] ?? null;

/** 완료된 run만, 시작 순으로 variant별 선을 만든다. */
export const trendOverview = (entries: RunEntry[]): TrendOverview => {
  const ready = entries.filter((e): e is ReadyRun => e.state === 'ready');
  const complete = ready
    .filter((e) => e.metadata.status === 'completed')
    .sort(
      (a, b) =>
        Date.parse(a.metadata.startedAt) - Date.parse(b.metadata.startedAt) ||
        (a.id < b.id ? -1 : 1),
    );
  // 다시 실행한 run에는 원래 run의 성공 결과가 그대로 옮겨져 있고, 원래 run의 실패는 성능이 아니다.
  const retried = new Set(complete.flatMap((r) => r.metadata.retriedFrom ?? []));
  const groups = new Map<string, TrendSeries & { builds: Set<string> }>();
  for (const run of complete.filter((r) => !retried.has(r.id))) {
    for (const v of run.metadata.variants) {
      const trial = firstTrial(run.summary, v.id);
      if (!trial) continue;
      const metric = primaryMetric(trial);
      const key = seriesKey(run.metadata, v.id);
      let series = groups.get(key);
      if (!series) {
        series = {
          key,
          task: run.metadata.task,
          taskLabel: TASK_LABELS[run.metadata.task],
          dataset: datasetLabel(run.metadata),
          split: run.metadata.dataset.split,
          mode: run.metadata.mode,
          policy: run.metadata.policy.version,
          variantId: v.id,
          model: v.model,
          metric: { label: metric.label, unit: metric.unit, direction: metric.direction },
          points: [],
          evaluatorBuilds: 0,
          builds: new Set(),
        };
        groups.set(key, series);
      }
      series.builds.add(run.metadata.source.evaluatorHash);
      const measured =
        metric.measure.availability === 'measured' || metric.measure.availability === 'partial';
      series.points.push({
        runId: run.id,
        href: runHref(run.id),
        startedAt: run.metadata.startedAt,
        measure: metric.measure,
        display: formatMeasure(metric.measure, metric.unit),
        value: measured ? metric.measure.value : null,
      });
    }
  }
  const series = [...groups.values()]
    .filter((s) => s.points.length >= 2)
    .map(({ builds, ...s }) => ({ ...s, evaluatorBuilds: builds.size }));
  return {
    series,
    excludedPartial: ready.length - complete.length,
    excludedRetried: complete.filter((r) => retried.has(r.id)).length,
  };
};

/** 같은 묶음에서 이 run 바로 앞의 완료 run. */
const previousRuns = (trend: TrendOverview) => {
  const previous = new Map<string, string>();
  for (const s of trend.series) {
    s.points.forEach((p, i) => {
      if (i > 0) previous.set(`${p.runId}|${s.variantId}`, s.points[i - 1].runId);
    });
  }
  return previous;
};

const stateOf = (entry: RunEntry): RunState => {
  if (entry.state === 'ready') return entry.metadata.status === 'partial' ? 'partial' : 'completed';
  return entry.error.kind === 'incomplete' ? 'incomplete' : 'unreadable';
};

const executionOf = (summary: RunSummary) =>
  summary.variants.reduce(
    (sum, v) => ({
      completed: sum.completed + v.execution.completed,
      failed: sum.failed + v.execution.failed,
      timedOut: sum.timedOut + v.execution.timedOut,
      notRun: sum.notRun + v.execution.notRun + v.execution.missing,
      unsupported: sum.unsupported + v.execution.unsupported,
    }),
    { completed: 0, failed: 0, timedOut: 0, notRun: 0, unsupported: 0 },
  );

/** repository의 목록 순서(최근 시작 먼저) 그대로 표의 줄을 만든다. */
export const runRows = (entries: RunEntry[], trend = trendOverview(entries)): RunRow[] => {
  const previous = previousRuns(trend);
  return entries.map((entry) => {
    const m = entry.metadata;
    const summary = entry.state === 'ready' ? entry.summary : null;
    return {
      id: entry.id,
      href: runHref(entry.id),
      startedAt: m?.startedAt ?? null,
      task: m?.task ?? null,
      taskLabel: m ? TASK_LABELS[m.task] : '알 수 없음',
      dataset: m ? datasetLabel(m) : null,
      split: m?.dataset.split ?? null,
      mode: m?.mode ?? null,
      state: stateOf(entry),
      abort: summary?.abort ?? null,
      selected: m?.dataset.caseCount ?? null,
      trials: m?.trials ?? null,
      execution: summary ? executionOf(summary) : null,
      variants: (m ? m.variants.map((v) => ({ v, source: answerSource(m.mode, v) })) : []).map(
        ({ v, source }) => {
          const trial = summary ? firstTrial(summary, v.id) : null;
          const metric = trial ? primaryMetric(trial) : null;
          return {
            id: v.id,
            model: v.model,
            provider: v.provider,
            source,
            execution: summary ? variantExecution(summary, v.id) : null,
            metric: metric && {
              label: metric.label,
              display: formatMeasure(metric.measure, metric.unit),
            },
            previousRunId: previous.get(`${entry.id}|${v.id}`) ?? null,
          };
        },
      ),
      error:
        entry.state === 'error'
          ? { kind: ERROR_KIND[entry.error.kind], message: entry.error.message }
          : null,
    };
  });
};

export type RunFilter = { task: Task | null; dataset: string | null };

/** 과제 하나의 평가 화면. */
export const evalTaskHref = (task: Task) => `/evals/tasks/${task}`;

/** 쿼리 값을 알려진 task · 있는 dataset으로만 받는다. 그 밖의 값은 필터 없음이다. */
export const parseFilter = (rows: RunRow[], task: unknown, dataset: unknown): RunFilter => ({
  task: typeof task === 'string' && task in TASK_LABELS ? (task as Task) : null,
  dataset: typeof dataset === 'string' && rows.some((r) => r.dataset === dataset) ? dataset : null,
});

export const matchesFilter = (filter: RunFilter, task: Task | null, dataset: string | null) =>
  (!filter.task || task === filter.task) && (!filter.dataset || dataset === filter.dataset);

/** 필터 선택지 — 목록에 실제로 있는 task · dataset만. */
export const filterOptions = (rows: RunRow[]) => ({
  tasks: [...new Set(rows.flatMap((r) => (r.task ? [r.task] : [])))].sort(),
  datasets: [...new Set(rows.flatMap((r) => (r.dataset ? [r.dataset] : [])))].sort(),
});

/** 표에 보일 시각. 서버 시간대와 무관하게 UTC로 적는다. */
export const formatStartedAt = (iso: string) => {
  const time = new Date(iso);
  return Number.isNaN(time.getTime())
    ? iso
    : `${time.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
