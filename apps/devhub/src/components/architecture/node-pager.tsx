'use client';

import { useSearchParams } from 'next/navigation';

import { filterHref, parseArchitectureFilters } from '@/lib/filters';
import type { NodeOrder } from '@/lib/inspection';
import { pagerOf } from '@/lib/pager';

import { Pager } from '../pager';

/**
 * Previous and next architecture node within the kind filter in the URL, keeping the filter on
 * the links. A node outside the filter (reached through a relation) pages through every node.
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
