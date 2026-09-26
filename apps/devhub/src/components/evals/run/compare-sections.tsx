import Link from 'next/link';

import { Table, TableScroll } from '@berrypjh/react-ui';

import type { CaseResult, Mode, RunSummary, Task } from '@/lib/evaluations/contract';
import type { CaseFilter } from '@/lib/evaluations/detail';
import { answerSource, formatMeasure, qualityRows } from '@/lib/evaluations/presentation';
import {
  caseMatrix,
  grade,
  MATRIX_FILTERS,
  type MatrixFilter,
  OUTCOME,
  summaryTable,
} from '@/lib/evaluations/run-view';

import { AnswerSourceChip } from '../answer-source-chip';

export type RunView = { variant: string; base: string; show: MatrixFilter; cases: CaseFilter };

const LINK = 'text-text-link underline-offset-2 hover:underline';

/** 같은 run 안에서 보기만 바꾼 링크. 선택은 전부 URL에 있다. */
export const viewHref = (runId: string, view: RunView, hash: string) => {
  const query = new URLSearchParams({ variant: view.variant, base: view.base });
  if (view.show !== 'all') query.set('show', view.show);
  if (view.cases !== 'all') query.set('cases', view.cases);
  return `/evals/runs/${runId}?${query.toString()}#${hash}`;
};

const CHANGE = {
  better: { glyph: '▲', label: '좋아짐', className: 'text-text-success' },
  worse: { glyph: '▼', label: '나빠짐', className: 'text-text-error' },
  same: { glyph: '=', label: '같음', className: 'text-text-light' },
} as const;

/** variant × 대표 지표. 기준 variant와의 차이를 ▲ · ▼와 글자로, 열마다 가장 좋은 값을 굵게 표시한다. */
export function SummaryTable({
  runId,
  summary,
  task,
  mode,
  view,
}: {
  runId: string;
  summary: RunSummary;
  task: Task;
  mode: Mode;
  view: RunView;
}) {
  const { columns, base, rows } = summaryTable(summary, task, view.base);
  const caption = `variant 비교 — 기준 ${base.variant.id}`;
  return (
    <div className="flex flex-col gap-2">
      <TableScroll label={caption} className="rounded-md border border-stroke-light">
        <Table hiddenCaption>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">variant</th>
              {columns.map((c) => (
                <th key={c.label} scope="col">
                  {c.label}
                  <span className="block typo-caption-small text-text-light">
                    {c.direction === 'higher' ? '높을수록 좋음' : '낮을수록 좋음'}
                  </span>
                </th>
              ))}
              <th scope="col">기준 대비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.report.variant.id;
              return (
                <tr
                  key={id}
                  aria-current={view.variant === id ? 'true' : undefined}
                  className="aria-[current=true]:bg-(--ds-background-selected)"
                >
                  <th scope="row" className="align-top">
                    <span className="flex flex-col items-start gap-1">
                      <Link
                        href={viewHref(runId, { ...view, variant: id }, 'run-variant')}
                        className={`devhub-code ${LINK}`}
                      >
                        {id}
                      </Link>
                      <AnswerSourceChip source={answerSource(mode, row.report.variant)} />
                      {!row.isBase && (
                        <Link
                          href={viewHref(runId, { ...view, base: id }, 'run-compare')}
                          className={`typo-caption-small ${LINK}`}
                        >
                          기준으로
                        </Link>
                      )}
                    </span>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={columns[i].label} className="align-top">
                      <span
                        className={
                          cell.display.missing
                            ? 'text-text-light'
                            : cell.best
                              ? 'typo-body-small-strong'
                              : undefined
                        }
                        title={cell.display.reason ?? undefined}
                      >
                        {cell.display.text}
                      </span>
                      {cell.best && (
                        <span className="block typo-caption-small text-text-light">최고</span>
                      )}
                      {cell.delta && (
                        <span
                          className={`block typo-caption-small ${CHANGE[cell.delta.change].className}`}
                        >
                          <span aria-hidden="true">{CHANGE[cell.delta.change].glyph} </span>
                          {cell.delta.text} {CHANGE[cell.delta.change].label}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="align-top typo-caption-small">{grade(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableScroll>
      <p className="typo-caption-small text-text-light">
        차이는 기준 variant와의 값 차이(비율은 %p). 서술 비교 — 통계적 유의성은 주장하지 않음.
        variant 이름을 누르면 아래에 자세히
      </p>
    </div>
  );
}

/** 모든 품질 지표를 variant 열로 나란히. 접어 두고 필요할 때 연다. */
export function AllMetricsTable({ summary }: { summary: RunSummary }) {
  const lists = summary.variants.map((r) => (r.quality[0] ? qualityRows(r.quality[0]) : []));
  const labels = [...new Set(lists.flat().map((row) => row.label))];
  const caption = '모든 품질 지표';
  return (
    <details className="flex flex-col gap-2">
      <summary className="cursor-pointer typo-body-small text-text-link">
        모든 품질 지표 {labels.length}개 펼치기
      </summary>
      <TableScroll label={caption} className="mt-2 rounded-md border border-stroke-light">
        <Table hiddenCaption>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">지표</th>
              {summary.variants.map((r) => (
                <th key={r.variant.id} scope="col" className="devhub-code">
                  {r.variant.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {lists.map((rows, i) => {
                  const row = rows.find((r) => r.label === label);
                  const display = row ? formatMeasure(row.measure, row.unit) : null;
                  return (
                    <td
                      key={summary.variants[i].variant.id}
                      className={!display || display.missing ? 'text-text-light' : undefined}
                      title={display?.reason ?? undefined}
                    >
                      {display ? display.text : '없음'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </details>
  );
}

const FILTER =
  'inline-flex min-h-8 items-center gap-1 rounded-md px-2 typo-caption-small text-text-link hover:bg-background-default aria-[current=true]:bg-(--ds-background-selected) aria-[current=true]:text-text-default aria-[current=true]:typo-body-small-strong';

/** case × variant. 칸은 기호와 글자(통과 · 실패 · 미실행)와 예측. 기준보다 나빠진 case를 먼저 찾게 필터를 둔다. */
export function CaseMatrix({
  runId,
  cases,
  variantIds,
  view,
}: {
  runId: string;
  cases: CaseResult[];
  variantIds: string[];
  view: RunView;
}) {
  const { rows, counts, matches } = caseMatrix(cases, variantIds, view.base);
  const visible = rows.filter(matches[view.show]);
  const caption = `case별 결과 — ${MATRIX_FILTERS[view.show]} ${visible.length}개`;
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="case별 결과 필터">
        <ul className="flex flex-wrap gap-1">
          {(Object.keys(MATRIX_FILTERS) as MatrixFilter[]).map((f) => (
            <li key={f}>
              <Link
                href={viewHref(runId, { ...view, show: f }, 'run-cases-matrix')}
                aria-current={view.show === f ? 'true' : undefined}
                className={FILTER}
              >
                {view.show === f && <span aria-hidden="true">✓&nbsp;</span>}
                {MATRIX_FILTERS[f]} {counts[f]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {visible.length === 0 ? (
        <p className="typo-caption-small text-text-light">없음 — 이 필터에 맞는 case 없음</p>
      ) : (
        <TableScroll label={caption} className="rounded-md border border-stroke-light">
          <Table hiddenCaption>
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">case</th>
                {variantIds.map((id) => (
                  <th key={id} scope="col" className="devhub-code">
                    {id}
                    {id === view.base && (
                      <span className="block typo-caption-small text-text-light">기준</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.caseId}>
                  <th scope="row" className="align-top">
                    <span className="devhub-code">{row.caseId}</span>
                    {row.gold && (
                      <span className="block typo-caption-small text-text-light">
                        정답 {row.gold}
                      </span>
                    )}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={variantIds[i]} className="align-top typo-body-small">
                      {cell ? (
                        <>
                          <span aria-hidden="true">{OUTCOME[cell.outcome].glyph} </span>
                          {OUTCOME[cell.outcome].label}
                          {cell.answer && (
                            <span className="block devhub-code text-text-light">{cell.answer}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-text-light">줄 없음</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
    </div>
  );
}
