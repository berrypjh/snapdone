import type { Task } from '@/lib/evaluations/contract';
import { filterOptions, parseFilter, runRows, trendOverview } from '@/lib/evaluations/overview';
import { fetchProviderModels } from '@/lib/evaluations/provider-models';
import { EvaluationArtifactError, localEvaluations } from '@/lib/evaluations/repository';

import { WorkspaceSection } from '../shell/workspace';

import { EvalsHub } from './evals-hub';
import { EvalsOverview } from './evals-overview';

/**
 * 결과를 읽어 화면을 만든다. `task`가 없으면 안내 겸 목차(`EvalsHub`), 있으면 그 과제의 run 목록이다. 알려진 실패(저장소 root 없음)는 화면에 적고, 그 밖의
 * 오류는 Next 오류 경계로 보낸다.
 */
export async function EvalsOverviewContent({
  task,
  query,
}: {
  task?: Task;
  query: { task: unknown; dataset: unknown };
}) {
  let repo;
  try {
    repo = await localEvaluations();
  } catch (error) {
    if (!(error instanceof EvaluationArtifactError)) throw error;
    return (
      <WorkspaceSection id="evals-error" title="평가 결과를 읽을 수 없음">
        <p role="alert" className="typo-body-small">
          {error.message}
        </p>
      </WorkspaceSection>
    );
  }
  const entries = repo.listRuns();
  const trend = trendOverview(entries);
  const rows = runRows(entries, trend);
  if (!task) {
    return (
      <EvalsHub
        rows={rows}
        comparisons={repo.listComparisons()}
        catalog={repo.variantCatalog()}
        providers={await fetchProviderModels()}
      />
    );
  }
  return (
    <EvalsOverview
      rows={rows}
      comparisons={repo.listComparisons()}
      trend={trend}
      filter={parseFilter(rows, task ?? query.task, query.dataset)}
      options={filterOptions(rows)}
      task={task}
    />
  );
}
