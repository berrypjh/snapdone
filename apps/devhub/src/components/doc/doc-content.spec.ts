import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import type { DocumentRef } from '../../domain/model';
import { documentBlocks, documentOutline } from '../../lib/documents';
import { findEntity } from '../../lib/entities';
import { inspect } from '../../lib/inspection';
import { EntityHeader } from '../entity-header';
import { EntitySummary } from '../entity-summary';
import { Inspector } from '../inspector';

import { DocContent } from './doc-content';
import { DOCUMENT_COLUMN, DocumentLayout } from './document-layout';

const render = (doc: DocumentRef) =>
  renderToStaticMarkup(
    createElement(DocContent, { blocks: documentBlocks(doc), from: doc.path, title: doc.title }),
  );
/** Visible text, outside code, with tags removed. */
const visible = (html: string) =>
  html
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<code>[\s\S]*?<\/code>/g, '')
    .replace(/<span class="ui-visually-hidden">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '\n');
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe.each(catalog.documents.map((doc) => [doc.id, doc] as const))('document %s', (_id, doc) => {
  const html = render(doc);

  it('shows no raw Markdown', () => {
    const lines = visible(html)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.filter((line) => /\*\*|\]\(|^#{1,6} |^\||^```/.test(line))).toEqual([]);
  });

  it('gives every section an id and a link to it, and the outline lists them', () => {
    const headings = [...html.matchAll(/<h2 id="([^"]+)"/g)].map(([, id]) => id);
    expect(headings).toEqual(documentOutline(doc).map((item) => item.id));
    for (const id of headings) expect(html).toContain(`href="#${id}"`);
  });

  it('names every table and gives every code block a copy button', () => {
    expect(count(html, /<caption>[^<]+<\/caption>/g)).toBe(count(html, /<table/g));
    expect(count(html, /aria-label="코드 복사: /g)).toBe(count(html, /<pre/g));
  });
});

describe('links between documents', () => {
  it('stay inside DevHub, keeping the heading', () => {
    const foundation = catalog.documents.find((doc) => doc.id === 'foundation') as DocumentRef;
    expect(render(foundation)).toContain(
      'href="/documents/target-architecture#제품-구성--네이티브-셸--웹-콘텐츠"',
    );
  });
});

describe('"이 페이지에서"', () => {
  const entity = findEntity('documents', 'quality-gates');
  if (!entity || entity.section !== 'documents') throw new Error('no quality-gates');
  const outline = documentOutline(entity.record);

  it('sits inside the workspace: folded above the text, and beside it when wide', () => {
    const html = renderToStaticMarkup(createElement(DocumentLayout, { doc: entity.record }));
    const folded = html.match(/<details[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';
    expect(folded).not.toMatch(/<details[^>]* open/);
    expect(folded).toContain('aria-label="이 페이지에서"');
    expect(count(folded, /<li>/g)).toBe(outline.length);
    const beside = html.match(/<nav aria-labelledby="doc-toc-heading"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(beside).toContain('이 페이지에서');
    expect(count(beside, /<li>/g)).toBe(outline.length);
    expect(html.indexOf('<details')).toBeLessThan(html.indexOf('<article'));
  });

  it('is no longer in the inspector', () => {
    const html = renderToStaticMarkup(createElement(Inspector, { inspection: inspect(entity) }));
    expect(html).not.toContain('이 페이지에서');
  });
});

describe('document page column', () => {
  it('centers the header and the document in one shared column', () => {
    const entity = findEntity('documents', 'quality-gates');
    if (!entity || entity.section !== 'documents') throw new Error('no quality-gates');
    const header = renderToStaticMarkup(
      createElement(EntityHeader, { section: 'documents', id: 'quality-gates' }),
    );
    const body = renderToStaticMarkup(createElement(EntitySummary, { entity }));
    for (const html of [header, body]) {
      expect(html.slice(0, 200)).toContain(DOCUMENT_COLUMN);
    }
  });
});
