import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { Inspector } from '@/components/inspector';
import { catalog } from '@/data';
import { findNode, nodeLabel } from '@/lib/architecture';
import { inspectNode } from '@/lib/inspection';

type Params = Promise<{ nodeId: string }>;

export const dynamicParams = false;

export const generateStaticParams = () => catalog.nodes.map((node) => ({ nodeId: node.id }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const node = findNode((await params).nodeId);
  return { title: node ? `${nodeLabel(node)} · 아키텍처` : undefined };
}

/** Inspector for one architecture node, selected from the map or a relation link. */
export default async function ArchitectureNodePage({ params }: { params: Params }) {
  const node = findNode((await params).nodeId);
  if (!node) notFound();

  return <Inspector inspection={inspectNode(node)} />;
}
