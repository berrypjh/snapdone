import { statSync } from 'node:fs';
import { join } from 'node:path';

import { catalog } from '../data';
import { isCanonicalPath, latestUrl, permalink } from '../domain/links';
import type { RepositoryRef, RepositorySnapshot, SourceRef } from '../domain/model';

import { committedPaths, currentSnapshot, REPOSITORY_ROOT } from './snapshot';

/** Why a reference got no link. Shown instead of a link; never replaced by a guess. */
export type LinkGap = 'invalid-path' | 'missing' | 'not-committed' | 'unknown-commit';

export type SourceLinks = {
  path: string;
  symbol?: string;
  permalink: string | null;
  latest: string | null;
  gap: LinkGap | null;
};

type LinkContext = {
  repository: RepositoryRef;
  snapshot: RepositorySnapshot;
  /** `file` · `directory` · null when the path is not on disk. */
  kindOf: (path: string) => 'file' | 'directory' | null;
  /** Paths tracked in the snapshot commit; null when unknown. */
  committed: Set<string> | null;
};

const inCommit = (committed: Set<string>, path: string, directory: boolean) =>
  directory
    ? [...committed].some((tracked) => tracked.startsWith(`${path}/`))
    : committed.has(path);

/**
 * Links for one reference. The permalink is the canonical link; it exists only when the path is
 * canonical, on disk, and (when git can tell) tracked in the snapshot commit.
 */
export const linksFor = (ref: SourceRef, context: LinkContext): SourceLinks => {
  const base = { path: ref.path, symbol: ref.symbol };
  const none = (gap: LinkGap): SourceLinks => ({ ...base, permalink: null, latest: null, gap });

  if (!isCanonicalPath(ref.path)) return none('invalid-path');
  const kind = context.kindOf(ref.path);
  if (!kind) return none('missing');
  const directory = kind === 'directory';
  if (context.committed && !inCommit(context.committed, ref.path, directory)) {
    return none('not-committed');
  }
  const target = { path: ref.path, directory };
  const pinned = permalink(context.repository, context.snapshot, target);
  return {
    ...base,
    permalink: pinned,
    latest: latestUrl(context.repository, context.snapshot, target),
    gap: pinned ? null : 'unknown-commit',
  };
};

const kindOnDisk = (path: string) => {
  if (!REPOSITORY_ROOT) return null;
  try {
    return statSync(join(REPOSITORY_ROOT, path)).isDirectory() ? 'directory' : 'file';
  } catch {
    return null;
  }
};

/** Server-only: links for a reference in this repository at the current snapshot. */
export const sourceLinks = (ref: SourceRef): SourceLinks =>
  linksFor(ref, {
    repository: catalog.repository,
    snapshot: currentSnapshot(),
    kindOf: kindOnDisk,
    committed: committedPaths(),
  });
