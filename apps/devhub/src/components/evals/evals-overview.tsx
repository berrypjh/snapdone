import Link from 'next/link';

import { FilterEmpty, Icon, WorkspaceSection } from '@berrypjh/devhub-ui';
import { Button, VisuallyHidden } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { comparisonHref } from '@/lib/evaluations/comparison';
import type { Task } from '@/lib/evaluations/contract';
import {
  ERROR_KIND,
  evalTaskHref,
  matchesFilter,
  RUN_STATE,
  type RunFilter,
  type RunRow,
  type RunState,
  type TrendOverview,
} from '@/lib/evaluations/overview';
import {
  ANSWER_SOURCE,
  type AnswerSource,
  TASK_LABELS,
  TASK_NOTES,
} from '@/lib/evaluations/presentation';
import type { ComparisonEntry } from '@/lib/evaluations/repository';

import { FilterBar } from '../entity/filter-bar';

import { AnswerSourceChip } from './answer-source-chip';
import { RunList } from './run-list';
import { RunStateChip } from './run-state-chip';
import { TrendChart } from './trend-chart';

const REPLAY_EXAMPLE =
  'pnpm eval replay --dataset sample-classification --variant replay-example --predictions tools/evals/predictions/sample-classification.jsonl --run-id demo';
const COMPARE_EXAMPLE = 'pnpm eval compare --baseline <run>:<variant> --candidate <run>:<variant>';

const LINK = 'text-text-link underline-offset-2 hover:underline';
const STATES: RunState[] = ['completed', 'partial', 'incomplete', 'unreadable'];
const SOURCES: AnswerSource[] = ['model', 'rule', 'recorded'];

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-md bg-background-default p-3 devhub-code">{children}</pre>
);

/** 목록 한 줄 — 왼쪽 라벨, 오른쪽 수. 개요 화면의 "시나리오 상태"와 같은 모양이다. */
function CountRow({ label, count, name }: { label: ReactNode; count: number; name: string }) {
  return (
    <li className="flex items-center justify-between">
      {label}
      <span className="typo-body-small">
        {count}
        <VisuallyHidden> 개 — {name}</VisuallyHidden>
      </span>
    </li>
  );
}

/** run 수를 상태와 답 출처로 센다. 없는 칸은 빼지 않는다 — 0도 정보다. */
function Summary({ rows }: { rows: RunRow[] }) {
  const sourceCount = (source: AnswerSource) =>
    rows.filter((r) => r.variants.some((v) => v.source === source)).length;
  return (
    <WorkspaceSection id="evals-summary" title={`run ${rows.length}개`}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="typo-caption-small text-text-light">실행 상태</h3>
          <ul className="flex flex-col gap-2">
            {STATES.map((state) => (
              <CountRow
                key={state}
                label={<RunStateChip state={state} />}
                count={rows.filter((r) => r.state === state).length}
                name={RUN_STATE[state].label}
              />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="typo-caption-small text-text-light">
            답 출처 — 그 출처의 variant가 있는 run
          </h3>
          <ul className="flex flex-col gap-2">
            {SOURCES.map((source) => (
              <CountRow
                key={source}
                label={<AnswerSourceChip source={source} />}
                count={sourceCount(source)}
                name={ANSWER_SOURCE[source].label}
              />
            ))}
          </ul>
        </div>
      </div>
      {sourceCount('model') === 0 && (
        <p className="flex items-start gap-1.5 typo-caption-small text-text-warning">
          <Icon name="warning" className="mt-0.5" />
          실제 모델을 호출한 run 없음 — 지금 지표는 모두 규칙 기준선이나 기록 재채점의 값이고 모델
          성능 아님
        </p>
      )}
    </WorkspaceSection>
  );
}

function Comparisons({ comparisons }: { comparisons: ComparisonEntry[] }) {
  return (
    <WorkspaceSection id="evals-comparisons" title={`저장된 비교 ${comparisons.length}개`}>
      {comparisons.length === 0 ? (
        <>
          <p className="typo-caption-small text-text-light">
            없음 — 두 run의 짝 비교는 아래 명령으로 만듦
          </p>
          <Code>{COMPARE_EXAMPLE}</Code>
        </>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-light">
          {comparisons.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <Link href={comparisonHref(entry.id)} className={`devhub-code ${LINK}`}>
                {entry.id}
              </Link>
              {entry.state === 'ready' ? (
                <p className="typo-caption-small text-text-light">
                  <span className="devhub-code">{entry.comparison.baseline.runId}</span> →{' '}
                  <span className="devhub-code">{entry.comparison.candidate.runId}</span> ·{' '}
                  {entry.comparison.comparable ? '비교 가능' : '× 비교 불가'}
                  {entry.comparison.gate?.applicable &&
                    ` · gate ${entry.comparison.gate.passed ? '● 통과' : '× 실패'}`}
                </p>
              ) : (
                <p className="typo-caption-small text-text-light">
                  × 읽을 수 없음 — {ERROR_KIND[entry.error.kind]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </WorkspaceSection>
  );
}

function Trend({ trend, filter }: { trend: TrendOverview; filter: RunFilter }) {
  const series = trend.series.filter((s) => matchesFilter(filter, s.task, s.dataset));
  return (
    <WorkspaceSection id="evals-trend" title="품질 추세">
      <p className="typo-caption-small text-text-light">
        같은 과제 · dataset 버전 · split · 고른 case · mode · 채점 규칙 · label 목록 · variant인
        완료 run만 한 선으로 이음. 일부만 실행된 run은 제외
        {trend.excludedPartial > 0 && `(${trend.excludedPartial}개)`}. 실패한 것만 다시 실행했으면
        다시 실행한 run 하나로 셈
        {trend.excludedRetried > 0 && `(원래 run ${trend.excludedRetried}개 제외)`}
      </p>
      {series.length === 0 ? (
        <p className="typo-body-small text-text-light">
          이을 수 있는 추세 없음 — 비교 가능한 완료 run이 둘 이상인 묶음이 없음
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {series.map((s, i) => (
            <TrendChart key={s.key} series={s} id={`evals-trend-${i}`} />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
}

/** 이보다 많은 dataset은 버튼 줄 대신 선택 목록으로 고른다. */
const DATASET_BUTTONS = 6;

/**
 * dataset이 많을 때의 필터. 일반 GET 폼이라 JavaScript 없이도 되고, 과제 필터(있으면)는 hidden으로 지킨다.
 */
function DatasetPicker({
  basePath,
  datasets,
  current,
  task,
}: {
  basePath: string;
  datasets: string[];
  current: string | null;
  task: Task | null;
}) {
  return (
    <form action={basePath} method="get" className="flex flex-wrap items-end gap-2">
      {task && <input type="hidden" name="task" value={task} />}
      <label className="flex flex-col gap-1 typo-caption-small text-text-light">
        dataset {datasets.length}개
        <select
          name="dataset"
          defaultValue={current ?? ''}
          className="min-h-8 rounded-md border border-stroke-light bg-background-surface px-2 typo-body-small text-text-default"
        >
          <option value="">전체</option>
          {datasets.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" variant="outlined">
        보기
      </Button>
    </form>
  );
}

export type EvalsOverviewProps = {
  rows: RunRow[];
  /** 저장된 비교(`results/comparisons`). 읽지 못한 것도 이유와 함께 남는다. */
  comparisons?: ComparisonEntry[];
  trend: TrendOverview;
  filter: RunFilter;
  options: { tasks: Task[]; datasets: string[] };
  /** 과제 화면이면 그 과제. 과제 필터를 숨기고 링크를 그 화면 기준으로 만든다. */
  task?: Task;
};

/** `/evals`의 본문. 요약 → run 목록 → 비교 → 추세 순서로 좁혀 간다. 값은 Go 산출물 그대로다. */
export function EvalsOverview({
  rows,
  trend,
  filter,
  options,
  comparisons = [],
  task,
}: EvalsOverviewProps) {
  const basePath = task ? evalTaskHref(task) : '/evals';
  if (rows.length === 0) {
    return (
      <WorkspaceSection id="evals-empty" title="평가 run 없음">
        <p className="typo-caption-small text-text-light">
          <code className="devhub-code">tools/evals/results</code>가 비어 있음 — 모델을 부르지 않는
          replay로 하나 만들 수 있음
        </p>
        <Code>{REPLAY_EXAMPLE}</Code>
        <p className="typo-caption-small text-text-light">
          세 과제의 데모 명령 — <code className="devhub-code">tools/evals/README.md</code>
        </p>
      </WorkspaceSection>
    );
  }

  const visible = rows.filter((r) => matchesFilter(filter, r.task, r.dataset));
  // 과제 화면이면 그 과제의 run이 있는 dataset만. 많으면 버튼 줄 대신 선택 목록으로.
  const datasetOptions = task
    ? [
        ...new Set(
          rows.filter((r) => r.task === task).flatMap((r) => (r.dataset ? [r.dataset] : [])),
        ),
      ].sort()
    : options.datasets;
  const manyDatasets = datasetOptions.length > DATASET_BUTTONS;
  const groups = [
    ...(task
      ? []
      : [
          {
            param: 'task',
            label: '과제',
            options: options.tasks.map((t) => ({ value: t, label: TASK_LABELS[t] })),
          },
        ]),
    ...(manyDatasets
      ? []
      : [
          {
            param: 'dataset',
            label: 'dataset',
            options: datasetOptions.map((dataset) => ({ value: dataset, label: dataset })),
          },
        ]),
  ];
  return (
    <>
      <p className="typo-body-small">
        {task ? TASK_NOTES[task] : '세 과제의 모든 run'}.{' '}
        <span className="text-text-light">
          값은 <code className="devhub-code">tools/evals/results</code>에 Go가 쓴 산출물 그대로
        </span>
      </p>
      {groups.length > 0 && (
        <FilterBar
          basePath={basePath}
          groups={groups}
          active={{ task: filter.task ?? undefined, dataset: filter.dataset ?? undefined }}
        />
      )}
      {manyDatasets && (
        <DatasetPicker
          basePath={basePath}
          datasets={datasetOptions}
          current={filter.dataset}
          task={task ? null : filter.task}
        />
      )}
      <Summary rows={visible} />
      <WorkspaceSection id="evals-runs" title={`최근 run ${visible.length}개`}>
        {visible.length === 0 ? (
          <FilterEmpty message="없음 — 이 필터에 맞는 run 없음" clearHref={basePath} />
        ) : (
          <RunList rows={visible} />
        )}
      </WorkspaceSection>
      <Comparisons
        comparisons={comparisons.filter(
          (e) => !task || (e.state === 'ready' && e.comparison.baselineVariant.task === task),
        )}
      />
      <Trend trend={trend} filter={filter} />
    </>
  );
}
