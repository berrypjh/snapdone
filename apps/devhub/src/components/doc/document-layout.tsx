import type { DocumentRef } from '@/domain/model';
import { documentBlocks, documentOutline } from '@/lib/documents';

import { Icon } from '../icon';

import { DocContent } from './doc-content';
import { DocToc } from './doc-toc';

/**
 * The centered column of a document page — text (46rem) plus the outline beside it — shared by
 * the header, the text, and what follows, so their left edges line up, as in the reference docs.
 */
export const DOCUMENT_COLUMN = 'mx-auto w-full max-w-[61rem]';

/**
 * A document with its "이 페이지에서" inside the workspace, as the reference docs do: beside the
 * text, following the scroll, when the workspace is wide; folded above the text when it is not.
 * The width that matters is the workspace's (a container query), not the screen's — the side
 * panes take a different share at each breakpoint.
 */
export function DocumentLayout({ doc }: { doc: DocumentRef }) {
  const outline = documentOutline(doc);
  const content = <DocContent blocks={documentBlocks(doc)} from={doc.path} title={doc.title} />;
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
