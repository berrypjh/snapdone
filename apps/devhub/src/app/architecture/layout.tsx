import { type ReactNode, Suspense } from 'react';

import type { Metadata } from 'next';

import {
  BoundaryList,
  RelationList,
  TargetOnlyList,
} from '@/components/architecture/architecture-sections';
import { ArchitectureViews } from '@/components/architecture/architecture-views';
import { FilteredArchitecture } from '@/components/architecture/filtered-architecture';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { WorkspaceFrame, WorkspaceSection } from '@/components/shell/workspace';
import { architectureModel } from '@/lib/catalog/architecture-layout';

export const metadata: Metadata = { title: '아키텍처 · Snapdone DevHub' };

/**
 * 지금의 아키텍처. 고른 구성 요소(`@inspector` 슬롯)가 바뀌어도 지도와 글 목록은 그대로 남는다.
 * Next가 이동 뒤 페이지로 스크롤하므로 페이지(`children`)가 작업 영역 머리말이다. 종류 필터는
 * 클라이언트에서 URL을 읽으므로 정적 fallback은 필터를 걸지 않은 그림이나 목록이다.
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
