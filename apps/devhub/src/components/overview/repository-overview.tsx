import Link from 'next/link';

import { WorkspaceSection } from '@berrypjh/devhub-ui';
import { VisuallyHidden } from '@berrypjh/react-ui';

import { catalog } from '@/data';
import type { ImplementationStatus, Scenario } from '@/domain/model';
import { entityHref, sectionHref, SECTIONS } from '@/lib/catalog/entities';
import { STATUS, TRACK } from '@/lib/catalog/labels';
import { startPath } from '@/lib/catalog/start-path';

import { StatusChip } from '../entity/status-chip';
import { VerificationLimits } from '../entity/verification-note';

import { SnapshotSummary } from './snapshot-summary';

const STATUS_ORDER: ImplementationStatus[] = [
  'implemented',
  'partial',
  'documented-only',
  'planned',
  'not-found',
];

const LINK = 'typo-body-small text-text-link underline-offset-2 hover:underline';

function ScenarioList({ track }: { track: Scenario['track'] }) {
  const listed = catalog.scenarios.filter((scenario) => scenario.track === track);
  return (
    <div className="flex flex-col gap-1">
      <h3 className="typo-caption-small text-text-light">
        {TRACK[track]} {listed.length}
      </h3>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {listed.map((scenario) => (
          <li key={scenario.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <Link href={entityHref({ section: 'scenarios', id: scenario.id })} className={LINK}>
                {scenario.title}
              </Link>
              <VerificationLimits scenario={scenario} />
            </span>
            <StatusChip status={scenario.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 문서에서 인용한 제품의 목적, 이 도구의 목적, 지금 코드에 있는 흐름. */
function ProductSummary() {
  return (
    <WorkspaceSection id="overview-product" title="제품">
      <dl className="flex flex-col gap-2 typo-body-small">
        <div className="flex flex-col gap-0.5">
          <dt className="typo-body-small-strong">Snapdone</dt>
          <dd>{catalog.product.text}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="typo-body-small-strong">DevHub</dt>
          <dd>
            그 제품이 어떤 코드 · API · 계약 · 문서 · 테스트로 동작하는지 근거까지 찾는 내부 도구.
            제품 화면이 아니고, 상태는 사람이 적은 카탈로그에서 옴
          </dd>
        </div>
      </dl>
      <ScenarioList track="current" />
      <ScenarioList track="developer" />
    </WorkspaceSection>
  );
}

/** 처음 온 개발자가 차례로 여는 세 단계. 모든 링크는 이미 있는 시나리오 · 구성 요소 · 문서로 간다. */
function StartPath() {
  return (
    <WorkspaceSection id="overview-start" title="처음 10분">
      <ol className="flex flex-col gap-4">
        {startPath().map((step, index) => (
          <li key={step.title} className="flex flex-col gap-1">
            <h3 className="typo-body-small-strong">
              {index + 1}. {step.title}
            </h3>
            <p className="typo-body-small text-text-light">{step.lead}</p>
            <ul className="flex flex-col gap-1">
              {step.links.map((link) => (
                <li key={link.href} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                  {link.detail && (
                    <span className="typo-caption-small text-text-light">{link.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </WorkspaceSection>
  );
}

/** 저장소의 가운데 화면. 카탈로그가 담은 것을 데이터에서 직접 세어 보인다. */
export function RepositoryOverview() {
  const { repository, scenarios } = catalog;
  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    count: scenarios.filter((scenario) => scenario.status === status).length,
  })).filter(({ count }) => count > 0);

  return (
    <>
      <ProductSummary />
      <StartPath />
      <WorkspaceSection id="overview-repository" title="저장소">
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 typo-body-small">
          <dt className="text-text-light">원격</dt>
          <dd className="devhub-code">{repository.webUrl}</dd>
          <dt className="text-text-light">기본 브랜치</dt>
          <dd className="devhub-code">{repository.defaultBranch}</dd>
          <dt className="text-text-light">스냅샷 커밋</dt>
          <dd>
            <SnapshotSummary />
          </dd>
        </dl>
      </WorkspaceSection>

      <WorkspaceSection id="overview-sections" title="항목">
        <ul className="flex flex-col divide-y divide-stroke-light">
          {SECTIONS.map((section) => (
            <li key={section.id} className="flex items-center justify-between py-2">
              <Link
                href={sectionHref(section.id)}
                className="typo-body-small text-text-link underline-offset-2 hover:underline"
              >
                {section.title}
              </Link>
              <span className="typo-body-small">{section.entities.length}</span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>

      <WorkspaceSection id="overview-status" title="시나리오 상태">
        <ul className="flex flex-col gap-2">
          {statusCounts.map(({ status, count }) => (
            <li key={status} className="flex items-center justify-between">
              <StatusChip status={status} />
              <span className="typo-body-small">
                {count}
                <VisuallyHidden> 개 — {STATUS[status].label}</VisuallyHidden>
              </span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>
    </>
  );
}
