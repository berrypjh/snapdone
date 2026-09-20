import { posix } from 'node:path';

import { catalog } from '../data';

/** 저장소 문서에 적힌 링크를 그 문서 기준으로 풀었을 때 향하는 곳. */
export type DocLink =
  | { kind: 'external'; href: string }
  | { kind: 'anchor'; anchor: string }
  | {
      kind: 'document';
      section: 'documents' | 'records';
      id: string;
      path: string;
      anchor?: string;
    }
  | { kind: 'file'; path: string; anchor?: string };

/** DevHub가 그리는 두 종류의 마크다운 페이지. 둘 사이 링크는 앱 밖으로 나가지 않는다. */
const pageByPath = new Map<string, { section: 'documents' | 'records'; id: string }>([
  ...catalog.documents.map(
    (doc) => [doc.path, { section: 'documents' as const, id: doc.id }] as const,
  ),
  ...catalog.records.map((rec) => [rec.path, { section: 'records' as const, id: rec.id }] as const),
]);

/**
 * `from`(저장소 경로) 문서에 적힌 `href`를 푼다. 상대 경로는 GitHub처럼 그 문서의 폴더 기준이고,
 * 카탈로그에 있는 문서나 기록은 DevHub 안에서 각자의 섹션 페이지로 간다.
 */
export const resolveDocLink = (from: string, href: string): DocLink => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: 'external', href };
  const [pathPart, hash] = href.split('#', 2);
  const anchor = hash ? decodeURIComponent(hash) : undefined;
  if (!pathPart) return { kind: 'anchor', anchor: anchor ?? '' };
  const path = pathPart.startsWith('/')
    ? posix.normalize(pathPart.slice(1))
    : posix.normalize(posix.join(posix.dirname(from), pathPart));
  const page = pageByPath.get(path);
  return page
    ? { kind: 'document', section: page.section, id: page.id, path, anchor }
    : { kind: 'file', path, anchor };
};
