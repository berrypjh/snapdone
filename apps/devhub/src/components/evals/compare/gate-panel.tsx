import { DataTable } from '@berrypjh/devhub-ui';
import { Chip } from '@berrypjh/react-ui';

import type { Comparison } from '@/lib/evaluations/contract';
import { formatMeasure } from '@/lib/evaluations/presentation';

/** Go가 판정한 gate를 그대로 보인다. gate가 없으면 서술 비교라고 적는다. 여기서 규칙을 다시 판정하지 않는다. */
export function GatePanel({ gate }: { gate: Comparison['gate'] }) {
  if (!gate) {
    return (
      <p className="typo-body-small">
        gate 없음 — 규칙 없이 만든 비교라 서술만 하고 통과 · 실패는 판정하지 않음
      </p>
    );
  }
  if (!gate.applicable) {
    return (
      <p className="typo-body-small">
        gate <code className="devhub-code">{gate.policyVersion}</code> — 적용하지 않음:{' '}
        {gate.reason}
      </p>
    );
  }
  const caption = `gate ${gate.policyVersion} 규칙`;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 typo-body-small">
        gate <code className="devhub-code">{gate.policyVersion}</code>
        <Chip
          size="sm"
          variant="outlined"
          leading={gate.passed ? '●' : '×'}
          className={
            gate.passed
              ? '[--ui-chip-fg:var(--ds-text-success)] [--ui-chip-border-color:var(--ds-stroke-success)]'
              : '[--ui-chip-fg:var(--ds-text-error)] [--ui-chip-border-color:var(--ds-stroke-error)]'
          }
        >
          {gate.passed ? '통과' : '실패'}
        </Chip>
      </p>
      <DataTable caption={caption} headers={['규칙', '한도', '관측', '결과']}>
        {gate.rules.map((rule) => {
          const observed = formatMeasure(rule.observed, 'count');
          return (
            <tr key={rule.rule}>
              <th scope="row" className="devhub-code">
                {rule.rule}
              </th>
              <td className="tabular-nums">{rule.limit}</td>
              <td className={observed.missing ? 'text-text-light' : 'tabular-nums'}>
                {rule.observed.availability === 'measured'
                  ? Number(rule.observed.value.toFixed(2)).toLocaleString('ko-KR')
                  : observed.text}
              </td>
              <td>{rule.passed ? '● 통과' : '× 실패'}</td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
