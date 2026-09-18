import { describe, expect, it } from 'vitest';

import {
  browseUrl,
  commandLine,
  encodePath,
  hostOf,
  isCanonicalPath,
  isSafeBranch,
  latestUrl,
  permalink,
} from './links';
import type { CommandRef, RepositoryRef, RepositorySnapshot } from './model';

const SHA = 'c'.repeat(40);

const repository: RepositoryRef = {
  id: 'example',
  owner: 'owner',
  name: 'example',
  webUrl: 'https://github.com/owner/example',
  defaultBranch: 'main',
  browse: {
    file: '{base}/blob/{rev}/{path}',
    directory: '{base}/tree/{rev}/{path}',
    lineRange: '#L{start}-L{end}',
  },
};

const snapshot = (commit: string | null): RepositorySnapshot => ({
  repositoryId: 'example',
  commit,
  branch: 'main',
  source: commit ? 'git' : 'unavailable',
  dirty: false,
});

describe('permalink', () => {
  it('pins a file to the snapshot commit', () => {
    expect(
      permalink(repository, snapshot(SHA), { path: 'apps/web/src/lib/api.ts', directory: false }),
    ).toBe(`https://github.com/owner/example/blob/${SHA}/apps/web/src/lib/api.ts`);
  });

  it('uses the directory template for directories', () => {
    expect(permalink(repository, snapshot(SHA), { path: 'apps/web', directory: true })).toBe(
      `https://github.com/owner/example/tree/${SHA}/apps/web`,
    );
  });

  it('is null when the commit is unknown, while the branch link still works', () => {
    const target = { path: 'README.md', directory: false };
    expect(permalink(repository, snapshot(null), target)).toBeNull();
    expect(latestUrl(repository, snapshot(null), target)).toBe(
      'https://github.com/owner/example/blob/main/README.md',
    );
  });

  it('adds a line anchor only for a generated range of the same commit', () => {
    const target = (commit: string) => ({
      path: 'a.ts',
      directory: false,
      range: { commit, start: 3, end: 9 },
    });
    expect(browseUrl(repository, SHA, target(SHA))).toMatch(/#L3-L9$/);
    expect(browseUrl(repository, SHA, target('d'.repeat(40)))).not.toContain('#');
  });

  it('follows other hosts through the templates', () => {
    const gitlab = {
      ...repository,
      webUrl: 'https://gitlab.example.com/group/app',
      browse: { ...repository.browse, file: '{base}/-/blob/{rev}/{path}' },
    };
    expect(browseUrl(gitlab, SHA, { path: 'x.ts', directory: false })).toBe(
      `https://gitlab.example.com/group/app/-/blob/${SHA}/x.ts`,
    );
    expect(hostOf(gitlab)).toBe('gitlab.example.com');
  });
});

describe('path encoding', () => {
  it.each([
    ['apps/web/src/app/(auth)/login/page.tsx', 'apps/web/src/app/(auth)/login/page.tsx'],
    ['apps/devhub/src/app/[section]/page.tsx', 'apps/devhub/src/app/%5Bsection%5D/page.tsx'],
    ['docs/a b/c.md', 'docs/a%20b/c.md'],
    ['docs/100%/q?.md', 'docs/100%25/q%3F.md'],
    ['docs/한글.md', 'docs/%ED%95%9C%EA%B8%80.md'],
  ])('encodes %s', (path, encoded) => {
    expect(encodePath(path)).toBe(encoded);
  });

  it.each([
    '',
    '/abs/path.ts',
    './a.ts',
    'a/../b.ts',
    'a//b.ts',
    'a/./b.ts',
    'a/b/',
    'a\\b.ts',
    'a.ts#L10',
    'https://evil.example/x',
    'a\nb.ts',
    'a\u0000b.ts',
    'a\u007fb.ts',
  ])('rejects %j', (path) => {
    expect(isCanonicalPath(path)).toBe(false);
    expect(() => encodePath(path)).toThrow();
  });

  it('rejects revisions that are neither a full SHA nor a safe branch', () => {
    for (const revision of ['../main', 'main/', 'a b', 'feature/../x', '"x"', '']) {
      expect(() => browseUrl(repository, revision, { path: 'a.ts', directory: false })).toThrow();
    }
    expect(isSafeBranch('release/2026.09')).toBe(true);
  });
});

describe('commandLine', () => {
  const command = (source: CommandRef['source']): CommandRef => ({
    id: 'x',
    source,
    group: 'check',
    summary: '',
    constraints: [],
  });

  it('runs package scripts through pnpm', () => {
    expect(commandLine(command({ kind: 'package-script', script: 'format:check' }))).toBe(
      'pnpm format:check',
    );
  });

  it('runs Nx targets with nx run', () => {
    expect(commandLine(command({ kind: 'nx-target', project: 'api', target: 'migrate' }))).toBe(
      'pnpm exec nx run api:migrate',
    );
  });
});
