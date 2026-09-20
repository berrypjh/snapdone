import Link from 'next/link';

import { entityHref, entityStatus, type Section } from '@/lib/entities';

import { StatusChip } from './status-chip';
import { WorkspaceSection } from './workspace';

/** 탐색기 섹션 하나의 가운데 화면. 모든 항목을 링크와 상태로 보인다. */
export function SectionSummary({ section }: { section: Section }) {
  return (
    <WorkspaceSection id="section-list" title={`${section.entities.length}개`}>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {section.entities.map((entity) => {
          const status = entityStatus(entity);
          return (
            <li key={entity.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                href={entityHref(entity)}
                className="typo-body-small text-text-link underline-offset-2 hover:underline"
              >
                {entity.label}
              </Link>
              {status && <StatusChip status={status} />}
            </li>
          );
        })}
      </ul>
    </WorkspaceSection>
  );
}
