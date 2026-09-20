import { notFound } from 'next/navigation';

import { Inspector } from '@/components/entity/inspector';
import { entityParams, findEntity } from '@/lib/catalog/entities';
import { inspect } from '@/lib/catalog/inspection';

type Params = Promise<{ section: string; id: string }>;

export const dynamicParams = false;

export const generateStaticParams = entityParams;

/** 상세 정보 슬롯: 항목 자체. */
export default async function EntityInspector({ params }: { params: Params }) {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  if (!entity) notFound();

  return <Inspector inspection={inspect(entity)} />;
}
