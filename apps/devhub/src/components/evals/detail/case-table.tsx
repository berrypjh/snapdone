import Link from 'next/link';

import { Table, TableScroll, VisuallyHidden } from '@berrypjh/react-ui';

import type { CaseResult, Measure, Task } from '@/lib/evaluations/contract';
import {
  CASE_FILTERS,
  type CaseFilter,
  caseFilterCounts,
  matchesCaseFilter,
} from '@/lib/evaluations/detail';
import { formatMeasure, type MeasureUnit } from '@/lib/evaluations/presentation';

const OUTCOME: Record<CaseResult['quality']['outcome'], string> = {
  passed: '● 통과',
  failed: '× 실패',
  'not-evaluated': '○ 채점 안 함(실행이 끝나지 않음)',
  unscored: '– 채점 규칙 없음',
};

const STATUS: Record<CaseResult['execution']['status'], string> = {
  completed: '완료',
  failed: '실패',
  'timed-out': '시간 초과',
  skipped: '미지원',
  'not-run': '미실행',
};

/** case 지표의 단위. 이름은 Go case metric 이름이다. */
const unitOf = (metric: string): MeasureUnit =>
  metric === 'cer' || metric === 'wer'
    ? 'ratio'
    : metric === 'char-edits' || metric === 'ref-chars'
      ? 'count'
      : 'rate';

function MeasureText({ measure, unit }: { measure: Measure | undefined; unit: MeasureUnit }) {
  if (!measure) return <span className="text-text-light">—</span>;
  const display = formatMeasure(measure, unit);
  return (
    <span
      className={display.missing ? 'text-text-light' : 'tabular-nums'}
      title={display.reason ?? undefined}
    >
      {display.text}
    </span>
  );
}

const TASK_COLUMNS: Record<Task, { label: string; metric: string }[]> = {
  'image-classification': [
    { label: '추출값', metric: 'facts-recall' },
    { label: '행동 완료', metric: 'action-ready' },
  ],
  'text-extraction': [
    { label: 'CER', metric: 'cer' },
    { label: '정규화 일치', metric: 'normalized-exact-match' },
    { label: 'field 정확도', metric: 'field-accuracy' },
  ],
  translation: [
    { label: 'reference 일치', metric: 'normalized-exact-match' },
    { label: '보존 구간', metric: 'critical-span-recall' },
    { label: '선언 언어', metric: 'language-metadata-match' },
  ],
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="typo-caption-small text-text-light">{title}</p>
      {children}
    </div>
  );
}

const Pre = ({ text }: { text: string }) => (
  <pre className="max-h-48 overflow-auto rounded-md bg-background-default p-2 whitespace-pre-wrap devhub-code">
    {text}
  </pre>
);

function Expected({ c }: { c: CaseResult }) {
  switch (c.task) {
    case 'image-classification':
      return (
        <p className="typo-body-small">
          <span className="devhub-code">{c.expected.category}</span> · {c.expected.intent} · 허용{' '}
          <span className="devhub-code">{c.expected.acceptableActions.join(', ') || '없음'}</span> ·
          금지{' '}
          <span className="devhub-code">{c.expected.forbiddenActions.join(', ') || '없음'}</span>
          {c.expected.facts.length > 0 && (
            <span className="block typo-caption-small">
              읽어야 할 값:{' '}
              {c.expected.facts
                .map(
                  (f) =>
                    `${f.label} = ${f.acceptedValues.join(' | ')}` +
                    (f.requiredFor.length > 0 ? ` (${f.requiredFor.join(', ')}에 필요)` : ''),
                )
                .join(' · ')}
            </span>
          )}
        </p>
      );
    case 'text-extraction':
      return (
        <>
          <Pre text={c.expected.text || '(빈 텍스트가 정답)'} />
          {c.expected.fields.length > 0 && (
            <p className="typo-caption-small">
              field:{' '}
              {c.expected.fields
                .map(
                  (f) => `${f.id}${f.important ? '(중요)' : ''} = ${f.acceptedValues.join(' | ')}`,
                )
                .join(' · ')}
            </p>
          )}
        </>
      );
    case 'translation':
      return (
        <>
          <p className="typo-caption-small">
            원문 ({c.input.sourceLanguage} → {c.input.targetLanguage})
          </p>
          <Pre text={c.input.sourceText} />
          <p className="typo-caption-small">승인된 reference</p>
          {c.expected.references.map((r) => (
            <Pre key={r} text={r} />
          ))}
          {c.expected.criticalSpans.length > 0 && (
            <p className="typo-caption-small">
              보존 구간:{' '}
              {c.expected.criticalSpans
                .map((s) => `${s.id}(${s.kind}) = ${s.accepted.join(' | ')}`)
                .join(' · ')}
            </p>
          )}
        </>
      );
  }
}

function Prediction({ c }: { c: CaseResult }) {
  if (!c.prediction)
    return (
      <p className="typo-body-small text-text-light">예측 없음 — {STATUS[c.execution.status]}</p>
    );
  switch (c.task) {
    case 'image-classification':
      return (
        <p className="typo-body-small">
          <span className="devhub-code">
            {c.prediction.category} / {c.prediction.suggestedAction}
          </span>{' '}
          ({c.prediction.confidence})
          {c.prediction.facts.length > 0 && (
            <span className="block typo-caption-small">
              facts: {c.prediction.facts.map((f) => `${f.label}: ${f.value}`).join(' · ')}
            </span>
          )}
        </p>
      );
    case 'text-extraction':
      return (
        <>
          <Pre text={c.prediction.text} />
          {Object.keys(c.prediction.fields).length > 0 && (
            <p className="typo-caption-small">
              field:{' '}
              {Object.entries(c.prediction.fields)
                .map(([k, v]) => `${k} = ${v}`)
                .join(' · ')}
            </p>
          )}
        </>
      );
    case 'translation':
      return (
        <>
          <Pre text={c.prediction.text} />
          <p className="typo-caption-small">
            선언한 목표 언어: {c.prediction.targetLanguage ?? '없음'}
          </p>
        </>
      );
  }
}

/** 모델에 붙인 비슷한 사례와 계단식 경로. 쓰지 않은 variant면 아무것도 없다. */
function Experiment({ c }: { c: CaseResult }) {
  if (c.task !== 'image-classification' || (!c.retrieval && !c.cascade)) return null;
  return (
    <Block title="실험">
      {c.retrieval && (
        <p className="typo-caption-small">
          비슷한 사례:{' '}
          {c.retrieval.examples
            .map(
              (e) =>
                `${e.caseId}(${e.category}${e.category === c.expected.category ? ' · 맞음' : ''}, ${e.similarity.toFixed(3)})`,
            )
            .join(' · ') || '없음'}
        </p>
      )}
      {c.cascade && (
        <p className="typo-caption-small">
          계단식: <span className="devhub-code">{c.cascade.firstModel}</span>의 신뢰도{' '}
          {c.cascade.firstConfidence ?? '답 없음'} →{' '}
          {c.cascade.escalated ? '큰 모델에 다시 물음' : '첫 모델 답을 씀'}
        </p>
      )}
    </Block>
  );
}

/** case 하나를 펼쳐 본다. 정답 · 예측 · check · 지표 · 오류. 원문은 Go가 남긴 경우에만, 한 번 더 펼쳐야 보인다. */
function CaseDetails({ c }: { c: CaseResult }) {
  return (
    <details>
      <summary className="cursor-pointer typo-caption-small text-text-link">자세히</summary>
      <div className="mt-2 flex min-w-72 flex-col gap-3">
        <Block title="정답">
          <Expected c={c} />
        </Block>
        <Block title="예측">
          <Prediction c={c} />
        </Block>
        {c.model && (
          <Block title="모델">
            <p className="typo-caption-small">
              요청 <span className="devhub-code">{c.model.requested}</span> → 답{' '}
              {c.model.answered.availability === 'measured' ? (
                <span className="devhub-code">{c.model.answered.value}</span>
              ) : (
                <span className="text-text-light">
                  이름 없음 — {c.model.answered.reason ?? c.model.answered.availability}
                </span>
              )}
            </p>
          </Block>
        )}
        <Experiment c={c} />
        {c.quality.checks.length > 0 && (
          <Block title="check">
            <ul className="typo-caption-small">
              {c.quality.checks.map((check) => (
                <li key={check.name}>
                  {check.outcome === 'passed' ? '● ' : '× '}
                  <span className="devhub-code">{check.name}</span>{' '}
                  {check.outcome === 'passed' ? '통과' : '실패'}
                </li>
              ))}
            </ul>
          </Block>
        )}
        <Block title="지표">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 typo-caption-small">
            {Object.entries(c.metrics).map(([name, measure]) => {
              const display = formatMeasure(measure, unitOf(name));
              return (
                <div key={name} className="contents">
                  <dt className="devhub-code">{name}</dt>
                  <dd className={display.missing ? 'text-text-light' : 'tabular-nums'}>
                    {display.text}
                    {display.reason && ` — ${display.reason}`}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Block>
        {c.execution.error && (
          <Block title="실행 오류">
            <p className="typo-caption-small">
              {c.execution.error.class}
              {c.execution.error.kind && ` · ${c.execution.error.kind}`} —{' '}
              {c.execution.error.message}
            </p>
          </Block>
        )}
        {c.raw && (
          <Block title="모델 원문 판정">
            <p className="typo-caption-small">
              {(['syntax', 'shape', 'parser'] as const)
                .map(
                  (k) =>
                    `${k} ${c.raw?.[k].availability === 'measured' ? (c.raw[k].valid ? '맞음' : '틀림') : c.raw?.[k].availability}`,
                )
                .join(' · ')}
            </p>
            {c.raw.text.availability === 'measured' && c.raw.text.value !== null ? (
              <details>
                <summary className="cursor-pointer typo-caption-small text-text-link">
                  모델 원문 보기
                </summary>
                <Pre text={c.raw.text.value} />
              </details>
            ) : (
              <p className="typo-caption-small text-text-light">
                원문 없음 — {c.raw.text.reason ?? c.raw.text.availability}
              </p>
            )}
          </Block>
        )}
      </div>
    </details>
  );
}

/** case 목록. 필터는 링크라 새로 고쳐도 남고 키보드로 옮길 수 있다. 판정은 Go 값 그대로다. */
export function CaseTable({
  hrefOf,
  task,
  cases,
  filter,
  showVariant,
}: {
  /** case 필터 링크. 다른 선택(variant · 기준)을 지킨다. */
  hrefOf: (filter: CaseFilter) => string;
  task: Task;
  cases: CaseResult[];
  filter: CaseFilter;
  showVariant: boolean;
}) {
  const counts = caseFilterCounts(cases);
  const visible = cases.filter((c) => matchesCaseFilter(filter, c));
  const columns = TASK_COLUMNS[task];
  const caption = `case — ${CASE_FILTERS[filter]} ${visible.length}개`;
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="case 필터" className="flex flex-wrap gap-1.5">
        {(Object.keys(CASE_FILTERS) as CaseFilter[]).map((f) => (
          <Link
            key={f}
            href={hrefOf(f)}
            aria-current={f === filter ? 'page' : undefined}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-stroke-light px-2.5 typo-body-small hover:bg-background-default aria-[current=page]:border-stroke-primary aria-[current=page]:bg-(--ds-background-selected) aria-[current=page]:typo-body-small-strong"
          >
            {CASE_FILTERS[f]} <span className="tabular-nums text-text-light">{counts[f]}</span>
          </Link>
        ))}
      </nav>
      {visible.length === 0 ? (
        <p className="typo-body-small text-text-light">없음 — 이 필터에 맞는 case 없음</p>
      ) : (
        <TableScroll label={caption} className="rounded-md border border-stroke-light">
          <Table hiddenCaption>
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">case</th>
                <th scope="col">실행</th>
                <th scope="col">품질</th>
                {task === 'image-classification' && (
                  <>
                    <th scope="col">정답</th>
                    <th scope="col">예측</th>
                  </>
                )}
                {columns.map((col) => (
                  <th key={col.metric} scope="col">
                    {col.label}
                  </th>
                ))}
                <th scope="col">
                  <VisuallyHidden>펼치기</VisuallyHidden>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.invocationId}>
                  <th scope="row" className="align-top devhub-code">
                    {c.caseId}
                    {(showVariant || c.trial > 1) && (
                      <span className="block text-text-light">
                        {showVariant && c.variantId}
                        {c.trial > 1 && ` · trial ${c.trial}`}
                      </span>
                    )}
                  </th>
                  <td className="align-top typo-body-small">
                    {STATUS[c.execution.status]}
                    {c.execution.error && (
                      <span className="block typo-caption-small text-text-light">
                        {c.execution.error.kind ?? c.execution.error.class}
                      </span>
                    )}
                  </td>
                  <td className="align-top typo-body-small">
                    {OUTCOME[c.quality.outcome]}
                    {c.quality.outcome === 'failed' && (
                      <span className="block typo-caption-small text-text-light">
                        {c.quality.checks
                          .filter((k) => k.outcome === 'failed')
                          .map((k) => k.name)
                          .join(', ')}
                      </span>
                    )}
                  </td>
                  {c.task === 'image-classification' && (
                    <>
                      <td className="align-top devhub-code">
                        {c.expected.category} / {c.expected.acceptableActions.join(', ') || '—'}
                      </td>
                      <td className="align-top devhub-code">
                        {c.prediction
                          ? `${c.prediction.category} / ${c.prediction.suggestedAction}`
                          : '—'}
                      </td>
                    </>
                  )}
                  {columns.map((col) => (
                    <td key={col.metric} className="align-top typo-body-small">
                      <MeasureText measure={c.metrics[col.metric]} unit={unitOf(col.metric)} />
                    </td>
                  ))}
                  <td className="align-top">
                    <CaseDetails c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
    </div>
  );
}
