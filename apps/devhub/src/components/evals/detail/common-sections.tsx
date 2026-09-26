import { Table, TableScroll } from '@berrypjh/react-ui';

import type { CaseResult, Mode, VariantReport } from '@/lib/evaluations/contract';
import {
  attemptedDurations,
  executionSegments,
  failureCounts,
  histogram,
  type Spread,
  tokenSpread,
} from '@/lib/evaluations/detail';
import { formatMeasure } from '@/lib/evaluations/presentation';

import { ExecutionBar } from './execution-bar';
import { LatencyHistogram } from './latency-histogram';

type Props = { report: VariantReport; cases: CaseResult[]; mode: Mode };

const Missing = ({ text, reason }: { text: string; reason: string | null }) => (
  <p className="typo-body-small text-text-light">
    {text}
    {reason && ` — ${reason}`}
  </p>
);

/** 인프라가 고른 일을 끝냈는지. 조각 합은 호출 수다. */
export function ExecutionHealth({ report }: { report: VariantReport }) {
  const { total, segments } = executionSegments(report);
  const rate = formatMeasure(report.reliability.completionRate, 'rate');
  return (
    <div className="flex flex-col gap-2">
      <ExecutionBar total={total} segments={segments} label={`${report.variant.id} 실행`} />
      <p className="typo-caption-small text-text-light tabular-nums">
        시도 {report.reliability.attempted} 중 완료율 {rate.text}
        {rate.reason && ` (${rate.reason})`} · HTTP 왕복 {report.reliability.wireCalls} · 판정 —
        통과 {report.outcome.passed} · 실패 {report.outcome.failed} · 채점 안 함{' '}
        {report.outcome.unscored}
      </p>
    </div>
  );
}

function CountTable({ title, counts }: { title: string; counts: [string, number][] }) {
  return (
    <TableScroll label={title} className="rounded-md border border-stroke-light">
      <Table hiddenCaption>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col">수</th>
          </tr>
        </thead>
        <tbody>
          {counts.map(([key, n]) => (
            <tr key={key}>
              <th scope="row" className="devhub-code">
                {key}
              </th>
              <td className="tabular-nums">{n}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}

/** 어떤 실행 실패가 많은지. Go가 센 class · kind 그대로다. */
export function Failures({ report }: { report: VariantReport }) {
  const byClass = failureCounts(report.reliability.errorsByClass);
  const byKind = failureCounts(report.reliability.errorsByKind);
  if (byClass.length === 0)
    return <p className="typo-caption-small text-text-light">없음 — 실행 실패 · 시간 초과 없음</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <CountTable title="오류 class" counts={byClass} />
      <CountTable title="오류 kind" counts={byKind} />
    </div>
  );
}

/** Go 요약의 중앙값 · p95와, live면 case 시간 분포. replay는 재지 않았다고 적는다. */
export function Latency({ report, cases, mode }: Props) {
  const { attempted, completed, definition } = report.latency;
  if (mode === 'replay' || attempted.n === 0) {
    return <Missing text="측정 안 함" reason={formatMeasure(attempted.medianMs, 'ms').reason} />;
  }
  const bins = histogram(attemptedDurations(cases, report.variant.id));
  const row = (label: string, stats: typeof attempted) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      <td className="tabular-nums">{stats.n}</td>
      {[stats.medianMs, stats.p95Ms, stats.meanMs].map((m, i) => {
        const d = formatMeasure(m, 'ms');
        return (
          <td
            key={i}
            className={d.missing ? 'text-text-light' : 'tabular-nums'}
            title={d.reason ?? undefined}
          >
            {d.text}
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="flex flex-col gap-3">
      <TableScroll label="지연 요약" className="rounded-md border border-stroke-light">
        <Table hiddenCaption>
          <caption>지연 요약</caption>
          <thead>
            <tr>
              <th scope="col">집합</th>
              <th scope="col">n</th>
              <th scope="col">중앙값</th>
              <th scope="col">p95</th>
              <th scope="col">평균</th>
            </tr>
          </thead>
          <tbody>
            {row('시도(실패 · 시간 초과 포함)', attempted)}
            {row('완료', completed)}
          </tbody>
        </Table>
      </TableScroll>
      {attempted.n < 10 && (
        <p className="typo-caption-small text-text-light">
          표본 {attempted.n}개 — 백분위가 안정적이지 않음
        </p>
      )}
      {bins && <LatencyHistogram bins={bins} label={`${report.variant.id} case별 시간`} />}
      <p className="typo-caption-small text-text-light">{definition}</p>
    </div>
  );
}

const spreadText = (s: Spread | null) =>
  s
    ? `case ${s.n}개 · 최소 ${s.min.toLocaleString('ko-KR')} · 중앙 ${s.median.toLocaleString('ko-KR')} · 최대 ${s.max.toLocaleString('ko-KR')}`
    : '값이 있는 case 없음';

/** token 사용량과 비용. 가격표가 없으면 금액을 짐작하지 않고 Go의 이유를 적는다. */
export function Usage({ report, cases }: Omit<Props, 'mode'>) {
  const { inputTokens, outputTokens, usageKnown, usageUnknown } = report.cost;
  const estimated = formatMeasure(report.cost.estimated, 'count');
  const actual = formatMeasure(report.cost.actual, 'count');
  const spread = tokenSpread(cases, report.variant.id);
  const total = (label: string, m: typeof inputTokens) => {
    const d = formatMeasure(m, 'count');
    return (
      <p className="typo-body-small">
        {label}:{' '}
        <span className={d.missing ? 'text-text-light' : 'tabular-nums typo-body-small-strong'}>
          {d.text}
        </span>
        {d.reason && <span className="block typo-caption-small text-text-light">{d.reason}</span>}
      </p>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {total('입력 token 합', inputTokens)}
        {total('출력 token 합', outputTokens)}
      </div>
      <p className="typo-caption-small text-text-light tabular-nums">
        usage를 보고한 호출 {usageKnown} · 보고하지 않은 호출 {usageUnknown}
      </p>
      {(spread.input || spread.output) && (
        <p className="typo-caption-small text-text-light">
          입력 — {spreadText(spread.input)}
          <br />
          출력 — {spreadText(spread.output)}
        </p>
      )}
      <p className="typo-caption-small text-text-light">
        비용 — 추정 {estimated.text}
        {estimated.reason && ` (${estimated.reason})`} · 실제 {actual.text}
        {actual.reason && ` (${actual.reason})`}
      </p>
    </div>
  );
}
