import { DocumentLayout as SharedDocumentLayout } from '@berrypjh/devhub-ui';

import { documentView, type ReadableDoc } from '@/lib/markdown/documents';

import { RepositoryDocContent } from './doc-content';

/** 문서 · 기록 페이지 헤더의 폭. 본문을 감싸는 공용 `DocumentColumn`과 같은 폭이라 왼쪽 끝이 맞는다. */
export const DOCUMENT_COLUMN = 'mx-auto w-full max-w-[61rem]';

/** 저장소 문서 한 편과 "이 페이지에서". 읽기 · 링크 풀기는 서버, 그리기는 공용 컴포넌트다. */
export function DocumentLayout({ doc }: { doc: ReadableDoc }) {
  const { blocks, outline, links, images } = documentView(doc);
  return (
    <SharedDocumentLayout outline={outline}>
      <RepositoryDocContent blocks={blocks} title={doc.title} links={links} images={images} />
    </SharedDocumentLayout>
  );
}
