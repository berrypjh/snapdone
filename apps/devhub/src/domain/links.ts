import type { CommandRef, GeneratedRange, RepositoryRef, RepositorySnapshot } from './model';

/** Shell line a person types to run the command. */
export const commandLine = ({ source }: CommandRef): string =>
  source.kind === 'package-script'
    ? `pnpm ${source.script}`
    : `pnpm exec nx run ${source.project}:${source.target}`;

// Written as escapes, never raw bytes: raw control characters make git treat the file as binary.
// eslint-disable-next-line no-control-regex -- control characters are what this rejects
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * True for a clean repository-relative POSIX path: no root, empty or dot segments, parent hops,
 * backslashes, control characters, URLs, or `#` anchors. Spaces and other characters are allowed
 * and get encoded when a link is built.
 */
export const isCanonicalPath = (path: string): boolean =>
  path.length > 0 &&
  !CONTROL.test(path) &&
  !path.includes('\\') &&
  !path.includes('#') &&
  !path.includes('://') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/** Path encoded segment by segment, so `/` stays a separator and everything else is escaped. */
export const encodePath = (path: string): string => {
  if (!isCanonicalPath(path))
    throw new Error(`not a repository-relative path: ${JSON.stringify(path)}`);
  return path.split('/').map(encodeURIComponent).join('/');
};

export const isCommitSha = (value: string) => /^[0-9a-f]{40}$/.test(value);

/** Branch names that are safe to put in a URL path: no `..`, no leading or trailing `/`. */
export const isSafeBranch = (value: string) =>
  /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(value) && !value.includes('..');

export type BrowseTarget = { path: string; directory: boolean; range?: GeneratedRange };

/**
 * URL of a path at a revision, built only from the repository's own templates. The revision must
 * be a full commit SHA or a safe branch name; the path must be canonical. A line anchor is added
 * only for a generated range of that same commit.
 */
export const browseUrl = (repository: RepositoryRef, revision: string, target: BrowseTarget) => {
  if (!isCommitSha(revision) && !isSafeBranch(revision)) {
    throw new Error(`not a commit SHA or safe branch: ${JSON.stringify(revision)}`);
  }
  const template = target.directory ? repository.browse.directory : repository.browse.file;
  const url = template
    .replace('{base}', repository.webUrl)
    .replace('{rev}', revision.split('/').map(encodeURIComponent).join('/'))
    .replace('{path}', encodePath(target.path));
  const range = target.range;
  if (!range || target.directory || range.commit !== revision) return url;
  return (
    url +
    repository.browse.lineRange
      .replace('{start}', String(range.start))
      .replace('{end}', String(range.end))
  );
};

/** Canonical link: pinned to the snapshot commit. Null when the commit is unknown. */
export const permalink = (
  repository: RepositoryRef,
  snapshot: RepositorySnapshot,
  target: BrowseTarget,
): string | null => (snapshot.commit ? browseUrl(repository, snapshot.commit, target) : null);

/** Secondary link: the same path on the moving branch. May differ from what DevHub judged. */
export const latestUrl = (
  repository: RepositoryRef,
  snapshot: RepositorySnapshot,
  target: BrowseTarget,
): string => browseUrl(repository, snapshot.branch, target);

export const shortSha = (commit: string) => commit.slice(0, 7);

/** Host name for link text, e.g. `github.com` — never a hard-coded provider name. */
export const hostOf = (repository: RepositoryRef) => new URL(repository.webUrl).host;
