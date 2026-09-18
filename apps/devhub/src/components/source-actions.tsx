import { VisuallyHidden } from '@berrypjh/react-ui';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { SourceRef } from '@/domain/model';
import { currentSnapshot } from '@/lib/snapshot';
import { type LinkGap, sourceLinks } from '@/lib/source-links';

import { CopyButton } from './copy-button';

export const GAP: Record<LinkGap, string> = {
  'invalid-path': '저장소 상대 경로가 아니라 링크를 만들지 않았습니다',
  missing: '저장소에 없는 경로라 링크를 만들지 않았습니다',
  'not-committed': '스냅샷 커밋에 없는 경로(미커밋)라 링크를 만들지 않았습니다',
  'unknown-commit': '스냅샷 커밋을 알 수 없어 고정 링크가 없습니다',
};

const LINK = 'typo-caption-small text-text-link underline-offset-2 hover:underline';

/**
 * A repository path with its navigation: commit permalink (canonical), latest on the branch, and
 * copy. Every href comes from the repository's own templates; a path that cannot be vouched for
 * gets its reason instead of a link.
 */
export function SourceActions({ source }: { source: SourceRef }) {
  const links = sourceLinks(source);
  const { commit, branch } = currentSnapshot();
  const host = hostOf(catalog.repository);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="devhub-code min-w-0">{source.path}</span>
        <CopyButton variant="icon" text={source.path} label="경로 복사" />
      </div>
      {source.symbol && <span className="devhub-code text-text-light">symbol {source.symbol}</span>}
      <div className="flex flex-wrap items-center gap-x-3">
        {links.permalink && commit && (
          <a href={links.permalink} target="_blank" rel="noopener noreferrer" className={LINK}>
            {host}에서 보기 @ {shortSha(commit)}
            <VisuallyHidden> — {source.path}, 새 창</VisuallyHidden>
          </a>
        )}
        {links.latest && (
          <a href={links.latest} target="_blank" rel="noopener noreferrer" className={LINK}>
            최신 {branch}에서 보기
            <VisuallyHidden> — {source.path}, 새 창</VisuallyHidden>
          </a>
        )}
      </div>
      {links.gap && <span className="typo-caption-small text-text-warning">{GAP[links.gap]}</span>}
    </div>
  );
}
