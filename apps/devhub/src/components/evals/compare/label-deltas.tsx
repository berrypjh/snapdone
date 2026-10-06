import { DataTable } from '@berrypjh/devhub-ui';

import type { LabelDelta } from '@/lib/evaluations/contract';

import { DeltaCells } from './axis-table';

/** category별 F1 변화(분류만). 평균에 가려진 악화를 드러낸다. recall · precision 차이는 옆 글자로 둔다. */
export function LabelDeltas({ labels }: { labels: LabelDelta[] }) {
  const caption = 'category별 F1 — baseline · candidate';
  return (
    <DataTable
      caption={caption}
      headers={[
        'category',
        'F1 baseline',
        'F1 candidate',
        'F1 차이',
        '판정',
        'recall · precision 차이',
      ]}
    >
      {labels.map((l) => (
        <tr key={l.label}>
          <th scope="row">
            <span className="devhub-code">{l.label}</span>
            <span className="block typo-caption-small text-text-light">정답 {l.support}</span>
          </th>
          <DeltaCells metric={l.f1} axis="quality" />
          <td className="typo-caption-small tabular-nums">
            {[l.recall, l.precision]
              .map(
                (m, i) =>
                  `${i ? 'precision' : 'recall'} ${m.deltaPp.availability === 'measured' ? `${m.deltaPp.value > 0 ? '+' : ''}${m.deltaPp.value.toFixed(1)}pp` : '비교 불가'}`,
              )
              .join(' · ')}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
