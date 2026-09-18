import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { architectureModel, filterModel } from '../../lib/architecture-layout';

import { ArchitectureMap } from './architecture-map';
import { ArchitectureOutline } from './architecture-outline';

const nav = vi.hoisted(() => ({ selected: null as string | null }));
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => nav.selected }));

const model = architectureModel();
const render = (kind?: string, query?: string) =>
  renderToStaticMarkup(createElement(ArchitectureMap, { model, kind, query }));
const nodeLinks = (html: string) => html.match(/href="\/architecture\/[^"]+"/g) ?? [];
const edgePaths = (html: string) => html.match(/marker-end=/g) ?? [];

describe('ArchitectureMap filter', () => {
  it('shows every node without a filter', () => {
    expect(nodeLinks(render())).toHaveLength(model.nodes.length);
  });

  it('keeps only nodes of the kind, and the filter on their links', () => {
    const html = render('library', 'kind=library');
    const libraries = model.nodes.filter((node) => node.nodeKind === 'library');
    expect(libraries.length).toBeGreaterThan(0);
    expect(nodeLinks(html)).toEqual(libraries.map((node) => `href="${node.href}?kind=library"`));
  });

  it('drops edges whose other end is filtered out', () => {
    const html = render('application', 'kind=application');
    const kept = model.edges.filter((edge) =>
      [edge.from, edge.to].every(
        (id) => model.nodes.find((node) => node.id === id)?.nodeKind === 'application',
      ),
    );
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(model.edges.length);
    expect(edgePaths(render())).toHaveLength(model.edges.length);
    expect(edgePaths(html)).toHaveLength(kept.length);
  });

  it('shows an empty state when nothing matches', () => {
    expect(render('none')).toContain('조건에 맞는 구성 요소가 없습니다');
  });
});

describe('ArchitectureMap summary and selection', () => {
  it('states the counts and the selection in text', () => {
    nav.selected = null;
    expect(render()).toContain(
      `구성 요소 ${model.nodes.length}개 · 관계 ${model.edges.length}개 · 선택: 없음`,
    );
    const node = model.nodes[0];
    nav.selected = node.id;
    const html = render();
    nav.selected = null;
    expect(html).toContain(`선택: ${node.label}`);
    expect(html).toContain('· 선택됨');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="#inspector"');
  });
});

describe('ArchitectureOutline', () => {
  const outline = (kind?: string, query?: string) =>
    renderToStaticMarkup(createElement(ArchitectureOutline, { model, kind, query }));

  const headingLinks = (html: string) =>
    [...html.matchAll(/<h3[^>]*>[\s\S]*?<\/h3>/g)].flatMap(([heading]) => nodeLinks(heading));
  const articles = (html: string) => html.split('<article').slice(1);

  it('lists the same nodes as the drawing, with the filter kept on links', () => {
    expect(headingLinks(outline())).toEqual(nodeLinks(render()));
    expect(headingLinks(outline('library', 'kind=library'))).toEqual(
      nodeLinks(render('library', 'kind=library')),
    );
    expect(
      nodeLinks(outline('library', 'kind=library')).every((link) =>
        link.endsWith('?kind=library"'),
      ),
    ).toBe(true);
  });

  it('lists each drawn relation under both ends, linking the other node', () => {
    for (const kind of [undefined, 'application']) {
      const { nodes, edges } = filterModel(model, kind);
      const html = outline(kind);
      articles(html).forEach((article, index) => {
        const id = nodes[index].id;
        const touching = edges.filter((edge) => edge.from === id || edge.to === id).length;
        expect({ id, links: nodeLinks(article).length }).toEqual({ id, links: 1 + touching });
        for (const edge of edges.filter((e) => e.from === id)) {
          expect(article).toContain(`나가는 관계`);
          expect(article).toContain(`· ${edge.text}`);
        }
      });
    }
  });

  it('shows the same empty state as the drawing', () => {
    expect(outline('none')).toContain('조건에 맞는 구성 요소가 없습니다');
  });
});
