import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { DevHubShell } from '@/components/devhub-shell';
import { Inspector } from '@/components/inspector';
import { SourceActions } from '@/components/source-actions';
import { SourceUsageSummary } from '@/components/source-usage-summary';
import { VIEW_ICON } from '@/components/view-icons';
import { Workspace } from '@/components/workspace';
import { inspectSource } from '@/lib/inspection';
import { sourceUsage } from '@/lib/source-usage';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The query value is only a lookup key into the cited paths; anything else is not found. */
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

/** Hub for a cited file: search results for sources, symbols, APIs, contracts, and tests land here. */
export default async function SourcePage({ searchParams }: { searchParams: SearchParams }) {
  const usage = await usageFor(searchParams);
  if (!usage) notFound();

  return (
    <DevHubShell
      selection={{ view: 'source' }}
      inspector={<Inspector inspection={inspectSource(usage)} />}
    >
      <Workspace eyebrow="소스 파일" icon={VIEW_ICON.source} title={usage.path}>
        {/* The one place with every link for a file; the inspector keeps one link per file. */}
        <SourceActions source={{ path: usage.path }} />
        <SourceUsageSummary usage={usage} />
      </Workspace>
    </DevHubShell>
  );
}
