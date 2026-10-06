import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { EvalsGuide } from '@/components/evals/evals-guide';
import { EvalsOverviewContent } from '@/components/evals/evals-overview-content';
import { DevHubShell } from '@/components/shell/devhub-shell';
import { Workspace } from '@/components/shell/workspace';
import { VIEW_ICON } from '@/components/ui/view-icons';
import { type Task, TASKS } from '@/lib/evaluations/contract';
import { TASK_LABELS } from '@/lib/evaluations/presentation';

type Params = Promise<{ task: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const isTask = (value: string): value is Task => (TASKS as readonly string[]).includes(value);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { task } = await params;
  return { title: `${isTask(task) ? TASK_LABELS[task] : task} · 평가 · Snapdone DevHub` };
}

/** 과제 하나의 run · 비교 · 추세. 모르는 과제는 404다. */
export default async function EvalTaskPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ task }, { dataset }] = await Promise.all([params, searchParams]);
  if (!isTask(task)) notFound();
  return (
    <DevHubShell inspector={<EvalsGuide />}>
      <Workspace eyebrow="평가" icon={VIEW_ICON.evals} title={TASK_LABELS[task]}>
        <EvalsOverviewContent task={task} query={{ task, dataset }} />
      </Workspace>
    </DevHubShell>
  );
}
