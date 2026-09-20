import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DocumentRef } from '../../domain/model';
import { REPOSITORY_ROOT } from '../repository/snapshot';

import { type Block, parseMarkdown } from './markdown';

export type OutlineItem = { id: string; title: string };

/** 문서 페이지로 그려지는 것. 저장소의 마크다운 파일과 그 제목이다. */
export type ReadableDoc = Pick<DocumentRef, 'path' | 'title'>;

const parsed = new Map<string, Block[]>();

/**
 * 문서 본문. 페이지를 빌드할 때 읽어서 파싱한다. 맨 앞의 `# title`은 이미 페이지 제목이라 뺀다.
 */
export const documentBlocks = (doc: ReadableDoc): Block[] => {
  const cached = parsed.get(doc.path);
  if (cached) return cached;
  if (!REPOSITORY_ROOT) return [];
  const blocks = parseMarkdown(readFileSync(join(REPOSITORY_ROOT, doc.path), 'utf8'));
  const body = blocks[0]?.kind === 'heading' && blocks[0].level === 1 ? blocks.slice(1) : blocks;
  parsed.set(doc.path, body);
  return body;
};

/**
 * "이 페이지에서"에 쓰는 문서의 절. 절(`h2`)로 그려지는 모든 제목, 즉 2단계와
 * 제목 뒤에 오는 1단계(부로 나뉜 문서)다.
 */
export const documentOutline = (doc: ReadableDoc): OutlineItem[] =>
  documentBlocks(doc).flatMap((block) =>
    block.kind === 'heading' && block.level <= 2 ? [{ id: block.id, title: block.text }] : [],
  );
