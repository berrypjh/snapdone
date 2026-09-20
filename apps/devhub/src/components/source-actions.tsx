import { Fragment } from 'react';

import { VisuallyHidden } from '@berrypjh/react-ui';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { SourceRef } from '@/domain/model';
import { currentSnapshot } from '@/lib/snapshot';
import { type LinkGap, sourceLinks } from '@/lib/source-links';

import { CopyButton } from './copy-button';
import { EditorLink } from './editor-link';

export const GAP: Record<LinkGap, string> = {
  'invalid-path': '저장소 상대 경로가 아니라 링크를 만들지 않았습니다',
  missing: '저장소에 없는 경로라 링크를 만들지 않았습니다',
  'not-committed': '스냅샷 커밋에 없는 경로(미커밋)라 링크를 만들지 않았습니다',
  'unknown-commit': '스냅샷 커밋을 알 수 없어 고정 링크가 없습니다',
};

/** 저장소 호스트에서 이 경로를 보는 링크. 새 창으로 나가므로 스크린 리더에 그렇게 알린다. */
function RemoteLink({ href, path, label }: { href: string; path: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="typo-caption-small text-text-link underline-offset-2 hover:underline"
    >
      {label}
      <VisuallyHidden> — {path}, 새 창</VisuallyHidden>
    </a>
  );
}

/**
 * 저장소 경로와 그 경로를 여는 길들. 경로 줄 오른쪽은 아이콘(에디터 · 복사), 아래 줄은 원격 보기다.
 * 링크는 저장소 템플릿에서만 만들고, 장담할 수 없는 경로는 링크 대신 이유를 보인다.
 */
export function SourceActions({ source }: { source: SourceRef }) {
  const links = sourceLinks(source);
  const { commit, branch } = currentSnapshot();

  const remote = [
    links.permalink && commit
      ? {
          href: links.permalink,
          label: `${hostOf(catalog.repository)}에서 보기 @ ${shortSha(commit)}`,
        }
      : null,
    links.latest ? { href: links.latest, label: `최신 ${branch}에서 보기` } : null,
  ].filter((view) => view !== null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="devhub-code min-w-0">{source.path}</span>
        <span className="flex shrink-0 items-center gap-1">
          <EditorLink path={source.path} />
          <CopyButton variant="icon" text={source.path} label="경로 복사" />
        </span>
      </div>
      {source.symbol && <span className="devhub-code text-text-light">symbol {source.symbol}</span>}
      <div className="flex flex-wrap items-center gap-x-2">
        {remote.map((view, index) => (
          <Fragment key={view.href}>
            {index > 0 && (
              <span aria-hidden="true" className="typo-caption-small text-text-light">
                ·
              </span>
            )}
            <RemoteLink href={view.href} path={source.path} label={view.label} />
          </Fragment>
        ))}
      </div>
      {links.gap && <span className="typo-caption-small text-text-warning">{GAP[links.gap]}</span>}
    </div>
  );
}
