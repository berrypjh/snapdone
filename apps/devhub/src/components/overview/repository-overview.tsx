import Link from 'next/link';

import { VisuallyHidden } from '@berrypjh/react-ui';

import { catalog } from '@/data';
import type { ImplementationStatus, Scenario } from '@/domain/model';
import { entityHref, sectionHref, SECTIONS } from '@/lib/catalog/entities';
import { STATUS, TRACK } from '@/lib/catalog/labels';

import { StatusChip } from '../entity/status-chip';
import { WorkspaceSection } from '../shell/workspace';

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
            <Link href={entityHref({ section: 'scenarios', id: scenario.id })} className={LINK}>
              {scenario.title}
            </Link>
            <StatusChip status={scenario.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 문서에서 인용한 제품의 목적과, 지금 코드에 있는 흐름. */
function ProductSummary() {
  return (
    <WorkspaceSection id="overview-product" title="제품">
      <p className="typo-body-small">{catalog.product.text}</p>
      <ScenarioList track="current" />
      <ScenarioList track="product-target" />
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
