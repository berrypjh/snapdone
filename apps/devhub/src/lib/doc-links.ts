import { posix } from 'node:path';

import { catalog } from '../data';

/** Where a link written in a repository document goes, once resolved against that document. */
export type DocLink =
  | { kind: 'external'; href: string }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'document'; id: string; path: string; anchor?: string }
  | { kind: 'file'; path: string; anchor?: string };

const documentByPath = new Map(catalog.documents.map((doc) => [doc.path, doc]));

/**
 * Resolves `href` as written in the document at `from` (a repository path). Relative paths are
 * taken from the document's folder, as GitHub does; a cataloged document stays inside DevHub.
 */
export const resolveDocLink = (from: string, href: string): DocLink => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'external', href };
  const [pathPart, hash] = href.split('#', 2);
  const anchor = hash ? decodeURIComponent(hash) : undefined;
  if (!pathPart) return { kind: 'anchor', anchor: anchor ?? '' };
  const path = pathPart.startsWith('/')
    ? posix.normalize(pathPart.slice(1))
    : posix.normalize(posix.join(posix.dirname(from), pathPart));
  const doc = documentByPath.get(path);
  return doc ? { kind: 'document', id: doc.id, path, anchor } : { kind: 'file', path, anchor };
};
