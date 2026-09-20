'use client';

import Link from 'next/link';
import { useSelectedLayoutSegments } from 'next/navigation';

import { catalog } from '@/data';
import type { Scenario, ScenarioStep } from '@/domain/model';
import { stepHref } from '@/lib/catalog/entities';

import { StatusChip } from '../entity/status-chip';

const LINK = 'text-text-link underline-offset-2 hover:underline';

const runtimeName = new Map(catalog.runtimes.map((runtime) => [runtime.id, runtime.name]));

/** 단계가 어디서 돌고 누가 맡으며 근거가 얼마나 있는지 한 줄로. */
const summaryOf = (scenario: Scenario, step: ScenarioStep, order: number) => {
  // 바로 아래 단계 하나뿐인 `next`는 목록 순서가 이미 말한 것이라 적지 않는다.
  const following = scenario.steps[order]?.id;
  const next = step.next.length === 1 && step.next[0] === following ? [] : step.next;
  const orderOf = new Map(scenario.steps.map((s, i) => [s.id, i + 1]));
  return [
    runtimeName.get(step.runtime) ?? step.runtime,
    `담당 ${step.owner}`,
    step.apis.length > 0 && `API ${step.apis.length}`,
    step.contracts.length > 0 && `계약 ${step.contracts.length}`,
    `테스트 ${step.tests.length}`,
    next.length > 0 && `다음 ${next.map((id) => orderOf.get(id) ?? id).join(', ')}단계`,
  ]
    .filter(Boolean)
    .join(' · ');
};

function StepItem({
  scenario,
  step,
  order,
  selected,
}: {
  scenario: Scenario;
  step: ScenarioStep;
  order: number;
  selected: boolean;
}) {
  const headingId = `outline-${step.id}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className={`flex flex-col gap-1 rounded-md px-3 py-3 ${selected ? 'bg-(--ds-background-selected)' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id={headingId} className="typo-body-small-strong">
            <Link
              href={stepHref(scenario.id, step.id)}
              scroll={false}
              aria-current={selected ? 'page' : undefined}
              className={LINK}
            >
              {order}. {step.intent}
            </Link>
            {selected && <span className="typo-caption-small"> · 선택됨</span>}
          </h3>
          <StatusChip status={step.status} />
        </div>
        <p className="typo-caption-small text-text-light">{summaryOf(scenario, step, order)}</p>
      </article>
    </li>
  );
}

/**
 * 시나리오를 단계 요약 목록으로. 흐름 그림이 보이는 것 — 순서 · 의도 · 상태 · 실행 위치 · 담당 ·
 * 근거 수 · 바로 아래가 아닌 다음 단계 — 을 글로 적는다. 단계의 근거는 고르면 인스펙터에 나온다.
 */
export function ScenarioOutline({ scenario }: { scenario: Scenario }) {
  const segments = useSelectedLayoutSegments();
  const selected = segments[0] === 'steps' ? segments[1] : undefined;
  return (
    <ol
      aria-label={`${scenario.title} 단계`}
      className="flex flex-col divide-y divide-stroke-light"
    >
      {scenario.steps.map((step, index) => (
        <StepItem
          key={step.id}
          scenario={scenario}
          step={step}
          order={index + 1}
          selected={step.id === selected}
        />
      ))}
    </ol>
  );
}
