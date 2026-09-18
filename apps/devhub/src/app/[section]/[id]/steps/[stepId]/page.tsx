import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { Inspector } from '@/components/inspector';
import { catalog } from '@/data';
import { findStep } from '@/lib/entities';
import { inspectStep } from '@/lib/inspection';

type Params = Promise<{ section: string; id: string; stepId: string }>;

export const dynamicParams = false;

export const generateStaticParams = () =>
  catalog.scenarios.flatMap((scenario) =>
    scenario.steps.map((step) => ({ section: 'scenarios', id: scenario.id, stepId: step.id })),
  );

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, stepId } = await params;
  const found = findStep(id, stepId);
  return { title: found ? `${found.step.intent} · ${found.scenario.title}` : undefined };
}

/** Inspector for one scenario step, selected from the flow or the step list. */
export default async function StepPage({ params }: { params: Params }) {
  const { section, id, stepId } = await params;
  const found = section === 'scenarios' ? findStep(id, stepId) : undefined;
  if (!found) notFound();

  return <Inspector inspection={inspectStep(found.scenario, found.step)} />;
}
