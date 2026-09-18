import { statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { encodePath, isCanonicalPath } from '../domain/links';
import type { ApplicationRef, LibraryRef, RepositorySnapshot } from '../domain/model';
import { flowModel } from '../lib/flow';
import { linksFor } from '../lib/source-links';
import { citedRefs } from '../test-support/cited-refs';
import { nxCallsIn, nxProjectTargets } from '../test-support/nx-workspace';
import {
  exists,
  filesUnder,
  read,
  readJson,
  ROOT,
  symbolPattern,
} from '../test-support/repository-files';

import { catalog } from './index';

/**
 * Freshness: the catalog against the repository as it is now. Any failure here means the DevHub
 * would show something the repository no longer backs; fix the data, never skip the check.
 */

const refs = citedRefs();
const where = (ref: { origin: string; path: string }) => `${ref.origin}: ${ref.path}`;

describe('cited paths', () => {
  it('are canonical and exist on disk', () => {
    expect(
      refs.filter((ref) => !isCanonicalPath(ref.path) || !exists(ref.path)).map(where),
    ).toEqual([]);
  });

  it('name symbols whose text appears in the file (a text match, not a symbol index)', () => {
    const missing = refs.filter(
      (ref) => ref.symbol && !symbolPattern(ref.symbol).test(read(ref.path)),
    );
    expect(missing.map((ref) => `${where(ref)} #${ref.symbol}`)).toEqual([]);
  });

  it('get repository links derived only from the snapshot and the path', () => {
    // Fixture revision for the derivation check; never shown as the current commit.
    const commit = 'f'.repeat(40);
    const snapshot: RepositorySnapshot = {
      repositoryId: catalog.repository.id,
      commit,
      branch: catalog.repository.defaultBranch,
      source: 'env',
      dirty: false,
    };
    const kindOf = (path: string) =>
      statSync(join(ROOT, path)).isDirectory() ? ('directory' as const) : ('file' as const);
    const { webUrl, defaultBranch } = catalog.repository;
    for (const ref of refs) {
      const mode = kindOf(ref.path) === 'directory' ? 'tree' : 'blob';
      const links = linksFor(ref, {
        repository: catalog.repository,
        snapshot,
        kindOf,
        committed: null,
      });
      expect(links.permalink).toBe(`${webUrl}/${mode}/${commit}/${encodePath(ref.path)}`);
      expect(links.latest).toBe(`${webUrl}/${mode}/${defaultBranch}/${encodePath(ref.path)}`);
    }
  });
});

describe('Nx workspace', () => {
  const targets = nxProjectTargets();
  const projectIds = catalog.nodes
    .filter((node): node is ApplicationRef | LibraryRef => node.kind !== 'external')
    .map((node) => node.id);

  it('has exactly the projects the catalog lists', () => {
    expect([...targets.keys()].sort()).toEqual([...projectIds].sort());
  });

  it('declares every Nx target a catalog command names', () => {
    const missing = catalog.commands.flatMap(({ id, source }) =>
      source.kind === 'nx-target' && !targets.get(source.project)?.has(source.target)
        ? [`${id}: ${source.project}:${source.target}`]
        : [],
    );
    expect(missing).toEqual([]);
  });

  it('declares every Nx target a root script calls', () => {
    const scripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;
    const projects = new Set(targets.keys());
    const missing = Object.entries(scripts).flatMap(([name, script]) =>
      nxCallsIn(script, projects)
        .filter(({ project, target }) =>
          project
            ? !targets.get(project)?.has(target)
            : ![...targets.values()].some((own) => own.has(target)),
        )
        .map(({ project, target }) => `${name}: ${project ?? '*'}:${target}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('scenario semantics', () => {
  const testPaths = new Set(catalog.tests.map((test) => test.source.path));
  const evidenceOnly = (path: string) =>
    testPaths.has(path) ||
    /\.(spec|test)\.[cm]?[jt]sx?$|_test\.go$|\.md$/.test(path) ||
    /^apps\/[^/]+-e2e\//.test(path);

  it('cite implementation code, never a test or a document, as step source', () => {
    const cited = catalog.scenarios.flatMap((scenario) =>
      scenario.steps.flatMap((step) =>
        step.source
          .filter((ref) => evidenceOnly(ref.path))
          .map((ref) => `${scenario.id}/${step.id}: ${ref.path}`),
      ),
    );
    expect(cited).toEqual([]);
  });

  it('draw a source only for steps whose status claims code', () => {
    for (const scenario of catalog.scenarios) {
      const status = new Map(scenario.steps.map((step) => [step.id, step.status]));
      for (const node of flowModel(scenario).nodes) {
        const claimsCode = ['implemented', 'partial'].includes(String(status.get(node.id)));
        expect({ step: `${scenario.id}/${node.id}`, drawn: node.source !== null }).toEqual({
          step: `${scenario.id}/${node.id}`,
          drawn: claimsCode,
        });
      }
    }
  });
});

describe('product statement', () => {
  it('is quoted verbatim from its document, under the heading it names', () => {
    const { text, source } = catalog.product;
    const document = catalog.documents.find((doc) => doc.id === source.document);
    const lines = read(String(document?.path)).split('\n');
    const start = lines.findIndex(
      (line) => /^#{1,6} /.test(line) && line.endsWith(` ${source.heading}`),
    );
    const end = lines.findIndex((line, index) => index > start && /^#{1,6} /.test(line));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(lines.slice(start + 1, end === -1 ? undefined : end)).toContain(text);
  });
});

describe('source files', () => {
  it('are plain text: a raw control character makes git treat the file as binary', () => {
    const text = [...filesUnder('apps/devhub'), ...filesUnder('apps/devhub-e2e')].filter((path) =>
      /\.(ts|tsx|mts|mjs|js|json|css|md)$/.test(path),
    );
    // Tab, line feed, and carriage return are ordinary text; every other C0 byte and DEL is not.
    // eslint-disable-next-line no-control-regex -- control characters are what this looks for
    const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
    expect(text.filter((path) => control.test(read(path)))).toEqual([]);
  });
});

describe('snapshot', () => {
  it('is never written into DevHub code; it is resolved when the DevHub builds or runs', () => {
    const code = filesUnder('apps/devhub').filter(
      (path) => /\.(ts|tsx|mjs|js|json)$/.test(path) && !/\.spec\.ts$/.test(path),
    );
    expect(code.filter((path) => /\b[0-9a-f]{40}\b/.test(read(path)))).toEqual([]);
  });
});
