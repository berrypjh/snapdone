import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DocumentRef } from '../domain/model';

import { type Block, parseMarkdown } from './markdown';
import { REPOSITORY_ROOT } from './snapshot';

export type OutlineItem = { id: string; title: string };

const parsed = new Map<string, Block[]>();

/**
 * A document's body, read and parsed when the page is built. The leading `# title` is the page
 * title already, so it is left out.
 */
export const documentBlocks = (doc: DocumentRef): Block[] => {
  const cached = parsed.get(doc.path);
  if (cached) return cached;
  if (!REPOSITORY_ROOT) return [];
  const blocks = parseMarkdown(readFileSync(join(REPOSITORY_ROOT, doc.path), 'utf8'));
  const body = blocks[0]?.kind === 'heading' && blocks[0].level === 1 ? blocks.slice(1) : blocks;
  parsed.set(doc.path, body);
  return body;
};

/**
 * The document's sections, for "이 페이지에서": every heading drawn as a section (`h2`) — level 2,
 * and any level 1 after the title (a document split into parts).
 */
export const documentOutline = (doc: DocumentRef): OutlineItem[] =>
  documentBlocks(doc).flatMap((block) =>
    block.kind === 'heading' && block.level <= 2 ? [{ id: block.id, title: block.text }] : [],
  );
