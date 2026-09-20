import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { Inspector } from '@/components/entity/inspector';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { SourceActions } from '@/components/source/source-actions';
import { SourceUsageSummary } from '@/components/source/source-usage-summary';
import { VIEW_ICON } from '@/components/ui/view-icons';
import { inspectSource } from '@/lib/catalog/inspection';
import { sourceUsage } from '@/lib/repository/source-usage';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 쿼리 값은 인용된 경로를 찾는 키일 뿐이다. 그 밖의 값은 404다. */
const usageFor = async (searchParams: SearchParams) => {
  const { path } = await searchParams;
  return typeof path === 'string' ? sourceUsage().get(path) : undefined;
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const usage = await usageFor(searchParams);
  return { title: usage ? `${usage.path} · Snapdone DevHub` : undefined };
}

/** 인용된 파일의 허브. 소스 · 심볼 · API · 계약 · 테스트 검색 결과가 여기로 온다. */
export default async function SourcePage({ searchParams }: { searchParams: SearchParams }) {
  const usage = await usageFor(searchParams);
  if (!usage) notFound();

  return (
    <DevHubShell
      selection={{ view: 'source' }}
      inspector={<Inspector inspection={inspectSource(usage)} />}
    >
      <Workspace eyebrow="소스 파일" icon={VIEW_ICON.source} title={usage.path}>
        {/* 파일의 모든 링크가 모인 유일한 곳. 상세 정보에는 파일당 링크 하나만 둔다. */}
        <SourceActions source={{ path: usage.path }} />
        <SourceUsageSummary usage={usage} />
      </Workspace>
    </DevHubShell>
  );
}
