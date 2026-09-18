import { VisuallyHidden } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { catalog } from '@/data';
import { hostOf, shortSha } from '@/domain/links';
import type { FileGroup, ProjectGroup } from '@/lib/reference-groups';
import { currentSnapshot } from '@/lib/snapshot';
import { sourceLinks } from '@/lib/source-links';

import { CopyButton } from './copy-button';
import { Icon } from './icon';
import { GAP } from './source-actions';

/**
 * One file: its name is the link (the snapshot commit, or the branch when the commit is unknown,
 * said in text), the folder is dimmed, and copy is one icon button. `children` carries what the
 * file holds — symbols or test titles — so the file and its actions appear once.
 */
export function FileRow({
  file,
  label,
  children,
}: {
  file: FileGroup;
  /** Role of the file, shown before its name (`handler`, `Swagger`). */
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
        <CopyButton variant="icon" text={file.path} label="경로 복사" />
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

/** Symbols a source file is cited for, as code chips. */
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

/** Files under a small project heading, so the project prefix is not repeated on every path. */
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
