import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { ArchitectureHeader } from '@/components/architecture/architecture-header';
import { findNode, nodeLabel, nodeParams } from '@/lib/architecture';

type Params = Promise<{ nodeId: string }>;

export const dynamicParams = false;

export const generateStaticParams = nodeParams;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const node = findNode((await params).nodeId);
  return { title: node ? `${nodeLabel(node)} · 아키텍처` : undefined };
}

/** The architecture workspace header with a node selected; the node itself is in `@inspector`. */
export default async function ArchitectureNodePage({ params }: { params: Params }) {
  if (!findNode((await params).nodeId)) notFound();

  return <ArchitectureHeader />;
}
