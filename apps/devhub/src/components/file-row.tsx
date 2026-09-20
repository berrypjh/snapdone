import { VisuallyHidden } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { FileGroup, ProjectGroup } from '@/lib/reference-groups';
import { currentSnapshot } from '@/lib/snapshot';
import { sourceLinks } from '@/lib/source-links';

import { CopyButton } from './copy-button';
import { EditorLink } from './editor-link';
import { Icon } from './icon';
import { GAP } from './source-actions';

/**
 * 파일 하나. 이름이 링크이고(스냅샷 커밋, 커밋을 모르면 브랜치라고 글로 밝힌다) 폴더는 흐리게,
 * 복사는 아이콘 버튼 하나다. 파일이 담은 것은 `children`으로 받아 파일과 동작이 한 번만 나온다.
 */
export function FileRow({
  file,
  label,
  children,
}: {
  file: FileGroup;
  /** 파일의 역할. 이름 앞에 보인다 (`handler`, `Swagger`). */
  label?: string;
  children?: ReactNode;
}) {
  const links = sourceLinks({ path: file.path });
  const { commit, branch } = currentSnapshot();
  const href = links.permalink ?? links.latest;
  const target =
    links.permalink && commit
      ? `${hostOf(catalog.repository)} @ ${shortSha(commit)}`
      : `최신 ${branch}`;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-1">
            {label && <span className="typo-caption-small text-text-light">{label}</span>}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1 text-text-link"
              >
                <span className="typo-body-small-strong underline-offset-2 group-hover:underline">
                  {file.name}
                </span>
                <Icon name="external" />
                <VisuallyHidden>
                  {' '}
                  — {file.path}, {target}에서 보기, 새 창
                </VisuallyHidden>
              </a>
            ) : (
              <span className="typo-body-small-strong">{file.name}</span>
            )}
            {href && !links.permalink && (
              <span className="typo-caption-small text-text-warning">최신 {branch} 기준</span>
            )}
          </span>
          {file.folder && <span className="devhub-code text-text-light">{file.folder}</span>}
        </div>
        {/* 파일마다의 동작을 모아 둔다. 에디터로 열기(dev 전용) · 경로 복사. */}
        <span className="flex shrink-0 items-center gap-1">
          <EditorLink path={file.path} />
          <CopyButton variant="icon" text={file.path} label="경로 복사" />
        </span>
      </div>
      {children}
      {links.gap && links.gap !== 'unknown-commit' && (
        <p className="flex items-center gap-1 typo-caption-small text-text-warning">
          <Icon name="warning" />
          {GAP[links.gap]}
        </p>
      )}
    </li>
  );
}

/** 소스 파일이 인용된 symbol들을 코드 칩으로. */
export function Symbols({ symbols }: { symbols: string[] }) {
  if (symbols.length === 0) return null;
  return (
    <ul aria-label="symbol" className="flex flex-wrap gap-1">
      {symbols.map((symbol) => (
        <li key={symbol} className="devhub-code rounded-sm bg-background-default px-1.5 py-0.5">
          {symbol}
        </li>
      ))}
    </ul>
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
        <div key={project} className="flex flex-col gap-2">
          <h4 className="typo-caption-small text-text-light">{project}</h4>
          <ul className="flex flex-col gap-3 border-l border-stroke-light pl-3">
            {files.map(row)}
          </ul>
        </div>
      ))}
    </div>
  );
}
