import Link from 'next/link';

import { Icon, WorkspaceSection } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { AXIS_LABELS } from '@/lib/evaluations/comparison';
import type { Comparison, Mode, RunRef, Variant } from '@/lib/evaluations/contract';
import { runHref } from '@/lib/evaluations/overview';
import { answerSource, experimentLabel, TASK_LABELS } from '@/lib/evaluations/presentation';

import { AnswerSourceChip } from '../answer-source-chip';

import { AxisTable } from './axis-table';
import { CaseChanges } from './case-changes';
import { GatePanel } from './gate-panel';
import { LabelDeltas } from './label-deltas';

function Side({
  run,
  variant,
  exists,
  mode,
}: {
  run: RunRef;
  variant: Variant;
  exists: boolean;
  mode: Mode | null;
}) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span>
        {exists ? (
          <Link
            href={runHref(run.runId)}
            className="devhub-code text-text-link underline-offset-2 hover:underline"
          >
            {run.runId}
          </Link>
        ) : (
          <span className="devhub-code">{run.runId}</span>
        )}{' '}
        · variant <span className="devhub-code">{variant.id}</span> · trial {run.trial}
        {!exists && (
          <span className="typo-caption-small text-text-light"> (이 저장소의 결과에 없음)</span>
        )}
      </span>
      <span className="typo-caption-small text-text-light">
        {variant.provider} · {variant.model}
        {experimentLabel(variant) && ` · ${experimentLabel(variant)}`}
      </span>
      {mode ? (
        <AnswerSourceChip source={answerSource(mode, variant)} />
      ) : (
        <span className="typo-caption-small text-text-light">
          답 출처 — run이 이 저장소에 없어 알 수 없음
        </span>
      )}
    </span>
  );
}

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

/**
 * Go가 저장한 comparison.json을 그대로 보인다. 비교 가능 여부 · 차이 · 판정 · gate는 모두 Go 값이고, 비교할 수
 * 없으면 이유만 두고 차이를 그리지 않는다. 결론은 서술이고 통계적 유의성을 주장하지 않는다.
 */
export function ComparisonView({
  comparison: c,
  runExists,
  runMode = () => null,
}: {
  comparison: Comparison;
  runExists: (runId: string) => boolean;
  /** run의 mode. 답 출처(실제 모델 · 규칙 · 기록)를 가리는 데 쓴다. run이 없으면 null. */
  runMode?: (runId: string) => Mode | null;
}) {
  const baseline = {
    runId: c.baseline.runId,
    href: runExists(c.baseline.runId) ? runHref(c.baseline.runId) : null,
  };
  const candidate = {
    runId: c.candidate.runId,
    href: runExists(c.candidate.runId) ? runHref(c.candidate.runId) : null,
  };
  return (
    <>
      <WorkspaceSection id="compare-overview" title="무엇을 비교했나">
        <Facts
          facts={[
            [
              'baseline',
              <Side
                key="b"
                run={c.baseline}
                variant={c.baselineVariant}
                exists={!!baseline.href}
                mode={runMode(c.baseline.runId)}
              />,
            ],
            [
              'candidate',
              <Side
                key="c"
                run={c.candidate}
                variant={c.candidateVariant}
                exists={!!candidate.href}
                mode={runMode(c.candidate.runId)}
              />,
            ],
            ['과제', TASK_LABELS[c.baselineVariant.task]],
            [
              'dataset',
              `${c.dataset.name} v${c.dataset.version} · ${c.dataset.split} · ${c.dataset.caseCount} case`,
            ],
            [
              '고른 case',
              <span key="selection" className="devhub-code" title={c.dataset.selectionHash}>
                selection {c.dataset.selectionHash.slice(0, 12)}
              </span>,
            ],
            [
              '채점 규칙',
              <code key="policy" className="devhub-code">
                {c.policy.version}
              </code>,
            ],
            ['비교 가능', c.comparable ? '● 비교 가능' : '× 비교 불가'],
          ]}
        />
        {c.warnings.length > 0 && (
          <ul aria-label="비교 경고" className="flex flex-col gap-1">
            {c.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 typo-caption-small text-text-warning">
                <Icon name="warning" className="mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="typo-body-small">{c.conclusion}</p>
        <p className="typo-caption-small text-text-light">
          서술 비교 — 통계적 유의성이나 우열은 주장하지 않음. 정식 판정은 아래 gate가 있을 때만
        </p>
      </WorkspaceSection>

      <WorkspaceSection id="compare-gate" title="gate">
        <GatePanel gate={c.gate} />
      </WorkspaceSection>

      {!c.comparable ? (
        <WorkspaceSection id="compare-incomparable" title="비교할 수 없는 이유">
          <ul className="flex flex-col gap-1 typo-body-small">
            {c.incomparable.map((reason) => (
              <li key={reason} className="break-words">
                {reason}
              </li>
            ))}
          </ul>
          <p className="typo-caption-small text-text-light">
            두 run이 같은 것을 재지 않아 차이는 보이지 않음
          </p>
        </WorkspaceSection>
      ) : (
        <>
          {c.axes.map((axis) => (
            <WorkspaceSection
              key={axis.axis}
              id={`compare-${axis.axis}`}
              title={`${AXIS_LABELS[axis.axis] ?? axis.axis} 차이`}
            >
              <AxisTable axis={axis} />
            </WorkspaceSection>
          ))}
          {c.labels.length > 0 && (
            <WorkspaceSection id="compare-labels" title="category별 차이">
              <LabelDeltas labels={c.labels} />
            </WorkspaceSection>
          )}
          <WorkspaceSection id="compare-cases" title="case 변화">
            <CaseChanges comparison={c} baseline={baseline} candidate={candidate} />
          </WorkspaceSection>
        </>
      )}
      <p className="typo-body-small">
        <Link href="/evals" className="text-text-link underline-offset-2 hover:underline">
          평가 개요로 돌아가기
        </Link>
      </p>
    </>
  );
}
