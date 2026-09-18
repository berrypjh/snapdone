import { notFound } from 'next/navigation';

import { Inspector } from '@/components/inspector';
import { findEntity, SECTIONS } from '@/lib/entities';
import { inspect } from '@/lib/inspection';

type Params = Promise<{ section: string; id: string }>;

export const dynamicParams = false;

export const generateStaticParams = () =>
  SECTIONS.flatMap((section) =>
    section.entities.map((entity) => ({ section: section.id, id: entity.id })),
  );

/** Inspector for the entity itself. */
export default async function EntityPage({ params }: { params: Params }) {
  const { section, id } = await params;
  const entity = findEntity(section, id);
  if (!entity) notFound();

  return <Inspector inspection={inspect(entity)} />;
}
