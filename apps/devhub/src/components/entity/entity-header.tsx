import { notFound } from 'next/navigation';

import { findEntity, findSection } from '@/lib/catalog/entities';

import { DOCUMENT_COLUMN } from '../doc/document-layout';
import { WorkspaceHeader } from '../shell/workspace';
import { SECTION_ICON } from '../ui/view-icons';

/** 개체 페이지 하나의 작업 영역 헤더. 없는 개체는 404다. */
export function EntityHeader({ section: sectionId, id }: { section: string; id: string }) {
  const section = findSection(sectionId);
  const entity = findEntity(sectionId, id);
  if (!section || !entity) notFound();

  return (
    <WorkspaceHeader
      eyebrow={section.title}
      icon={SECTION_ICON[section.id]}
      title={entity.section === 'documents' ? entity.record.title : entity.label}
      className={
        entity.section === 'documents' || entity.section === 'records' ? DOCUMENT_COLUMN : undefined
      }
    />
  );
}
