import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { EvalsGuide } from '@/components/evals/evals-guide';
import { parseRunView, RunDetailView, RunProblem } from '@/components/evals/run-detail';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { VIEW_ICON } from '@/components/ui/view-icons';
import { EvaluationArtifactError, localEvaluations } from '@/lib/evaluations/repository';

type Params = Promise<{ runId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { runId } = await params;
  return { title: `${runId} · 평가 · Snapdone DevHub` };
}

/**
 * run 하나. id는 repository가 식별자 규칙으로 검증하고, 맞지 않거나 없으면 404다. 읽지 못한 run은 이유를 보여 준다.
 * `?variant=` · `?base=`는 이 run의 variant id만, `?show=` · `?cases=`는 필터 이름만 받는다.
 */
export default async function EvalRunPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const repo = await localEvaluations();
  let content;
  try {
    const run = repo.getRun(runId);
    content = <RunDetailView run={run} view={parseRunView(run, query)} />;
  } catch (error) {
    if (!(error instanceof EvaluationArtifactError)) throw error;
    if (error.kind === 'not-found' || error.kind === 'invalid-id') notFound();
    content = <RunProblem error={error} />;
  }
  return (
    <DevHubShell selection={{ view: 'evals' }} inspector={<EvalsGuide />}>
      <Workspace eyebrow="평가 run" icon={VIEW_ICON.evals} title={runId}>
        {content}
      </Workspace>
    </DevHubShell>
  );
}
