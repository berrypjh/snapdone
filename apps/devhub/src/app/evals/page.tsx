import type { Metadata } from 'next';

import { EvalsGuide } from '@/components/evals/evals-guide';
import { EvalsOverviewContent } from '@/components/evals/evals-overview-content';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { VIEW_ICON } from '@/components/ui/view-icons';

export const metadata: Metadata = { title: '평가 · Snapdone DevHub' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * 평가 전체. `localEvaluations()`가 요청을 기다리므로 build 때 굳지 않고, `next dev` 중에 생긴 run도 보인다.
 * 값은 전부 Go 산출물에서 오고 여기서 다시 채점하지 않는다.
 */
export default async function EvalsPage({ searchParams }: { searchParams: SearchParams }) {
  const { task, dataset } = await searchParams;
  return (
    <DevHubShell inspector={<EvalsGuide />}>
      <Workspace eyebrow="평가" icon={VIEW_ICON.evals} title="평가">
        <EvalsOverviewContent query={{ task, dataset }} />
      </Workspace>
    </DevHubShell>
  );
}
