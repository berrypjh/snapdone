import Link from 'next/link';

import { DataTable } from '@berrypjh/devhub-ui';

import { formatStartedAt, type TrendSeries } from '@/lib/evaluations/overview';
import { formatMeasure } from '@/lib/evaluations/presentation';

/**
 * 비교 가능한 한 묶음의 대표 지표 추세. 선 하나라 범례가 없고 제목이 이름이다. 값이 없는 run은 선을 끊고
 * 0으로 그리지 않는다. 정본은 아래 표이고 그림은 보조다. 서버에서 SVG로 그려 client JS가 없다.
 */

const W = 560;
const H = 176;
const PAD = { left: 48, right: 72, top: 12, bottom: 28 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** y 범위. 비율은 0–1로 고정해 작은 차이를 부풀리지 않고, CER처럼 1을 넘을 수 있는 값은 최대값을 올림한다. */
const domainMax = (series: TrendSeries) => {
  if (series.metric.unit === 'rate') return 1;
  const max = Math.max(...series.points.map((p) => p.value ?? 0));
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil((max * 1.1) / step) * step;
};

const tickText = (series: TrendSeries, value: number) =>
  formatMeasure({ availability: 'measured', value }, series.metric.unit).text;

/** 값이 이어지는 구간마다 path 하나. null에서 끊는다. */
const segments = (xs: number[], ys: (number | null)[]) => {
  const paths: string[] = [];
  let current = '';
  ys.forEach((y, i) => {
    if (y === null) {
      if (current.includes('L')) paths.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${xs[i].toFixed(1)},${y.toFixed(1)}`;
  });
  if (current.includes('L')) paths.push(current);
  return paths;
};

export function TrendChart({ series, id }: { series: TrendSeries; id: string }) {
  const max = domainMax(series);
  const n = series.points.length;
  const xs = series.points.map(
    (_, i) => PAD.left + (n === 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1)),
  );
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const ys = series.points.map((p) => (p.value === null ? null : y(p.value)));
  const measured = series.points.filter((p) => p.value !== null);
  const missing = n - measured.length;
  // 값이 있는 점만 표식이 된다. 마지막 표식 옆에 값을 적는다.
  const marks = series.points.flatMap((point, i) =>
    point.value === null ? [] : [{ point, x: xs[i], y: y(point.value) }],
  );
  const last = marks.at(-1);
  const direction =
    series.metric.direction === 'higher-is-better' ? '높을수록 좋음' : '낮을수록 좋음';
  const summary =
    measured.length >= 2
      ? `${series.metric.label} 추세, run ${n}개. 처음 ${measured[0].display.text}, 마지막 ${measured[measured.length - 1].display.text}. ${direction}.`
      : `${series.metric.label}: run ${n}개 중 값이 있는 run이 ${measured.length}개라 선을 그리지 않음.`;
  const titleId = `${id}-title`;

  return (
    <figure
      className="flex flex-col gap-2 rounded-md border border-stroke-light p-3"
      aria-labelledby={titleId}
    >
      <figcaption className="flex flex-col gap-0.5">
        <span id={titleId} className="typo-body-small-strong">
          {series.taskLabel} · {series.dataset} · {series.split} ·{' '}
          <span className="devhub-code">{series.variantId}</span>
        </span>
        <span className="typo-caption-small text-text-light">
          {series.metric.label} ({direction}) · {series.mode} · policy {series.policy} · 모델{' '}
          {series.model}
        </span>
        {missing > 0 && (
          <span className="typo-caption-small text-text-light">
            값이 없는 run {missing}개 — 선을 끊음, 0으로 그리지 않음
          </span>
        )}
        {series.evaluatorBuilds > 1 && (
          <span className="typo-caption-small text-text-light">
            채점기 build {series.evaluatorBuilds}개가 섞임 — 정식 비교는{' '}
            <code className="devhub-code">pnpm eval compare</code>
          </span>
        )}
      </figcaption>

      {measured.length >= 2 && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full max-w-[40rem]"
        >
          {[0, max / 2, max].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--ds-stroke-light)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-(--ds-text-light) typo-caption-small"
              >
                {tickText(series, tick)}
              </text>
            </g>
          ))}
          {segments(xs, ys).map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="var(--ds-stroke-primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {marks.map(({ point, x, y: cy }) => (
            <g key={point.runId}>
              <title>{`${point.runId} · ${formatStartedAt(point.startedAt)} · ${point.display.text}`}</title>
              <circle
                cx={x}
                cy={cy}
                r={4}
                fill="var(--ds-stroke-primary)"
                stroke="var(--ds-background-surface)"
                strokeWidth={2}
              />
            </g>
          ))}
          {last && (
            <text
              x={last.x + 10}
              y={last.y}
              dominantBaseline="middle"
              className="fill-(--ds-text-default) typo-caption-small"
            >
              {last.point.display.text}
            </text>
          )}
          <text x={PAD.left} y={H - 8} className="fill-(--ds-text-light) typo-caption-small">
            {formatStartedAt(series.points[0].startedAt)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            className="fill-(--ds-text-light) typo-caption-small"
          >
            {formatStartedAt(series.points[n - 1].startedAt)}
          </text>
        </svg>
      )}

      <details>
        <summary className="cursor-pointer typo-caption-small text-text-link">표로 보기</summary>
        <div className="mt-2">
          <DataTable
            caption={`${series.metric.label} — run별 값`}
            headers={['run', '시작', series.metric.label]}
          >
            {series.points.map((p) => (
              <tr key={p.runId}>
                <th scope="row">
                  <Link
                    href={p.href}
                    className="devhub-code text-text-link underline-offset-2 hover:underline"
                  >
                    {p.runId}
                  </Link>
                </th>
                <td>
                  <time dateTime={p.startedAt}>{formatStartedAt(p.startedAt)}</time>
                </td>
                <td className="tabular-nums">
                  {p.display.text}
                  {p.display.missing && p.display.reason && (
                    <span className="block typo-caption-small text-text-light">
                      {p.display.reason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      </details>
    </figure>
  );
}
