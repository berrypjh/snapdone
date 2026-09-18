import { describe, expect, it } from 'vitest';

import { catalog } from '../data';

import { resolveSnapshot } from './snapshot';
import { linksFor } from './source-links';

const HEAD = 'a'.repeat(40);
const BUILD = 'b'.repeat(40);

const git =
  (outputs: Record<string, string | null>) =>
  (args: string[]): string | null =>
    outputs[args.join(' ')] ?? null;

describe('resolveSnapshot', () => {
  it('prefers a valid commit from the build environment', () => {
    const snapshot = resolveSnapshot(
      catalog.repository,
      { DEVHUB_COMMIT_SHA: BUILD },
      git({ 'rev-parse HEAD': HEAD }),
    );
    expect(snapshot).toMatchObject({ commit: BUILD, source: 'env', branch: 'main' });
  });

  it('ignores a malformed environment commit and asks git', () => {
    const snapshot = resolveSnapshot(
      catalog.repository,
      { DEVHUB_COMMIT_SHA: 'not-a-sha' },
      git({ 'rev-parse HEAD': `${HEAD}\n`, 'status --porcelain': '' }),
    );
    expect(snapshot).toMatchObject({ commit: HEAD, source: 'git', dirty: false });
  });

  it('reports an unavailable commit instead of inventing one', () => {
    expect(resolveSnapshot(catalog.repository, {}, git({}))).toMatchObject({
      commit: null,
      source: 'unavailable',
      dirty: null,
      branch: 'main',
    });
    expect(
      resolveSnapshot(
        catalog.repository,
        {},
        git({ 'rev-parse HEAD': 'fatal: not a git repository' }),
      ).commit,
    ).toBeNull();
  });

  it('marks a working tree with local changes', () => {
    const snapshot = resolveSnapshot(
      catalog.repository,
      {},
      git({ 'rev-parse HEAD': HEAD, 'status --porcelain': ' M a.ts\n' }),
    );
    expect(snapshot.dirty).toBe(true);
  });

  it('takes the branch from the environment only when it is safe', () => {
    const branch = (value: string) =>
      resolveSnapshot(catalog.repository, { DEVHUB_BRANCH: value }, git({ 'rev-parse HEAD': HEAD }))
        .branch;
    expect(branch('release/2026.09')).toBe('release/2026.09');
    expect(branch('../../evil')).toBe('main');
    expect(branch('a b')).toBe('main');
  });
});

describe('linksFor', () => {
  const snapshot = resolveSnapshot(
    catalog.repository,
    {},
    git({ 'rev-parse HEAD': HEAD, 'status --porcelain': '' }),
  );
  const context = (overrides: Partial<Parameters<typeof linksFor>[1]> = {}) => ({
    repository: catalog.repository,
    snapshot,
    kindOf: (path: string) =>
      path === 'apps/web'
        ? ('directory' as const)
        : path.endsWith('.ts')
          ? ('file' as const)
          : null,
    committed: new Set(['apps/web/src/lib/api.ts']),
    ...overrides,
  });

  it('links a committed file to the commit and to the branch', () => {
    expect(linksFor({ path: 'apps/web/src/lib/api.ts', symbol: 'fetchHealth' }, context())).toEqual(
      {
        path: 'apps/web/src/lib/api.ts',
        symbol: 'fetchHealth',
        permalink: `https://github.com/berrypjh/snapdone/blob/${HEAD}/apps/web/src/lib/api.ts`,
        latest: 'https://github.com/berrypjh/snapdone/blob/main/apps/web/src/lib/api.ts',
        gap: null,
      },
    );
  });

  it('links a directory that holds committed files with the directory template', () => {
    expect(linksFor({ path: 'apps/web' }, context()).permalink).toBe(
      `https://github.com/berrypjh/snapdone/tree/${HEAD}/apps/web`,
    );
  });

  it('gives no link, only a gap, for paths it cannot vouch for', () => {
    expect(linksFor({ path: 'apps/missing.md' }, context()).gap).toBe('missing');
    expect(linksFor({ path: 'apps/devhub/new.ts' }, context()).gap).toBe('not-committed');
    expect(linksFor({ path: '../outside.ts' }, context()).gap).toBe('invalid-path');
    for (const gap of ['missing', 'not-committed', 'invalid-path']) {
      expect(
        linksFor({ path: gap === 'invalid-path' ? '../x.ts' : 'apps/missing.md' }, context())
          .permalink,
      ).toBeNull();
    }
  });

  it('keeps the branch link when the commit is unknown', () => {
    const unknown = { ...snapshot, commit: null, source: 'unavailable' as const };
    const links = linksFor(
      { path: 'apps/web/src/lib/api.ts' },
      context({ snapshot: unknown, committed: null }),
    );
    expect(links).toMatchObject({ permalink: null, gap: 'unknown-commit' });
    expect(links.latest).toContain('/blob/main/');
  });
});
