import { Inspector } from '@/components/entity/inspector';
import { RepositoryOverview } from '@/components/overview/repository-overview';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { VIEW_ICON } from '@/components/ui/view-icons';
import { catalog } from '@/data';

export default function OverviewPage() {
  const { owner, name } = catalog.repository;
  return (
    <DevHubShell inspector={<Inspector />}>
      <Workspace eyebrow="개요" icon={VIEW_ICON.overview} title={`${owner}/${name}`}>
        <RepositoryOverview />
      </Workspace>
    </DevHubShell>
  );
}
