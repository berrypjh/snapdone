import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { catalog } from '../data';
import { isCommitSha, isSafeBranch } from '../domain/links';
import type { RepositoryRef, RepositorySnapshot } from '../domain/model';

/**
 * Server-only: which commit the DevHub describes. Read once per process at build or request time.
 *
 * 1. `DEVHUB_COMMIT_SHA` (and optional `DEVHUB_BRANCH`) from the build environment
 * 2. otherwise `git rev-parse HEAD` in the repository
 * 3. otherwise `unavailable` — the commit stays null and only branch links are offered
 */

type Git = (args: string[]) => string | null;
type Env = Record<string, string | undefined>;

export const resolveSnapshot = (
  repository: RepositoryRef,
  env: Env,
  git: Git,
): RepositorySnapshot => {
  const fromEnv = env.DEVHUB_COMMIT_SHA?.trim().toLowerCase();
  const fromGit = () => {
    const head = git(['rev-parse', 'HEAD'])?.trim().toLowerCase();
    return head && isCommitSha(head) ? head : null;
  };
  const envCommit = fromEnv && isCommitSha(fromEnv) ? fromEnv : null;
  const commit = envCommit ?? fromGit();
  const status = git(['status', '--porcelain']);
  const branch = env.DEVHUB_BRANCH?.trim();

  return {
    repositoryId: repository.id,
    commit,
    branch: branch && isSafeBranch(branch) ? branch : repository.defaultBranch,
    source: envCommit ? 'env' : commit ? 'git' : 'unavailable',
    dirty: status === null ? null : status.trim().length > 0,
  };
};

/** Nearest ancestor of `start` that holds `pnpm-workspace.yaml`, the repository root marker. */
export const findRepositoryRoot = (start: string): string | null => {
  let current = start;
  while (!existsSync(join(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
};

export const REPOSITORY_ROOT = findRepositoryRoot(process.cwd());

/** Runs git without a shell. Any failure is null — never a made-up value. */
const git: Git = (args) => {
  if (!REPOSITORY_ROOT) return null;
  try {
    return execFileSync('git', args, {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};

let snapshot: RepositorySnapshot | undefined;
let committed: Set<string> | null | undefined;

export const currentSnapshot = (): RepositorySnapshot =>
  (snapshot ??= resolveSnapshot(catalog.repository, process.env, git));

/**
 * Paths tracked in the snapshot commit, or null when git cannot say. A permalink for a path that
 * is not in the commit would 404, so links check this first.
 */
export const committedPaths = (): Set<string> | null => {
  if (committed !== undefined) return committed;
  const { commit } = currentSnapshot();
  const listing = commit ? git(['ls-tree', '-r', '--name-only', commit]) : null;
  committed = listing === null ? null : new Set(listing.split('\n').filter(Boolean));
  return committed;
};
