import Link from 'next/link';

import { Icon } from '@berrypjh/devhub-ui';

import {
  formatStartedAt,
  runHref,
  type RunRow,
  type VariantCell,
} from '@/lib/evaluations/overview';

import { AnswerSourceChip } from './answer-source-chip';
import { RunStateChip } from './run-state-chip';

const LINK = 'text-text-link underline-offset-2 hover:underline';
const MODE = { live: 'live', replay: 'replay' } as const;

/** 대표 지표 한 줄. 값이 없으면 숫자 대신 이유를 쓴다. */
/** 실행이 끝나지 않은 호출. 있으면 지표 앞에 경고로 먼저 — 실패는 정확도 분모에 남아 0%로 보인다. */
function ExecutionIssue({ variant }: { variant: VariantCell }) {
  const e = variant.execution;
  if (!e || (e.errors === 0 && e.notRun === 0)) return null;
  return (
    <p className="flex items-center gap-1.5 typo-caption-small text-text-warning">
      <Icon name="warning" />
      {[e.errors > 0 && `실행 실패 ${e.errors}`, e.notRun > 0 && `미실행 ${e.notRun}`]
        .filter(Boolean)
        .join(' · ')}
      {` / ${e.invocations}번 — 이 variant의 지표는 실패를 틀린 답으로 셈`}
    </p>
  );
}

function Metric({ variant }: { variant: VariantCell }) {
  if (!variant.metric) {
    return <p className="typo-caption-small text-text-light">요약 없음</p>;
  }
  const { label, display } = variant.metric;
  return (
    <p className="typo-caption-small">
      <span className="text-text-light">{label} </span>
      {display.missing ? (
        <span className="text-text-light">
          {display.text}
          {display.reason && ` — ${display.reason}`}
        </span>
      ) : (
        <span className="typo-body-small-strong">{display.text}</span>
      )}
      {variant.previousRunId && (
        <span className="text-text-light">
          {' '}
          · 이전 비교 가능{' '}
          <Link href={runHref(variant.previousRunId)} className={`devhub-code ${LINK}`}>
            {variant.previousRunId}
          </Link>
        </span>
      )}
    </p>
  );
}

function Variants({ variants }: { variants: VariantCell[] }) {
  if (variants.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 border-l-2 border-stroke-light pl-3">
      {variants.map((v) => (
        <li key={v.id} className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className="devhub-code">{v.id}</span>
            <AnswerSourceChip source={v.source} />
          </p>
          <p className="typo-caption-small text-text-light">
            {v.provider} · {v.model}
          </p>
          <ExecutionIssue variant={v} />
          <Metric variant={v} />
        </li>
      ))}
    </ul>
  );
}

function Execution({ row }: { row: RunRow }) {
  if (!row.execution) return null;
  const { completed, failed, timedOut, notRun, unsupported } = row.execution;
  return (
    <p className="typo-caption-small text-text-light">
      고른 case {row.selected} · 완료 {completed} · 실패 {failed} · 시간 초과 {timedOut} · 미실행{' '}
      {notRun}
      {unsupported > 0 && ` · 미지원 ${unsupported}`}
    </p>
  );
}

/** 최근 run 목록. repository가 준 순서(최근 시작 먼저) 그대로. */
export function RunList({ rows }: { rows: RunRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-stroke-light">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <Link href={row.href} className={`devhub-code typo-body-small-strong ${LINK}`}>
                {row.id}
              </Link>
              <RunStateChip state={row.state} />
            </div>
            <p className="typo-caption-small text-text-light">
              {row.taskLabel}
              {row.dataset && ` · ${row.dataset} · ${row.split}`}
              {row.mode && ` · ${MODE[row.mode]}`}
              {row.startedAt && (
                <>
                  {' · '}
                  <time dateTime={row.startedAt}>{formatStartedAt(row.startedAt)}</time>
                </>
              )}
            </p>
            {row.abort && <p className="typo-caption-small text-text-light">중단 — {row.abort}</p>}
            {row.error && (
              <p className="typo-caption-small text-text-light">
                {row.error.kind} — {row.error.message}
              </p>
            )}
          </div>
          <Variants variants={row.variants} />
          <Execution row={row} />
        </li>
      ))}
    </ul>
  );
}
