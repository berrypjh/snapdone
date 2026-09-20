import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { EntityHeader } from '@/components/entity/entity-header';
import { findStep, stepParams } from '@/lib/catalog/entities';

type Params = Promise<{ section: string; id: string; stepId: string }>;

export const dynamicParams = false;

export const generateStaticParams = stepParams;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, stepId } = await params;
  const found = findStep(id, stepId);
  return { title: found ? `${found.step.intent} · ${found.scenario.title}` : undefined };
}

/** 단계를 고른 상태의 시나리오 작업 영역 머리말. 단계 자체는 `@inspector`에 있다. */
export default async function StepPage({ params }: { params: Params }) {
  const { section, id, stepId } = await params;
  if (section !== 'scenarios' || !findStep(id, stepId)) notFound();

  return <EntityHeader section={section} id={id} />;
}
