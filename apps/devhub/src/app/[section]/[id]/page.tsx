import { EntityHeader } from '@/components/entity-header';
import { entityParams } from '@/lib/entities';

type Params = Promise<{ section: string; id: string }>;

export const dynamicParams = false;

export const generateStaticParams = entityParams;

/**
 * The entity's workspace header. It is the page segment so that after a navigation Next scrolls
 * to and focuses the top of the workspace, not the inspector (the `@inspector` slot).
 */
export default async function EntityPage({ params }: { params: Params }) {
  const { section, id } = await params;
  return <EntityHeader section={section} id={id} />;
}
