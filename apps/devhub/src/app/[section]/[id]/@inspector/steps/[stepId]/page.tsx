import { notFound } from 'next/navigation';

import { Inspector } from '@/components/inspector';
import { findStep, stepParams } from '@/lib/entities';
import { inspectStep } from '@/lib/inspection';

type Params = Promise<{ section: string; id: string; stepId: string }>;

export const dynamicParams = false;

export const generateStaticParams = stepParams;

/** Inspector slot: one scenario step, selected from the flow or the step list. */
export default async function StepInspector({ params }: { params: Params }) {
  const { section, id, stepId } = await params;
  const found = section === 'scenarios' ? findStep(id, stepId) : undefined;
  if (!found) notFound();

  return <Inspector inspection={inspectStep(found.scenario, found.step)} />;
}
