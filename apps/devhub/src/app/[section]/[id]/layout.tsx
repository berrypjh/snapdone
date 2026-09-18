import { notFound } from 'next/navigation';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DevHubShell } from '@/components/devhub-shell';
import { EntitySummary } from '@/components/entity-summary';
import { SECTION_ICON } from '@/components/view-icons';
import { Workspace } from '@/components/workspace';
import { findEntity, findSection } from '@/lib/entities';

type Params = Promise<{ section: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  return { title: entity ? `${entity.label} · Snapdone DevHub` : undefined };
}

/**
 * Shell and workspace for one entity. Kept as a layout so the scenario flow keeps its pan/zoom
 * while the child page (the inspector) changes with the selected step.
 */
export default async function EntityLayout({
  params,
  children,
}: {
  params: Params;
  children: ReactNode;
}) {
  const { section: sectionId, id } = await params;
  const section = findSection(sectionId);
  const entity = findEntity(sectionId, id);
  if (!section || !entity) notFound();

  return (
    <DevHubShell selection={{ section: section.id, id: entity.id }} inspector={children}>
      <Workspace
        eyebrow={section.title}
        icon={SECTION_ICON[section.id]}
        title={entity.section === 'documents' ? entity.record.title : entity.label}
      >
        <EntitySummary entity={entity} />
      </Workspace>
    </DevHubShell>
  );
}
