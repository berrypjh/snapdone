import { Table, TableScroll } from '@berrypjh/react-ui';

import type { Bin } from '@/lib/evaluations/detail';
import { formatMeasure } from '@/lib/evaluations/presentation';

const ms = (value: number) => formatMeasure({ availability: 'measured', value }, 'ms').text;

/** 호출한 case의 시간 분포. 막대는 한 색이고 정본은 아래 표다. */
export function LatencyHistogram({ bins, label }: { bins: Bin[]; label: string }) {
  const peak = Math.max(...bins.map((b) => b.count));
  const n = bins.reduce((sum, b) => sum + b.count, 0);
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`${label}: case ${n}개, 가장 많은 구간 ${bins.find((b) => b.count === peak)?.from ?? 0}ms부터`}
        className="flex h-28 items-end gap-0.5 border-b border-stroke-light"
      >
        {bins.map((b) => (
          <span
            key={b.from}
            title={`${ms(b.from)} – ${ms(b.to)}: ${b.count}`}
            className="flex-1 rounded-t-sm bg-(--ds-stroke-primary)"
            style={{ height: `${peak ? (b.count / peak) * 100 : 0}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between typo-caption-small text-text-light">
        <span>{ms(bins[0].from)}</span>
        <span>{ms(bins[bins.length - 1].to)}</span>
      </figcaption>
      <details>
        <summary className="cursor-pointer typo-caption-small text-text-link">표로 보기</summary>
        <TableScroll label={label} className="mt-2 rounded-md border border-stroke-light">
          <Table hiddenCaption>
            <caption>{label}</caption>
            <thead>
              <tr>
                <th scope="col">구간</th>
                <th scope="col">case</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.from}>
                  <th scope="row" className="tabular-nums">
                    {ms(b.from)} – {ms(b.to)}
                  </th>
                  <td className="tabular-nums">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      </details>
    </figure>
  );
}
