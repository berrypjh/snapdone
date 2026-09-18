import { type ReactNode, Suspense } from 'react';

import type { Metadata } from 'next';

import {
  BoundaryList,
  RelationList,
  TargetOnlyList,
} from '@/components/architecture/architecture-sections';
import { ArchitectureViews } from '@/components/architecture/architecture-views';
import { FilteredArchitecture } from '@/components/architecture/filtered-architecture';
import { DevHubShell } from '@/components/devhub-shell';
import { WorkspaceFrame, WorkspaceSection } from '@/components/workspace';
import { architectureModel } from '@/lib/architecture-layout';

export const metadata: Metadata = { title: '아키텍처 · Snapdone DevHub' };

/**
 * Current architecture: the map and its text lists stay mounted while the selected node (the
 * `@inspector` slot) changes. The page (`children`) is the workspace header, because Next scrolls
 * to the page after a navigation. The kind filter reads the URL on the client, so the static
 * fallback is the unfiltered drawing or list.
 */
export default function ArchitectureLayout({
  children,
  inspector,
}: {
  children: ReactNode;
  inspector: ReactNode;
}) {
  const model = architectureModel();
  return (
    <DevHubShell selection={{ view: 'architecture' }} inspector={inspector}>
      <WorkspaceFrame>
        {children}
        <p className="typo-body-small">
          지금 저장소에 코드가 있는 구성 요소와 관계만 그렸다. 문서에만 있는 구성은 아래 목록에 따로
          둔다.
        </p>
        <WorkspaceSection id="architecture-map" title="구성 요소와 관계">
          <Suspense fallback={<ArchitectureViews model={model} />}>
            <FilteredArchitecture model={model} />
          </Suspense>
        </WorkspaceSection>
        <BoundaryList />
        <RelationList />
        <TargetOnlyList />
      </WorkspaceFrame>
    </DevHubShell>
  );
}
