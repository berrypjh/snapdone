import { notFound } from 'next/navigation';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { EntitySummary } from '@/components/entity/entity-summary';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { WorkspaceFrame } from '@/components/shell/workspace';
import { findEntity } from '@/lib/catalog/entities';

type Params = Promise<{ section: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  return { title: entity ? `${entity.label} · Snapdone DevHub` : undefined };
}

/**
 * 항목 하나의 셸과 작업 영역. layout으로 두어야 고른 단계가 바뀌어도 시나리오 흐름의 이동 · 확대가
 * 유지된다. 페이지(`children`)는 작업 영역 머리말, `@inspector` 슬롯은 오른쪽 칸이다. Next는 이동
 * 뒤 페이지로 스크롤하므로 페이지가 작업 영역 맨 위에 있어야 한다.
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
