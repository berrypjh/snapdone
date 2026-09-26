import type { Measure } from '@/lib/evaluations/contract';
import { formatMeasure, type MeasureUnit } from '@/lib/evaluations/presentation';

/**
 * 표 칸 안의 값과 막대. 막대는 글자의 보조이고(값은 늘 글자로 있다) 한 색이다. 값이 없으면 막대 없이 이유를 적는다.
 * `max`는 막대 폭의 기준이다 — 비율은 1, CER처럼 1을 넘는 값은 표 안의 최댓값.
 */
export function ValueBar({
  measure,
  unit,
  max = 1,
}: {
  measure: Measure;
  unit: MeasureUnit;
  max?: number;
}) {
  const display = formatMeasure(measure, unit);
  if (display.missing || measure.value === null) {
    return (
      <span className="text-text-light">
        {display.text}
        {display.reason && <span className="block typo-caption-small">{display.reason}</span>}
      </span>
    );
  }
  const width = max > 0 ? Math.min(1, measure.value / max) : 0;
  return (
    <span className="flex min-w-32 items-center gap-2">
      <span className="w-14 shrink-0 text-right tabular-nums">{display.text}</span>
      <span aria-hidden="true" className="h-2 flex-1 rounded-sm bg-background-default">
        <span
          className="block h-full rounded-sm bg-(--ds-stroke-primary)"
          style={{ width: `${width * 100}%` }}
        />
      </span>
    </span>
  );
}
