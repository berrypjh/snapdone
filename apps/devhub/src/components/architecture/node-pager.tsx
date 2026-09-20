'use client';

import { useSearchParams } from 'next/navigation';

import { pagerOf } from '@/lib/browser/pager';
import { filterHref, parseArchitectureFilters } from '@/lib/catalog/filters';
import type { NodeOrder } from '@/lib/catalog/inspection';

import { Pager } from '../entity/pager';

/**
 * URL의 종류 필터 안에서 이전 · 다음 구성 요소로 넘기고, 링크에 필터를 유지한다. 필터 밖
 * 구성 요소(관계를 따라 들어온 경우)는 전체를 대상으로 넘긴다.
 */
export function NodePager({ order }: { order: NodeOrder }) {
  const active = parseArchitectureFilters(Object.fromEntries(useSearchParams().entries()));
  const filtered = order.nodes
    .filter((node) => !active.kind || node.kind === active.kind)
    .map((node) => ({ ...node, href: filterHref(node.href, active, 'kind', active.kind) }));
  const pager =
    pagerOf('구성 요소', filtered, order.current) ??
    pagerOf('구성 요소', order.nodes, order.current);
  return pager ? <Pager pager={pager} /> : null;
}
