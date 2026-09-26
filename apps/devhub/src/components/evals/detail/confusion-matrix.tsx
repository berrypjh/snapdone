import { Table, TableScroll, VisuallyHidden } from '@berrypjh/react-ui';

import { type ConfusionMatrix as Matrix, INVALID_LABEL } from '@/lib/evaluations/detail';

/** `__invalid__`는 enum이 아니라 평가의 오답 칸이다 — 결과가 없거나(실패 · 시간 초과 · 미실행) 계약 밖의 값. */
const columnLabel = (label: string) =>
  label === INVALID_LABEL ? (
    <>
      결과 없음 · 계약 밖<span className="block devhub-code text-text-light">{INVALID_LABEL}</span>
    </>
  ) : (
    <span className="devhub-code">{label}</span>
  );

/**
 * category confusion. 줄은 정답, 칸은 예측이다. 칸의 짙기는 그 줄 안의 비율(한 색)이고 수는 늘 글자로 있다.
 * 대각선(맞음)은 테두리와 숨김 글자로 표시한다.
 */
export function ConfusionMatrix({ matrix, caption }: { matrix: Matrix; caption: string }) {
  return (
    <TableScroll label={caption} className="rounded-md border border-stroke-light">
      <Table hiddenCaption>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              정답 <span aria-hidden="true">↓</span> · 예측 <span aria-hidden="true">→</span>
            </th>
            {matrix.columns.map((c) => (
              <th key={c} scope="col">
                {columnLabel(c)}
              </th>
            ))}
            <th scope="col">합</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row, r) => (
            <tr key={row}>
              <th scope="row" className="devhub-code">
                {row}
              </th>
              {matrix.columns.map((column, c) => {
                const count = matrix.cells[r][c];
                const share = matrix.rowTotals[r] ? count / matrix.rowTotals[r] : 0;
                const correct = row === column;
                return (
                  <td
                    key={column}
                    className={[
                      'text-center tabular-nums',
                      correct ? 'outline-2 -outline-offset-2 outline-(--ds-stroke-primary)' : '',
                      count === 0 ? 'text-text-light' : '',
                    ].join(' ')}
                    style={
                      count
                        ? {
                            background: `color-mix(in srgb, var(--ds-stroke-primary) ${Math.round(share * 40)}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {count}
                    {correct && <VisuallyHidden> (맞음)</VisuallyHidden>}
                  </td>
                );
              })}
              <td className="text-center tabular-nums">{matrix.rowTotals[r]}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
