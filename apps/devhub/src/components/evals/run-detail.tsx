import Link from 'next/link';

import type { ReactNode } from 'react';

import type { CaseResult, VariantReport } from '@/lib/evaluations/contract';
import { parseCaseFilter } from '@/lib/evaluations/detail';
import { ERROR_KIND, formatStartedAt, runHref } from '@/lib/evaluations/overview';
import {
  type AnswerSource,
  answerSource,
  experimentLabel,
  TASK_LABELS,
} from '@/lib/evaluations/presentation';
import type { EvaluationArtifactError, RunDetail } from '@/lib/evaluations/repository';
import { parseMatrixFilter } from '@/lib/evaluations/run-view';

import { WorkspaceSection } from '../shell/workspace';
import { Icon } from '../ui/icon';

import { CaseTable } from './detail/case-table';
import { ExecutionHealth, Failures, Latency, Usage } from './detail/common-sections';
import { KeyMetrics, MetricList, qualityGroups, TaskInsights } from './detail/task-insights';
import {
  AllMetricsTable,
  CaseMatrix,
  type RunView,
  SummaryTable,
  viewHref,
} from './run/compare-sections';
import { RetryGuide } from './run/retry-guide';
import { AnswerSourceChip } from './answer-source-chip';
import { RunStateChip } from './run-state-chip';

function Facts({ facts }: { facts: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 typo-body-small">
      {facts.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-text-light">{term}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** variant 안의 한 묶음. 제목 아래 한 줄로 무엇을 보는지 말한다. */
function Sub({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-stroke-light pt-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="typo-body-small-strong">{title}</h3>
        {note && <p className="typo-caption-small text-text-light">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** 경고 한 줄. 색만이 아니라 아이콘과 글자로 알린다. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 typo-caption-small text-text-warning">
      <Icon name="warning" className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

/** 공급자가 답에 적은 모델. 요청과 다른 모델이 답했으면 먼저 알린다. */
function AnsweredModels({
  models,
  source,
}: {
  models: VariantReport['models'];
  source: AnswerSource;
}) {
  if (source === 'rule') {
    return (
      <p className="typo-caption-small">
        답한 모델 — 없음. 모델 없이 규칙이 답함
        {models && ` (${Object.values(models.answered).reduce((a, b) => a + b, 0)}번)`}
      </p>
    );
  }
  if (!models) {
    return (
      <p className="typo-caption-small text-text-light">
        답한 모델 — 기록 없음(모델 이름이 없는 replay 기록이거나 부른 호출이 없음)
      </p>
    );
  }
  const answered = Object.entries(models.answered).sort(([a], [b]) => a.localeCompare(b));
  return (
    <p className="typo-caption-small">
      답한 모델:{' '}
      {answered.length > 0 ? answered.map(([name, n]) => `${name} ${n}번`).join(' · ') : '없음'}
      {models.unknown > 0 && ` · 이름 없음 ${models.unknown}번`}
      {models.different > 0 && (
        <span className="text-text-warning"> · 요청과 다른 모델이 답함 {models.different}번</span>
      )}
    </p>
  );
}

/** 고른 variant 하나 — 누가 답했나 → 지표 묶음 → 무엇이 틀리나 → 실행 · 지연 · 사용량(접힘) → case. 지표는 trial 1이다. */
function VariantDetail({
  report,
  cases,
  run,
  view,
}: {
  report: VariantReport;
  cases: CaseResult[];
  run: RunDetail;
  view: RunView;
}) {
  const [trial] = report.quality;
  const { mode, policy } = run.metadata;
  const source = answerSource(mode, report.variant);
  const experiment = experimentLabel(report.variant);
  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <AnswerSourceChip source={source} />
        <p className="typo-caption-small text-text-light">
          {report.variant.provider} · {report.variant.model} · adapter {report.variant.adapter} ·
          trials {report.trials}
          {report.trials > 1 && ' — 지표는 trial 1'}
        </p>
        <AnsweredModels models={report.models} source={source} />
        {experiment && <p className="typo-caption-small">실험 — {experiment}</p>}
      </div>
      {trial && (
        <>
          <Sub title="한눈에" note="대표 지표. 자세한 값과 뜻은 아래 묶음에">
            <KeyMetrics trial={trial} />
          </Sub>
          {qualityGroups(trial).map((g) => (
            <Sub key={g.group} title={g.title} note={g.note}>
              <MetricList rows={g.rows} />
            </Sub>
          ))}
          <Sub title={`${TASK_LABELS[run.metadata.task]} — 무엇이 틀리나`}>
            <TaskInsights
              trial={trial}
              cases={cases}
              variantId={report.variant.id}
              policy={policy.version}
            />
          </Sub>
        </>
      )}
      <Sub title="실행 · 지연 · 사용량" note="고른 일을 끝냈는지와 비용 — 채점과 별개">
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer typo-body-small text-text-link">펼치기</summary>
          <div className="mt-2 flex flex-col gap-4">
            <ExecutionHealth report={report} />
            <Latency report={report} mode={mode} />
            <Usage report={report} />
            <Failures report={report} />
          </div>
        </details>
      </Sub>
      <Sub title="case" note="이 variant의 case. 펼치면 정답 · 예측 · 판정 · 지표">
        <CaseTable
          hrefOf={(f) => viewHref(run.id, { ...view, cases: f }, 'run-variant')}
          task={run.metadata.task}
          cases={cases}
          filter={view.cases}
          showVariant={false}
        />
      </Sub>
    </>
  );
}

const PICK =
  'inline-flex min-h-8 items-center rounded-md px-2 typo-caption-small text-text-link hover:bg-background-default aria-[current=true]:bg-(--ds-background-selected) aria-[current=true]:text-text-default aria-[current=true]:typo-body-small-strong';

/** URL의 선택을 이 run의 variant로만 받는다. 모르는 값은 첫 variant다. */
export const parseRunView = (
  run: RunDetail,
  query: { variant?: unknown; show?: unknown; cases?: unknown },
): RunView => {
  const ids = run.summary.variants.map((r) => r.variant.id);
  const variant =
    typeof query.variant === 'string' && ids.includes(query.variant) ? query.variant : ids[0];
  return { variant, show: parseMatrixFilter(query.show), cases: parseCaseFilter(query.cases) };
};

/** run 하나. 무엇이 성공하고 무엇이 왜 실패했는지를 위에서 아래로 좁혀 간다. 값은 전부 Go 산출물이다. */
export function RunDetailView({
  run,
  view = parseRunView(run, {}),
}: {
  run: RunDetail;
  view?: RunView;
}) {
  const { metadata: m, summary } = run;
  const ids = summary.variants.map((r) => r.variant.id);
  const selected =
    summary.variants.find((r) => r.variant.id === view.variant) ?? summary.variants[0];
  const sources = m.variants.map((v) => answerSource(m.mode, v));
  const carried = (id: string) =>
    summary.variants.find((r) => r.variant.id === id)?.execution.carried ?? 0;
  return (
    <>
      <WorkspaceSection id="run-overview" title="실행">
        {!sources.includes('model') && (
          <Warning>
            실제 모델 호출 없음 — 아래 지표는 {sources.includes('rule') && '모델 없는 규칙이 낸 답'}
            {sources.includes('rule') && sources.includes('recorded') && ' · '}
            {sources.includes('recorded') && '파일에 적힌 예측'}을 채점한 값이고 모델 성능 아님
          </Warning>
        )}
        <Facts
          facts={[
            [
              '상태',
              <RunStateChip
                key="state"
                state={summary.status === 'partial' ? 'partial' : 'completed'}
              />,
            ],
            ['과제', TASK_LABELS[m.task]],
            [
              'dataset',
              `${m.dataset.name} v${m.dataset.version} · ${m.dataset.split} · ${m.dataset.tier} · ${m.dataset.caseCount} case`,
            ],
            [
              'variant · 답 출처',
              <ul key="variants" className="flex flex-col gap-1.5">
                {m.variants.map((v, i) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="devhub-code">{v.id}</span>
                    <AnswerSourceChip source={sources[i]} />
                    <span className="typo-caption-small text-text-light">
                      {v.provider} · {v.model}
                      {carried(v.id) > 0 && ` · ${carried(v.id)}개 옮김`}
                    </span>
                  </li>
                ))}
              </ul>,
            ],
            [
              'mode',
              m.mode === 'live' ? 'live — 이 run에서 실행' : 'replay — 기록을 다시 채점, 호출 없음',
            ],
            ...(m.retriedFrom
              ? [
                  [
                    '이어서 실행',
                    <span key="retried">
                      <Link
                        href={runHref(m.retriedFrom)}
                        className="devhub-code text-text-link underline-offset-2 hover:underline"
                      >
                        {m.retriedFrom}
                      </Link>
                      에서 실패한 것만 다시 부름 — 성공한 결과는 호출 없이 옮겨 지금 채점기로 다시
                      채점
                    </span>,
                  ] as [string, ReactNode],
                ]
              : []),
            [
              '시작 · 끝',
              <span key="time">
                <time dateTime={m.startedAt}>{formatStartedAt(m.startedAt)}</time>
                {' → '}
                {m.finishedAt ? (
                  <time dateTime={m.finishedAt}>{formatStartedAt(m.finishedAt)}</time>
                ) : (
                  '끝나지 않음'
                )}
              </span>,
            ],
            [
              'source',
              <span key="source" className="devhub-code">
                {m.source.commit.slice(0, 12)}
                {m.source.dirty && ' (commit 뒤 로컬 변경 있음)'}
              </span>,
            ],
            [
              '채점 규칙',
              <code key="policy" className="devhub-code">
                {m.policy.version}
              </code>,
            ],
            ['중단', summary.abort ?? '없음'],
            [
              '공식 benchmark',
              summary.officialEligible ? '해당' : `아님 — ${summary.reasons.join('; ')}`,
            ],
          ]}
        />
      </WorkspaceSection>
      <RetryGuide run={run} />
      <WorkspaceSection id="run-compare" title={`variant 비교 ${ids.length}개`}>
        <SummaryTable runId={run.id} summary={summary} task={m.task} mode={m.mode} view={view} />
        <AllMetricsTable summary={summary} />
      </WorkspaceSection>
      {ids.length > 1 && (
        <WorkspaceSection id="run-cases-matrix" title="case별 결과">
          <p className="typo-caption-small text-text-light">
            같은 case를 variant마다 나란히 — variant끼리 갈린 case부터 확인
          </p>
          <CaseMatrix runId={run.id} cases={run.cases} variantIds={ids} view={view} />
        </WorkspaceSection>
      )}
      <WorkspaceSection id="run-variant" title={`variant 자세히 — ${selected.variant.id}`}>
        {ids.length > 1 && (
          <nav aria-label="자세히 볼 variant">
            <ul className="flex flex-wrap gap-1">
              {ids.map((id) => (
                <li key={id}>
                  <Link
                    href={viewHref(run.id, { ...view, variant: id, cases: 'all' }, 'run-variant')}
                    aria-current={id === selected.variant.id ? 'true' : undefined}
                    className={`devhub-code ${PICK}`}
                  >
                    {id === selected.variant.id && <span aria-hidden="true">✓&nbsp;</span>}
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <VariantDetail
          report={selected}
          cases={run.cases.filter((c) => c.variantId === selected.variant.id)}
          run={run}
          view={view}
        />
      </WorkspaceSection>
      <p className="typo-body-small">
        <Link href="/evals" className="text-text-link underline-offset-2 hover:underline">
          평가 개요로 돌아가기
        </Link>
      </p>
    </>
  );
}

/** 읽지 못한 run. 무엇이 왜 안 되는지와 파일 위치를 그대로 보여 준다. */
export function RunProblem({ error }: { error: EvaluationArtifactError }) {
  return (
    <WorkspaceSection id="run-problem" title={`읽을 수 없음 — ${ERROR_KIND[error.kind]}`}>
      <p role="alert" className="typo-body-small">
        {error.message}
      </p>
      {error.path && <p className="devhub-code text-text-light">{error.path}</p>}
      <p className="typo-body-small">
        <Link href="/evals" className="text-text-link underline-offset-2 hover:underline">
          평가 개요로 돌아가기
        </Link>
      </p>
    </WorkspaceSection>
  );
}
