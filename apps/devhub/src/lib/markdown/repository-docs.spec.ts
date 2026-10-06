import {
  type Block,
  type Inline,
  inlineText,
  parseInline,
  parseMarkdown,
  slug,
} from '@berrypjh/devhub-ui';
import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { read } from '../../test-support/repository-files';

/**
 * 공용 markdown 파서가 이 저장소의 실제 문서를 읽는지. 문법 단위 테스트는 `@berrypjh/devhub-ui`가 가진다 —
 * 여기는 snapdone 문서에서 Markdown이 글자로 새지 않고, 문서들이 서로 거는 앵커가 같은지만 본다.
 */

const texts = (inline: Inline[]): string[] =>
  inline.flatMap((node) => {
    switch (node.kind) {
      case 'text':
        return [node.text];
      case 'strong':
      case 'em':
      case 'link':
        return texts(node.children);
      default:
        return [];
    }
  });

/** 문서 안의 모든 일반 텍스트. 코드는 뺀다. */
const allText = (blocks: Block[]): string[] =>
  blocks.flatMap((block) => {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        return texts(block.inline);
      case 'list':
        return block.items.flatMap((item) => allText(item.blocks));
      case 'table':
        return [...block.head, ...block.rows.flat()].flatMap(texts);
      case 'quote':
        return allText(block.blocks);
      default:
        return [];
    }
  });

describe('slug', () => {
  it('matches the anchors snapdone documents already use (GitHub style)', () => {
    expect(slug('제품 구성 — 네이티브 셸 + 웹 콘텐츠')).toBe('제품-구성--네이티브-셸--웹-콘텐츠');
    expect(slug(inlineText(parseInline('Go API는 `.env`를 읽지 않는다')))).toBe(
      'go-api는-env를-읽지-않는다',
    );
  });
});

describe('repository documents', () => {
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
