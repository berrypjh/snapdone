import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { EntityHeader } from '@/components/entity-header';
import { findStep, stepParams } from '@/lib/entities';

type Params = Promise<{ section: string; id: string; stepId: string }>;

export const dynamicParams = false;

export const generateStaticParams = stepParams;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, stepId } = await params;
  const found = findStep(id, stepId);
  return { title: found ? `${found.step.intent} · ${found.scenario.title}` : undefined };
}

/** The scenario's workspace header with a step selected; the step itself is in `@inspector`. */
export default async function StepPage({ params }: { params: Params }) {
  const { section, id, stepId } = await params;
  if (section !== 'scenarios' || !findStep(id, stepId)) notFound();

  return <EntityHeader section={section} id={id} />;
}
