import { DevHubShell } from '@/components/devhub-shell';
import { Inspector } from '@/components/inspector';
import { RepositoryOverview } from '@/components/repository-overview';
import { VIEW_ICON } from '@/components/view-icons';
import { Workspace } from '@/components/workspace';
import { catalog } from '@/data';

export default function OverviewPage() {
  const { owner, name } = catalog.repository;
  return (
    <DevHubShell selection={{}} inspector={<Inspector />}>
      <Workspace eyebrow="개요" icon={VIEW_ICON.overview} title={`${owner}/${name}`}>
        <RepositoryOverview />
      </Workspace>
    </DevHubShell>
  );
}
