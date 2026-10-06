import { CopyButton, FileLine, FileList } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { FileGroup, ProjectGroup } from '@/lib/catalog/reference-groups';
import { currentSnapshot } from '@/lib/repository/snapshot';
import { sourceLinks } from '@/lib/repository/source-links';

import { EditorLink } from './editor-link';
import { GAP } from './source-actions';

/**
 * 파일 하나. 그리기는 공용 `FileLine`이고, 링크(스냅샷 커밋, 커밋을 모르면 브랜치라고 글로 밝힌다)와
 * 링크를 만들지 못한 이유는 저장소 스냅샷을 읽는 여기서 정한다. 파일이 담은 것은 `children`으로 받는다.
 * 브랜치 기준이라는 표시와 링크를 만들지 못한 이유는 공용 `FileLine`의 경고 줄 하나에 ` · `로 함께 보인다.
 */
export function FileRow({
  file,
  label,
  symbols,
  children,
}: {
  file: FileGroup;
  /** 파일의 역할. 이름 앞에 보인다 (`handler`, `Swagger`). */
  label?: string;
  /** 이 파일에서 인용한 symbol. 코드 칩으로 보인다. */
  symbols?: string[];
  children?: ReactNode;
}) {
  const links = sourceLinks({ path: file.path });
  const { commit, branch } = currentSnapshot();
  const href = links.permalink ?? links.latest ?? undefined;
  const target =
    links.permalink && commit
      ? `${hostOf(catalog.repository)} @ ${shortSha(commit)}`
      : `최신 ${branch}`;
  const warning = [
    href && !links.permalink ? `최신 ${branch} 기준` : null,
    links.gap && links.gap !== 'unknown-commit' ? GAP[links.gap] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <FileLine
      name={file.name}
      folder={file.folder || undefined}
      href={href}
      linkDescription={`— ${file.path}, ${target}에서 보기, 새 창`}
      label={label}
      actions={
        <>
          <EditorLink path={file.path} />
          <CopyButton text={file.path} label={`경로 복사: ${file.path}`} />
        </>
      }
      symbols={symbols}
      warning={warning || undefined}
    >
      {children}
    </FileLine>
  );
}

/** 파일을 작은 프로젝트 제목 아래에 묶어 경로마다 프로젝트 접두사가 반복되지 않게 한다. */
export function ByProject<T extends FileGroup>({
  groups,
  row,
}: {
  groups: ProjectGroup<T>[];
  row: (file: T) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ project, files }) => (
        <FileList key={project} title={project}>
          {files.map(row)}
        </FileList>
      ))}
    </div>
  );
}
