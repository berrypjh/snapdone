import { notFound } from 'next/navigation';

import { Inspector } from '@/components/entity/inspector';
import { findNode, nodeParams } from '@/lib/catalog/architecture';
import { inspectNode } from '@/lib/catalog/inspection';

type Params = Promise<{ nodeId: string }>;

export const dynamicParams = false;

export const generateStaticParams = nodeParams;

/** 상세 정보 슬롯: 지도나 관계 링크에서 고른 아키텍처 구성 요소 하나. */
export default async function NodeInspector({ params }: { params: Params }) {
  const node = findNode((await params).nodeId);
  if (!node) notFound();

  return <Inspector inspection={inspectNode(node)} />;
}
