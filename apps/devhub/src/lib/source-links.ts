import { statSync } from 'node:fs';
import { join } from 'node:path';

import { catalog } from '../data';
import { isCanonicalPath, latestUrl, permalink } from '../domain/links';
import type { RepositoryRef, RepositorySnapshot, SourceRef } from '../domain/model';

import { committedPaths, currentSnapshot, REPOSITORY_ROOT } from './snapshot';

/** 링크를 만들지 못한 이유. 링크 대신 이 이유를 보이고, 추측한 링크로 채우지 않는다. */
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
  /** `file` · `directory`, 디스크에 없으면 null. */
  kindOf: (path: string) => 'file' | 'directory' | null;
  /** 스냅샷 커밋에 있는 경로들. 알 수 없으면 null. */
  committed: Set<string> | null;
};

const inCommit = (committed: Set<string>, path: string, directory: boolean) =>
  directory
    ? [...committed].some((tracked) => tracked.startsWith(`${path}/`))
    : committed.has(path);

/**
 * 참조 하나의 링크들. 정본은 permalink이고, 경로가 저장소 상대 경로이며 디스크에 있고
 * (git이 답한다면) 스냅샷 커밋에도 있을 때만 만들어진다.
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

/** 서버 전용. 지금 스냅샷 기준으로 이 저장소의 참조 하나에 대한 링크를 만든다. */
export const sourceLinks = (ref: SourceRef): SourceLinks =>
  linksFor(ref, {
    repository: catalog.repository,
    snapshot: currentSnapshot(),
    kindOf: kindOnDisk,
    committed: committedPaths(),
  });
