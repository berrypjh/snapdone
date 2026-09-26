import type { CSSProperties } from 'react';

import { type Segment, type SegmentKey, SEGMENTS } from '@/lib/evaluations/detail';

/**
 * 상태 색은 보조다. 완료는 칠하고 실패 쪽은 빗금을 쳐서(실패 45° · 시간 초과 135°) 색을 구분하지 못해도 성공과
 * 실패가 갈린다. 조각 사이는 2px 표면 간격이고, 뜻은 옆 범례의 기호 · 글자 · 수가 전한다.
 */
const hatch = (color: string, angle: number) =>
  `repeating-linear-gradient(${angle}deg, ${color} 0 3px, var(--ds-background-surface) 3px 5px)`;

const FILL: Record<SegmentKey, CSSProperties> = {
  completed: { background: 'var(--ds-stroke-success)' },
  failed: { background: hatch('var(--ds-stroke-error)', 45) },
  timedOut: { background: hatch('var(--ds-stroke-warning)', 135) },
  notRun: { background: hatch('var(--ds-stroke-default)', 45) },
  unsupported: { background: 'var(--ds-background-grey)' },
};

export function ExecutionBar({
  total,
  segments,
  label,
}: {
  total: number;
  segments: Segment[];
  label: string;
}) {
  const shown = segments.filter((s) => s.count > 0);
  const summary = `${label}: 호출 ${total}개 중 ${segments.map((s) => `${SEGMENTS[s.key].label} ${s.count}`).join(', ')}`;
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={summary}
        className="flex h-4 w-full gap-0.5 overflow-hidden rounded-sm"
      >
        {total === 0 ? (
          <span className="w-full rounded-sm border border-dashed border-stroke-default" />
        ) : (
          shown.map((s) => (
            <span
              key={s.key}
              title={`${SEGMENTS[s.key].label} ${s.count}`}
              className="h-full first:rounded-l-sm last:rounded-r-sm"
              style={{ ...FILL[s.key], width: `${(s.count / total) * 100}%` }}
            />
          ))
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 typo-caption-small">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={FILL[s.key]}
            />
            <span aria-hidden="true">{SEGMENTS[s.key].glyph}</span>
            {SEGMENTS[s.key].label}
            <span className="tabular-nums typo-body-small-strong">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
