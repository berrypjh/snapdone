import { documentBlocks, documentOutline, type ReadableDoc } from '@/lib/markdown/documents';

import { AnchorFlash } from '../ui/anchor-flash';
import { Icon } from '../ui/icon';

import { DocContent } from './doc-content';
import { DocToc } from './doc-toc';

/**
 * 문서 페이지의 가운데 칸 — 본문 46rem에 옆의 목차를 더한 폭. 헤더 · 본문 · 뒤따르는 내용이
 * 같이 쓰기 때문에 왼쪽 끝이 맞는다.
 */
export const DOCUMENT_COLUMN = 'mx-auto w-full max-w-[61rem]';

/**
 * 문서와 "이 페이지에서"를 작업 영역 안에 함께 둔다. 넓으면 본문 옆에서 스크롤을 따라가고,
 * 좁으면 본문 위에 접어 둔다. 기준 폭은 화면이 아니라 작업 영역이다(container query).
 */
export function DocumentLayout({ doc }: { doc: ReadableDoc }) {
  const outline = documentOutline(doc);
  const content = (
    <>
      <AnchorFlash />
      <DocContent blocks={documentBlocks(doc)} from={doc.path} title={doc.title} />
    </>
  );
  if (outline.length === 0) return content;

  return (
    <div className="@container">
      <div className="flex items-start gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <details className="rounded-md border border-stroke-light bg-background-surface @3xl:hidden">
            <summary className="cursor-pointer px-3 py-2 typo-body-small-strong">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="document" className="text-text-light" />이 페이지에서
                <span className="typo-caption-small text-text-light">{outline.length}</span>
              </span>
            </summary>
            <nav aria-label="이 페이지에서" className="px-3 pb-3">
              <DocToc items={outline} />
            </nav>
          </details>
          {content}
        </div>
        <nav
          aria-labelledby="doc-toc-heading"
          className="sticky top-4 hidden max-h-[calc(100dvh-6rem)] w-52 shrink-0 overflow-y-auto @3xl:block"
        >
          <p
            id="doc-toc-heading"
            className="mb-2 flex items-center gap-1.5 typo-caption-small text-text-light"
          >
            <Icon name="document" />이 페이지에서
          </p>
          <DocToc items={outline} />
        </nav>
      </div>
    </div>
  );
}
