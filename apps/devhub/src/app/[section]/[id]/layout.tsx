import { notFound } from 'next/navigation';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DevHubShell } from '@/components/devhub-shell';
import { EntitySummary } from '@/components/entity-summary';
import { WorkspaceFrame } from '@/components/workspace';
import { findEntity } from '@/lib/entities';

type Params = Promise<{ section: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  return { title: entity ? `${entity.label} · Snapdone DevHub` : undefined };
}

/**
 * Shell and workspace for one entity. Kept as a layout so the scenario flow keeps its pan/zoom
 * while the selected step changes. The page (`children`) is the workspace header and the
 * `@inspector` slot is the right pane: Next scrolls to the page after a navigation, so the page
 * must be at the top of the workspace.
 */
export default async function EntityLayout({
  params,
  children,
  inspector,
}: {
  params: Params;
  children: ReactNode;
  inspector: ReactNode;
}) {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  if (!entity) notFound();

  return (
    <DevHubShell selection={{ section: entity.section, id: entity.id }} inspector={inspector}>
      <WorkspaceFrame>
        {children}
        <EntitySummary entity={entity} />
      </WorkspaceFrame>
    </DevHubShell>
  );
}
