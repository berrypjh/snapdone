import { DataTable } from '@berrypjh/devhub-ui';
import type { CSSProperties } from 'react';

import { AXIS_LABELS, CHANGE, type DeltaView, deltaView } from '@/lib/evaluations/comparison';
import type { Change, Comparison, MetricDelta } from '@/lib/evaluations/contract';

/** 개선 · 악화 색은 보조다. 악화는 빗금이라 색을 구분하지 못해도 갈리고, 뜻은 옆 글자(▲ 개선 · ▼ 악화)가 전한다. */
const FILL: Record<Change, CSSProperties> = {
  improved: { background: 'var(--ds-stroke-success)' },
  regressed: {
    background:
      'repeating-linear-gradient(45deg, var(--ds-stroke-error) 0 3px, var(--ds-background-surface) 3px 5px)',
  },
  unchanged: { background: 'var(--ds-stroke-default)' },
  'not-comparable': {},
};

/** 0을 가운데 둔 차이 막대. 오른쪽은 값이 커진 쪽, 왼쪽은 작아진 쪽이고 좋고 나쁨은 Go의 change가 정한다. */
function DeltaBar({ view }: { view: DeltaView }) {
  if (!view.bar) return null;
  const width = `${view.bar.magnitude * 50}%`;
  return (
    <span
      aria-hidden="true"
      className="relative block h-2.5 w-28 shrink-0 rounded-sm bg-background-default"
    >
      <span className="absolute inset-y-0 left-1/2 w-px bg-(--ds-stroke-default)" />
      {view.bar.sign !== 0 && (
        <span
          className="absolute inset-y-0 rounded-sm"
          style={{
            ...FILL[view.change],
            width,
            ...(view.bar.sign > 0 ? { left: '50%' } : { right: '50%' }),
          }}
        />
      )}
    </span>
  );
}

export function ChangeText({ change }: { change: Change }) {
  return (
    <span className={change === 'not-comparable' ? 'text-text-light' : 'typo-body-small-strong'}>
      <span aria-hidden="true">{CHANGE[change].glyph} </span>
      {CHANGE[change].label}
    </span>
  );
}

export function DeltaCells({ metric, axis }: { metric: MetricDelta; axis: string }) {
  const view = deltaView(metric, axis);
  const value = (d: DeltaView['baseline']) => (
    <span className={d.missing ? 'text-text-light' : 'tabular-nums'} title={d.reason ?? undefined}>
      {d.text}
    </span>
  );
  return (
    <>
      <td>{value(view.baseline)}</td>
      <td>{value(view.candidate)}</td>
      <td>
        {view.bar ? (
          <span className="flex items-center gap-2">
            <DeltaBar view={view} />
            <span className="tabular-nums">{view.delta.text}</span>
          </span>
        ) : (
          <span className="text-text-light">
            {view.delta.text}
            {view.delta.reason && (
              <span className="block typo-caption-small">{view.delta.reason}</span>
            )}
          </span>
        )}
      </td>
      <td>
        <ChangeText change={view.change} />
      </td>
    </>
  );
}

/** 한 축의 지표들. 비교할 수 없는 축은 지표 없이 Go의 이유만 적는다. */
export function AxisTable({ axis }: { axis: Comparison['axes'][number] }) {
  const title = AXIS_LABELS[axis.axis] ?? axis.axis;
  if (!axis.comparable) {
    return <p className="typo-body-small text-text-light">비교하지 않음 — {axis.reason}</p>;
  }
  const caption = `${title} — baseline · candidate`;
  return (
    <DataTable caption={caption} headers={['지표', 'baseline', 'candidate', '차이', '판정']}>
      {axis.metrics.map((m) => (
        <tr key={m.name}>
          <th scope="row">
            <span className="devhub-code">{m.name}</span>
            <span className="block typo-caption-small text-text-light">
              {deltaView(m, axis.axis).direction}
            </span>
          </th>
          <DeltaCells metric={m} axis={axis.axis} />
        </tr>
      ))}
    </DataTable>
  );
}
