import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type Block,
  bodyOf,
  type Inline,
  type OutlineItem,
  outlineOf,
  parseMarkdown,
} from '@berrypjh/devhub-ui';

import type { DocumentRef } from '../../domain/model';
import { REPOSITORY_ROOT } from '../repository/snapshot';
import { sourceLinks } from '../repository/source-links';

import { resolveDocLink } from './doc-links';

/** 문서 페이지로 그려지는 것. 저장소의 마크다운 파일과 그 제목이다. */
export type ReadableDoc = Pick<DocumentRef, 'path' | 'title'>;

/**
 * 문서에 적힌 링크 하나가 화면에서 가는 곳. 서버에서 풀어 client의 `renderLink`에 값으로 넘긴다 —
 * 저장소 파일 · 커밋을 읽어야 해서 브라우저에서는 풀 수 없다.
 */
export type ResolvedLink =
  | { kind: 'page'; to: string }
  | { kind: 'anchor'; to: string }
  | { kind: 'external'; href: string }
  | { kind: 'none' };

export type DocumentView = {
  blocks: Block[];
  outline: OutlineItem[];
  links: Record<string, ResolvedLink>;
  images: Record<string, string>;
};

const parsed = new Map<string, Block[]>();

/** 문서 본문. 페이지를 빌드할 때 읽어서 파싱한다. 맨 앞의 `# title`은 이미 페이지 제목이라 뺀다. */
const documentBlocks = (doc: ReadableDoc): Block[] => {
  const cached = parsed.get(doc.path);
  if (cached) return cached;
  if (!REPOSITORY_ROOT) return [];
  const body = bodyOf(parseMarkdown(readFileSync(join(REPOSITORY_ROOT, doc.path), 'utf8')));
  parsed.set(doc.path, body);
  return body;
};

/** 본문에 적힌 링크 href · 그림 src 전부. 링크 검사(freshness)도 같은 목록을 본다. */
export const referencesIn = (blocks: Block[]): { hrefs: string[]; images: string[] } => {
  const hrefs: string[] = [];
  const images: string[] = [];
  const inline = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.kind === 'link') hrefs.push(node.href);
      if (node.kind === 'link' || node.kind === 'strong' || node.kind === 'em')
        inline(node.children);
    }
  };
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.kind === 'heading' || block.kind === 'paragraph') inline(block.inline);
      if (block.kind === 'table') [...block.head, ...block.rows.flat()].forEach(inline);
      if (block.kind === 'list') block.items.forEach((item) => walk(item.blocks));
      if (block.kind === 'quote') walk(block.blocks);
      if (block.kind === 'image') images.push(block.src);
    }
  };
  walk(blocks);
  return { hrefs, images };
};

/** 다른 문서 · 기록은 DevHub 안의 페이지로, 저장소 파일은 고정 링크로, 나머지는 그대로 밖으로. */
const resolveLink = (from: string, href: string): ResolvedLink => {
  const link = resolveDocLink(from, href);
  const hash = link.kind !== 'external' && link.anchor ? `#${link.anchor}` : '';
  switch (link.kind) {
    case 'anchor':
      return { kind: 'anchor', to: `#${link.anchor}` };
    case 'document':
      return { kind: 'page', to: `/${link.section}/${link.id}${hash}` };
    case 'external':
      return { kind: 'external', href: link.href };
    default: {
      const { permalink, latest } = sourceLinks({ path: link.path });
      const base = permalink ?? latest;
      return base ? { kind: 'external', href: `${base}${hash}` } : { kind: 'none' };
    }
  }
};

/** 문서 한 편을 그리는 데 필요한 값 전부. 링크 · 그림 주소는 서버에서 미리 푼다. */
export const documentView = (doc: ReadableDoc): DocumentView => {
  const blocks = documentBlocks(doc);
  const { hrefs, images } = referencesIn(blocks);
  return {
    blocks,
    outline: outlineOf(blocks),
    links: Object.fromEntries(hrefs.map((href) => [href, resolveLink(doc.path, href)])),
    images: Object.fromEntries(
      images.flatMap((src) => {
        const link = resolveDocLink(doc.path, src);
        return link.kind === 'file' ? [[src, `/doc-image/${link.path}`]] : [];
      }),
    ),
  };
};
