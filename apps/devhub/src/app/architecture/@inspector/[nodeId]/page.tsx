import { notFound } from 'next/navigation';

import { Inspector } from '@/components/inspector';
import { findNode, nodeParams } from '@/lib/architecture';
import { inspectNode } from '@/lib/inspection';

type Params = Promise<{ nodeId: string }>;

export const dynamicParams = false;

export const generateStaticParams = nodeParams;

/** Inspector slot: one architecture node, selected from the map or a relation link. */
export default async function NodeInspector({ params }: { params: Params }) {
  const node = findNode((await params).nodeId);
  if (!node) notFound();

  return <Inspector inspection={inspectNode(node)} />;
}
