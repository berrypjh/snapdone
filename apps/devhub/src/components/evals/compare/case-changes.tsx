import Link from 'next/link';

import { DataTable } from '@berrypjh/devhub-ui';

import { caseGroups } from '@/lib/evaluations/comparison';
import type { Comparison } from '@/lib/evaluations/contract';

type RunLink = { runId: string; href: string | null };

/** run 상세로 가는 링크. 그 run이 이 저장소의 결과에 없으면 글자만 둔다. */
const RunName = ({ run }: { run: RunLink }) =>
  run.href ? (
    <Link href={run.href} className="devhub-code text-text-link underline-offset-2 hover:underline">
      {run.runId}
    </Link>
  ) : (
    <span className="devhub-code" title="이 저장소의 결과에 없는 run">
      {run.runId}
    </span>
  );

/** 새로 틀린 · 고쳐진 · 실행 오류 · critical 변화. 수를 먼저 보이고 묶음마다 표를 둔다. 판정은 Go 값이다. */
export function CaseChanges({
  comparison,
  baseline,
  candidate,
}: {
  comparison: Comparison;
  baseline: RunLink;
  candidate: RunLink;
}) {
  const groups = caseGroups(comparison);
  const { paired, unpaired, predictionChanged } = comparison.cases;
  return (
    <div className="flex flex-col gap-3">
      <p className="typo-caption-small text-text-light tabular-nums">
        짝 맞은 case {paired} · 짝 없는 case {unpaired.length} · 예측이 바뀐 case{' '}
        {predictionChanged}. case를 열어 보려면 <RunName run={baseline} /> ·{' '}
        <RunName run={candidate} />.
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {groups.map((g) => (
          <li key={g.key}>
            <a
              href={`#cases-${g.key}`}
              className="flex flex-col rounded-md border border-stroke-light px-3 py-2 hover:bg-background-default"
            >
              <span className="typo-caption-small text-text-light">
                <span aria-hidden="true">{g.tone === 'regressed' ? '▼ ' : '▲ '}</span>
                {g.label}
              </span>
              <span className="typo-body-medium-strong tabular-nums">{g.changes.length}</span>
            </a>
          </li>
        ))}
      </ul>
      {groups
        .filter((g) => g.changes.length > 0)
        .map((g) => {
          const caption = `${g.label} ${g.changes.length}`;
          return (
            <section
              key={g.key}
              id={`cases-${g.key}`}
              aria-label={caption}
              className="flex flex-col gap-1"
            >
              <h3 className="typo-body-small-strong">{caption}</h3>
              <DataTable caption={caption} headers={['case', 'check', 'baseline', 'candidate']}>
                {g.changes.map((ch) => (
                  <tr key={`${ch.caseId}/${ch.check}`}>
                    <th scope="row" className="devhub-code">
                      {ch.caseId}
                    </th>
                    <td className="devhub-code">{ch.check}</td>
                    <td>
                      {ch.baseline}
                      <span className="block typo-caption-small text-text-light">
                        {ch.baselinePrediction}
                      </span>
                    </td>
                    <td>
                      {ch.candidate}
                      <span className="block typo-caption-small text-text-light">
                        {ch.candidatePrediction}
                      </span>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </section>
          );
        })}
    </div>
  );
}
