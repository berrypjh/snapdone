import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { catalog } from '../../data';
import { isCommitSha, isSafeBranch } from '../../domain/links';
import type { RepositoryRef, RepositorySnapshot } from '../../domain/model';

/**
 * 서버 전용. DevHub가 설명하는 커밋을 정한다.
 * 환경변수(`DEVHUB_COMMIT_SHA`) → `git rev-parse HEAD` → 둘 다 없으면 `unavailable`(커밋은 null).
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

/** `pnpm-workspace.yaml`이 있는 가장 가까운 상위 폴더. 저장소 루트다. */
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

/** 셸 없이 git을 실행한다. 실패하면 null이고, 값을 지어내지 않는다. */
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

/** 프로세스당 한 번만 계산한다. */
export const currentSnapshot = (): RepositorySnapshot =>
  (snapshot ??= resolveSnapshot(catalog.repository, process.env, git));

/** 스냅샷 커밋에 있는 경로들. git이 답하지 못하면 null. 커밋에 없는 경로는 permalink가 404다. */
export const committedPaths = (): Set<string> | null => {
  if (committed !== undefined) return committed;
  const { commit } = currentSnapshot();
  const listing = commit ? git(['ls-tree', '-r', '--name-only', commit]) : null;
  committed = listing === null ? null : new Set(listing.split('\n').filter(Boolean));
  return committed;
};
