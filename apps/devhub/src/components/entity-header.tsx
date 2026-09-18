import { notFound } from 'next/navigation';

import { findEntity, findSection } from '@/lib/entities';

import { DOCUMENT_COLUMN } from './doc/document-layout';
import { SECTION_ICON } from './view-icons';
import { WorkspaceHeader } from './workspace';

/** Workspace header of one entity page. An unknown entity is a 404. */
export function EntityHeader({ section: sectionId, id }: { section: string; id: string }) {
  const section = findSection(sectionId);
  const entity = findEntity(sectionId, id);
  if (!section || !entity) notFound();

  return (
    <WorkspaceHeader
      eyebrow={section.title}
      icon={SECTION_ICON[section.id]}
      title={entity.section === 'documents' ? entity.record.title : entity.label}
      className={entity.section === 'documents' ? DOCUMENT_COLUMN : undefined}
    />
  );
}
