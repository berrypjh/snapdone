'use client';

import {
  type Block,
  DocContent,
  Icon,
  useDevHubLink,
  useDevHubLocation,
} from '@berrypjh/devhub-ui';
import { VisuallyHidden } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import type { ResolvedLink } from '@/lib/markdown/documents';

/**
 * 저장소 문서를 공용 `DocContent`로 그린다. 링크 · 그림이 어디로 가는지는 서버가 미리 푼 값(`links` ·
 * `images`)이고, 여기서는 그 값을 모양으로만 바꾼다 — 앱 안 페이지는 앱 링크, 밖은 새 창.
 */
export function RepositoryDocContent({
  blocks,
  title,
  links,
  images,
}: {
  blocks: Block[];
  title: string;
  links: Record<string, ResolvedLink>;
  images: Record<string, string>;
}) {
  const Link = useDevHubLink();
  const { hash } = useDevHubLocation();

  const renderLink = (href: string, children: ReactNode) => {
    const link = links[href] ?? { kind: 'none' };
    switch (link.kind) {
      case 'page':
        return <Link to={link.to}>{children}</Link>;
      case 'anchor':
        return <a href={link.to}>{children}</a>;
      case 'external':
        return (
          <a href={link.href} target="_blank" rel="noopener noreferrer">
            {children}
            <Icon name="external" className="ml-0.5 inline align-text-top" />
            <VisuallyHidden> (새 창)</VisuallyHidden>
          </a>
        );
      default:
        return children;
    }
  };

  return (
    <DocContent
      blocks={blocks}
      title={title}
      renderLink={renderLink}
      resolveImage={(src) => images[src]}
      hash={hash}
    />
  );
}
