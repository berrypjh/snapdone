import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { ComparisonView } from '@/components/evals/compare/comparison-view';
import { EvalsGuide } from '@/components/evals/evals-guide';
import { RunProblem } from '@/components/evals/run-detail';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { VIEW_ICON } from '@/components/ui/view-icons';
import { EvaluationArtifactError, localEvaluations } from '@/lib/evaluations/repository';

type Params = Promise<{ comparisonId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { comparisonId } = await params;
  return { title: `${comparisonId} · 비교 · Snapdone DevHub` };
}

/**
 * Go `pnpm eval compare`가 저장한 comparison.json 하나. id는 repository가 식별자 규칙으로 검증하고, 맞지 않거나 없으면
 * 404다. 읽지 못한 비교는 이유를 보여 준다. 비교 · gate 판정을 여기서 다시 하지 않는다.
 */
export default async function EvalComparePage({ params }: { params: Params }) {
  const { comparisonId } = await params;
  const repo = await localEvaluations();
  let content;
  try {
    const comparison = repo.getComparison(comparisonId);
    const runs = new Map(repo.listRuns().map((r) => [r.id, r.metadata?.mode ?? null]));
    content = (
      <ComparisonView
        comparison={comparison}
        runExists={(id) => runs.has(id)}
        runMode={(id) => runs.get(id) ?? null}
      />
    );
  } catch (error) {
    if (!(error instanceof EvaluationArtifactError)) throw error;
    if (error.kind === 'not-found' || error.kind === 'invalid-id') notFound();
    content = <RunProblem error={error} />;
  }
  return (
    <DevHubShell inspector={<EvalsGuide />}>
      <Workspace eyebrow="평가 비교" icon={VIEW_ICON.evals} title={comparisonId}>
        {content}
      </Workspace>
    </DevHubShell>
  );
}
