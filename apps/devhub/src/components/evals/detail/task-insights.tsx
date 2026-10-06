import { DataTable } from '@berrypjh/devhub-ui';

import type {
  CaseResult,
  ClassificationQuality,
  TextQuality,
  TranslationQuality,
  TrialQuality,
} from '@/lib/evaluations/contract';
import { caseMetric, confusionMatrix, INVALID_LABEL, labelRows } from '@/lib/evaluations/detail';
import {
  formatMeasure,
  keyRows,
  QUALITY_GROUPS,
  type QualityRow,
  qualityRows,
} from '@/lib/evaluations/presentation';

import { ConfusionMatrix } from './confusion-matrix';
import { ValueBar } from './value-bar';

/** 지표 한 줄 — 왼쪽 이름과 설명, 오른쪽 값과 막대. 값이 없으면 막대 없이 이유를 쓴다. */
function MetricRow({ row }: { row: QualityRow }) {
  return (
    <li className="grid gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,14rem)] sm:items-center">
      <span className="flex flex-col">
        <span className="typo-body-small">{row.label}</span>
        {row.note && <span className="typo-caption-small text-text-light">{row.note}</span>}
      </span>
      <ValueBar measure={row.measure} unit={row.unit} />
    </li>
  );
}

export function MetricList({ rows }: { rows: QualityRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-stroke-light">
      {rows.map((row) => (
        <MetricRow key={row.label} row={row} />
      ))}
    </ul>
  );
}

/** 품질 지표를 묶음(분류 · 행동 · 안전 …) 순서대로 나눈다. 비어 있는 묶음은 없다. */
export const qualityGroups = (trial: TrialQuality) => {
  const rows = qualityRows(trial);
  const order = [...new Set(rows.map((row) => row.group))];
  return order.map((group) => ({
    group,
    ...QUALITY_GROUPS[group],
    rows: rows.filter((row) => row.group === group),
  }));
};

/** 맨 위 요약. 대표 지표 몇 개를 크게 보이고 자세한 것은 아래 묶음에 둔다. */
export function KeyMetrics({ trial }: { trial: TrialQuality }) {
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {keyRows(trial).map((row) => {
        const display = formatMeasure(row.measure, row.unit);
        return (
          <li key={row.label} className="flex flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="typo-body-small">{row.label}</span>
              <span
                className={
                  display.missing ? 'typo-body-small text-text-light' : 'typo-body-medium-strong'
                }
              >
                {display.text}
              </span>
            </span>
            {(display.reason ?? row.note) && (
              <span className="typo-caption-small text-text-light">
                {display.reason ?? row.note}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="typo-caption-small text-text-light">{children}</h4>;
}

/** 어느 class · 행동이 틀리는가. */
function ClassificationInsights({ q, variantId }: { q: ClassificationQuality; variantId: string }) {
  const labels = labelRows(q);
  const raw = (name: string, t: ClassificationQuality['raw']['syntax']) =>
    `${name} 맞음 ${t.valid} · 틀림 ${t.invalid} · 판정 못 함 ${t.unobserved}`;
  return (
    <>
      <p className="typo-caption-small text-text-light tabular-nums">
        위험 — 금지 행동이 있는 case {q.risk.eligible} · 관측 {q.risk.observed} · 금지 행동 추천{' '}
        {q.risk.critical} · 실행 실패로 보지 못함 {q.risk.unobserved}. 결과가 없거나 계약 밖이라{' '}
        <span className="devhub-code">{INVALID_LABEL}</span>로 간 case {q.categoryInvalid}.
      </p>
      <Heading>category별 precision · recall · F1</Heading>
      <DataTable
        caption={`${variantId} category별`}
        headers={['category', '정답 수', 'TP · FP · FN', 'precision', 'recall', 'F1']}
      >
        {labels.map((l) => (
          <tr key={l.label}>
            <th scope="row" className="devhub-code">
              {l.label}
            </th>
            <td className="tabular-nums">{l.support}</td>
            <td className="tabular-nums">
              {l.tp} · {l.fp} · {l.fn}
            </td>
            <td>
              <ValueBar measure={l.precision} unit="rate" />
            </td>
            <td>
              <ValueBar measure={l.recall} unit="rate" />
            </td>
            <td>
              <ValueBar measure={l.f1} unit="rate" />
            </td>
          </tr>
        ))}
      </DataTable>
      {q.missingLabels.length > 0 && (
        <p className="typo-caption-small text-text-light">
          정답이 없는 category(macro F1에서 빠짐):{' '}
          <span className="devhub-code">{q.missingLabels.join(', ')}</span>
        </p>
      )}
      <Heading>category confusion</Heading>
      <ConfusionMatrix
        matrix={confusionMatrix(q)}
        caption={`${variantId} category confusion — 줄은 정답, 칸은 예측`}
      />
      <p className="typo-caption-small text-text-light">
        모델 원문 — {raw('JSON 문법', q.raw.syntax)} / {raw('schema 모양', q.raw.shape)} /{' '}
        {raw('parser', q.raw.parser)}
      </p>
    </>
  );
}

/** 어느 case · field가 틀리는가. */
function TextInsights({
  q,
  cases,
  variantId,
}: {
  q: TextQuality;
  cases: CaseResult[];
  variantId: string;
}) {
  const fields = [...q.fieldStats].sort(
    (a, b) => (a.accuracy.value ?? 2) - (b.accuracy.value ?? 2) || (a.id < b.id ? -1 : 1),
  );
  const cer = caseMetric(cases, variantId, 'cer');
  const maxCer = Math.max(1, ...cer.measured.map((m) => m.value));
  return (
    <>
      <Heading>field별 — 정확도가 낮은 것부터</Heading>
      {fields.length === 0 ? (
        <p className="typo-body-small text-text-light">
          없음 — field 계약이 있는 case가 없어 field 지표는 지원 안 함
        </p>
      ) : (
        <DataTable
          caption={`${variantId} field별`}
          headers={['field', 'case · 판정', '맞음 · 틀림 · 없음', '정확도']}
        >
          {fields.map((f) => (
            <tr key={f.id}>
              <th scope="row" className="devhub-code">
                {f.id}
                {f.important > 0 && (
                  <span className="block typo-caption-small text-text-light">
                    중요 {f.important}
                  </span>
                )}
              </th>
              <td className="tabular-nums">
                {f.support} · {f.evaluated}
              </td>
              <td className="tabular-nums">
                {f.correct} · {f.wrong} · {f.missing}
              </td>
              <td>
                <ValueBar measure={f.accuracy} unit="rate" />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      <Heading>case별 CER — 높은(나쁜) 것부터</Heading>
      {cer.measured.length > 0 && (
        <ul className="flex flex-col gap-1">
          {cer.measured.map((m) => (
            <li
              key={m.caseId}
              className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2"
            >
              <span className="devhub-code">{m.caseId}</span>
              <ValueBar
                measure={{ availability: 'measured', value: m.value }}
                unit="ratio"
                max={maxCer}
              />
            </li>
          ))}
        </ul>
      )}
      {cer.missing.length > 0 && (
        <ul className="typo-caption-small text-text-light">
          {cer.missing.map((m) => (
            <li key={m.caseId}>
              <span className="devhub-code">{m.caseId}</span> — CER {m.availability ?? '없음'}
              {m.reason && `: ${m.reason}`}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 어느 reference · 보존 구간이 어긋나는가. 의미 품질은 재지 않으므로 그리지 않는다. */
function TranslationInsights({
  q,
  cases,
  variantId,
  policy,
}: {
  q: TranslationQuality;
  cases: CaseResult[];
  variantId: string;
  policy: string;
}) {
  const spans = caseMetric(cases, variantId, 'critical-span-recall', 'asc');
  const lost = spans.measured.filter((m) => m.value < 1);
  return (
    <>
      <p className="typo-body-small">
        {q.scored
          ? `채점 규칙 ${policy} — 정규화 뒤 reference와 같고 보존 구간이 모두 있어야 통과`
          : `채점 규칙 ${policy} — case를 채점하지 않음. reference 일치는 진단값이고 의역은 틀림이 아님`}
      </p>
      <Heading>보존 구간이 빠진 case</Heading>
      {lost.length === 0 ? (
        <p className="typo-body-small text-text-light">
          없음 — 보존 구간이 있는 case {spans.measured.length}개 모두 보존
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lost.map((m) => (
            <li
              key={m.caseId}
              className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-2"
            >
              <span className="devhub-code">{m.caseId}</span>
              <ValueBar measure={{ availability: 'measured', value: m.value }} unit="rate" />
            </li>
          ))}
        </ul>
      )}
      <p className="typo-caption-small text-text-light">
        의미 유사도 · BLEU · chrF · judge는 재지 않음 — 위 품질 묶음에 이유, 그래프로 그리지 않음
      </p>
    </>
  );
}

export function TaskInsights({
  trial,
  cases,
  variantId,
  policy,
}: {
  trial: TrialQuality;
  cases: CaseResult[];
  variantId: string;
  policy: string;
}) {
  switch (trial.task) {
    case 'image-classification':
      return <ClassificationInsights q={trial.quality} variantId={variantId} />;
    case 'text-extraction':
      return <TextInsights q={trial.quality} cases={cases} variantId={variantId} />;
    case 'translation':
      return (
        <TranslationInsights
          q={trial.quality}
          cases={cases}
          variantId={variantId}
          policy={policy}
        />
      );
  }
}
