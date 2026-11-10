import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { catalog } from '../../data';
import { findEntity } from '../../lib/catalog/entities';

import { EntitySummary } from './entity-summary';

type ProjectSection = 'applications' | 'libraries';

vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => null }));

const projects = catalog.nodes.flatMap((node): [ProjectSection, string][] =>
  node.kind === 'application'
    ? [['applications', node.id]]
    : node.kind === 'library'
      ? [['libraries', node.id]]
      : [],
);

describe.each(projects)('%s %s summary', (section, id) => {
  const entity = findEntity(section, id);
  if (!entity) throw new Error(`no ${section} ${id}`);
  const html = renderToStaticMarkup(createElement(EntitySummary, { entity }));
  const related = catalog.relations.filter((r) => r.from === id || r.to === id);

  it('draws the relation picture only when the project has relations', () => {
    expect(html.includes('의 관계 그림')).toBe(related.length > 0);
  });

  it('keeps the list as the source of the same relations', () => {
    expect(html).toContain('관계');
    if (related.length === 0) expect(html).toContain('관계 없음');
  });

  it('lists the API endpoints only for the project that serves them', () => {
    const [root] = catalog.nodes.flatMap((node) =>
      node.kind !== 'external' && node.id === id ? [node.root] : [],
    );
    const served = catalog.apis.filter((api) => api.handler.path.startsWith(`${root}/`));
    expect(html.includes('API endpoint')).toBe(served.length > 0);
    if (served.length === 0) return;
    expect(html).toContain(`API endpoint ${served.length}개`);
    for (const api of served) {
      expect(html).toContain(`${api.method} ${api.path}`);
      expect(html).toContain(`href="/source?path=${encodeURIComponent(api.handler.path)}"`);
    }
  });
});
