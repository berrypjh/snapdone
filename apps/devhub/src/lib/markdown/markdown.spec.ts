import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { read } from '../../test-support/repository-files';

import { type Block, type Inline, inlineText, parseInline, parseMarkdown, slug } from './markdown';

const texts = (inline: Inline[]): string[] =>
  inline.flatMap((node) =>
    node.kind === 'text' ? [node.text] : node.kind === 'code' ? [] : texts(node.children),
  );

/** 문서 안의 모든 일반 텍스트. 코드는 뺀다. */
const allText = (blocks: Block[]): string[] =>
  blocks.flatMap((block) => {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        return texts(block.inline);
      case 'list':
        return block.items.flatMap(allText);
      case 'table':
        return [...block.head, ...block.rows.flat()].flatMap(texts);
      case 'quote':
        return allText(block.blocks);
      default:
        return [];
    }
  });

describe('parseInline', () => {
  it('reads code, bold, links, and escapes', () => {
    expect(parseInline('a `b | c` **d `e`** [f `g`](h.md#i) \\| j')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'b | c' },
      { kind: 'text', text: ' ' },
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'd ' },
          { kind: 'code', text: 'e' },
        ],
      },
      { kind: 'text', text: ' ' },
      {
        kind: 'link',
        href: 'h.md#i',
        children: [
          { kind: 'text', text: 'f ' },
          { kind: 'code', text: 'g' },
        ],
      },
      { kind: 'text', text: ' | j' },
    ]);
  });
});

describe('slug', () => {
  it('matches the anchors documents already use (GitHub style)', () => {
    expect(slug('제품 구성 — 네이티브 셸 + 웹 콘텐츠')).toBe('제품-구성--네이티브-셸--웹-콘텐츠');
    expect(slug(inlineText(parseInline('Go API는 `.env`를 읽지 않는다')))).toBe(
      'go-api는-env를-읽지-않는다',
    );
  });
});

describe('parseMarkdown', () => {
  it('reads headings, lists with nested items and code, tables, quotes', () => {
    const blocks = parseMarkdown(
      [
        '# Title',
        '## Part',
        '## Part',
        '1. one',
        '   - nested',
        '2. two',
        '',
        '   ```bash',
        '   pnpm test',
        '   ```',
        '',
        '| a | b `x \\| y` |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '> note',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'heading',
      'heading',
      'list',
      'table',
      'quote',
    ]);
    expect(blocks.slice(1, 3).map((b) => (b.kind === 'heading' ? b.id : ''))).toEqual([
      'part',
      'part-1',
    ]);
    const list = blocks[3];
    if (list.kind !== 'list') throw new Error('list');
    expect(list.ordered).toBe(true);
    expect(list.items[0].map((b) => b.kind)).toEqual(['paragraph', 'list']);
    expect(list.items[1].map((b) => b.kind)).toEqual(['paragraph', 'code']);
    const table = blocks[4];
    if (table.kind !== 'table') throw new Error('table');
    expect(table.head.map(inlineText)).toEqual(['a', 'b x | y']);
    expect(table.rows.map((row) => row.map(inlineText))).toEqual([['1', '2']]);
  });

  it.each(catalog.documents.map((doc) => [doc.path]))(
    'reads %s without Markdown leaking into the text',
    (path) => {
      const blocks = parseMarkdown(read(path));
      const leaks = allText(blocks).filter(
        (text) =>
          text.includes('**') || text.includes('](') || /^\s*(#{1,6} |\||```|[-*] |> )/.test(text),
      );
      expect(leaks).toEqual([]);
      const ids = blocks.flatMap((b) => (b.kind === 'heading' ? [b.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
});
