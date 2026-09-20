import { notFound } from 'next/navigation';

import { Inspector } from '@/components/entity/inspector';
import { findStep, stepParams } from '@/lib/catalog/entities';
import { inspectStep } from '@/lib/catalog/inspection';

type Params = Promise<{ section: string; id: string; stepId: string }>;

export const dynamicParams = false;

export const generateStaticParams = stepParams;

/** 상세 정보 슬롯: 흐름이나 단계 목록에서 고른 시나리오 단계 하나. */
export default async function StepInspector({ params }: { params: Params }) {
  const { section, id, stepId } = await params;
  const found = section === 'scenarios' ? findStep(id, stepId) : undefined;
  if (!found) notFound();

  return <Inspector inspection={inspectStep(found.scenario, found.step)} />;
}
