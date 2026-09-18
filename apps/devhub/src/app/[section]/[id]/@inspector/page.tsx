import { notFound } from 'next/navigation';

import { Inspector } from '@/components/inspector';
import { entityParams, findEntity } from '@/lib/entities';
import { inspect } from '@/lib/inspection';

type Params = Promise<{ section: string; id: string }>;

export const dynamicParams = false;

export const generateStaticParams = entityParams;

/** Inspector slot: the entity itself. */
export default async function EntityInspector({ params }: { params: Params }) {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  if (!entity) notFound();

  return <Inspector inspection={inspect(entity)} />;
}
