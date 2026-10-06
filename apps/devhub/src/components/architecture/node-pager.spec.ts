import { createElement } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { catalog } from '../../data';
import { findNode } from '../../lib/catalog/architecture';
import { architectureModel } from '../../lib/catalog/architecture-layout';
import { inspectNode } from '../../lib/catalog/inspection';
import { renderInDevHub } from '../../test-support/devhub-provider';

import { NodePager } from './node-pager';

const nav = vi.hoisted(() => ({ query: '' }));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));

const inspectionOf = (id: string) => {
  const node = findNode(id);
  if (!node) throw new Error(`no node ${id}`);
  return inspectNode(node);
};

/** 페이지 search params를 `query`로 두었을 때 구성 요소 `id`의 넘김 링크 href 목록. */
const pagerHrefs = (id: string, query = '') => {
  nav.query = query;
  const order = inspectionOf(id).nodeOrder;
  if (!order) throw new Error(`no node order for ${id}`);
  const html = renderInDevHub(createElement(NodePager, { order }));
  return [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
};

const nodes = architectureModel().nodes;
const libraries = nodes.filter((node) => node.nodeKind === 'library');

describe('node pager', () => {
  it('follows the list order of the architecture view', () => {
    const order = inspectionOf(catalog.nodes[0].id).nodeOrder;
    expect(order?.nodes.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
  });

  it('pages within the kind filter and keeps it on the links', () => {
    expect(pagerHrefs(libraries[0].id, 'kind=library')).toEqual([
      `/architecture/${libraries[1].id}?kind=library#devhub-inspector`,
    ]);
  });

  it('pages through every node when the current one is outside the filter', () => {
    expect(nodes[0].nodeKind).not.toBe('library');
    expect(pagerHrefs(nodes[0].id, 'kind=library')).toEqual([
      `/architecture/${nodes[1].id}#devhub-inspector`,
    ]);
  });
});

describe('node relations', () => {
  it('link each relation to the node at its other end, landing on its details', () => {
    const relations = catalog.relations.filter((r) => r.from === 'web' || r.to === 'web');
    const fact = inspectionOf('web').facts.find((f) => f.term === '관계');
    expect(fact?.details).toHaveLength(relations.length);
    expect(fact?.details.map((detail) => typeof detail !== 'string' && detail.href)).toEqual(
      relations.map((r) => `/architecture/${r.from === 'web' ? r.to : r.from}`),
    );
  });
});
