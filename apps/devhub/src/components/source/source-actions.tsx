import {
  CopyButton,
  type RemoteView,
  SourceActions as SharedSourceActions,
} from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { SourceRef } from '@/domain/model';
import { currentSnapshot } from '@/lib/repository/snapshot';
import { type LinkGap, sourceLinks } from '@/lib/repository/source-links';

import { EditorLink } from './editor-link';

export const GAP: Record<LinkGap, string> = {
  'invalid-path': '저장소 상대 경로가 아니라 링크를 만들지 않음',
  missing: '저장소에 없는 경로라 링크를 만들지 않음',
  'not-committed': '스냅샷 커밋에 없는 경로(미커밋)라 링크를 만들지 않음',
  'unknown-commit': '스냅샷 커밋을 알 수 없어 고정 링크 없음',
};

/**
 * 저장소 경로와 그 경로를 여는 길들. 그리기는 공용 `SourceActions`이고, 링크(스냅샷 커밋 고정 · 최신 브랜치)와
 * 링크를 만들지 못한 이유는 저장소 스냅샷을 읽는 여기서 정한다. 장담할 수 없는 경로는 링크 대신 이유를 보인다.
 */
export function SourceActions({
  source,
  lead,
}: {
  /** 공용 `SourceActions`는 경로만 그린다. symbol을 넘겨도 보이지 않으므로 받지 않는다. */
  source: Pick<SourceRef, 'path'>;
  /** 경로 앞에 같은 줄로 놓을 것. 기록의 날짜 · 종류가 이 자리를 쓴다. */
  lead?: ReactNode;
}) {
  const links = sourceLinks(source);
  const { commit, branch } = currentSnapshot();
  const views: RemoteView[] = [
    links.permalink && commit
      ? {
          href: links.permalink,
          label: `${hostOf(catalog.repository)}에서 보기 @ ${shortSha(commit)}`,
          icon: 'commit' as const,
        }
      : null,
    links.latest
      ? { href: links.latest, label: `최신 ${branch}에서 보기`, icon: 'branch' as const }
      : null,
  ].filter((view) => view !== null);

  return (
    <SharedSourceActions
      path={source.path}
      lead={lead}
      actions={
        <>
          <EditorLink path={source.path} />
          <CopyButton text={source.path} label={`경로 복사: ${source.path}`} />
        </>
      }
      views={views}
      warning={links.gap && GAP[links.gap]}
    />
  );
}
