import Link from 'next/link';

import { CopyButton } from '@berrypjh/devhub-ui';
import { Table, TableScroll } from '@berrypjh/react-ui';

import type { CaseResult, Mode, RunSummary, Task } from '@/lib/evaluations/contract';
import type { CaseFilter } from '@/lib/evaluations/detail';
import { answerSource, formatMeasure, qualityRows } from '@/lib/evaluations/presentation';
import {
  caseMatrix,
  compareCommands,
  MATRIX_FILTERS,
  type MatrixFilter,
  OUTCOME,
  summaryTable,
} from '@/lib/evaluations/run-view';

import { AnswerSourceChip } from '../answer-source-chip';

export type RunView = { variant: string; show: MatrixFilter; cases: CaseFilter };

const LINK = 'text-text-link underline-offset-2 hover:underline';

/** 같은 run 안에서 보기만 바꾼 링크. 선택은 전부 URL에 있다. */
export const viewHref = (runId: string, view: RunView, hash: string) => {
  const query = new URLSearchParams({ variant: view.variant });
  if (view.show !== 'all') query.set('show', view.show);
  if (view.cases !== 'all') query.set('cases', view.cases);
  return `/evals/runs/${runId}?${query.toString()}#${hash}`;
};

/** variant × 대표 지표, Go 값 그대로 나란히. 판정(좋아짐 · 나빠짐 · gate)은 아래 짝 비교 명령의 산출물이 한다. */
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
  const { columns, rows } = summaryTable(summary, task);
  const commands = compareCommands(
    runId,
    summary.variants.map((r) => r.variant.id),
  );
  const caption = 'variant 나란히';
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
                    </span>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={columns[i].label} className="align-top">
                      <span
                        className={cell.missing ? 'text-text-light' : undefined}
                        title={cell.reason ?? undefined}
                      >
                        {cell.text}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableScroll>
      <p className="typo-caption-small text-text-light">
        값은 Go 요약 그대로. 어느 쪽이 나은지 · gate 통과 여부는 짝 비교 산출물(
        <code className="devhub-code">comparison.json</code>)이 정한다. variant 이름을 누르면 아래에
        자세히
      </p>
      {commands.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="짝 비교 명령">
          {commands.map((command) => (
            <li key={command} className="relative">
              <pre className="overflow-x-auto rounded-md bg-background-default p-3 pr-10 devhub-code">
                {command}
              </pre>
              <span className="absolute top-1.5 right-1.5">
                <CopyButton text={command} label={`짝 비교 명령 복사: ${command}`} />
              </span>
            </li>
          ))}
        </ul>
      )}
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

/** case × variant. 칸은 기호와 글자(통과 · 실패 · 미실행)와 예측. 필터는 Go 판정으로 묶기만 한다. */
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
  const { rows, counts, matches } = caseMatrix(cases, variantIds);
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
