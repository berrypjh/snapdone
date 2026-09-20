import { statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { encodePath, isCanonicalPath } from '../domain/links';
import type { ApplicationRef, LibraryRef, RepositorySnapshot } from '../domain/model';
import { flowModel } from '../lib/catalog/flow';
import { resolveDocLink } from '../lib/markdown/doc-links';
import { type Block, type Inline, parseMarkdown } from '../lib/markdown/markdown';
import { linksFor } from '../lib/repository/source-links';
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

import { catalog } from '.';

/**
 * 신선도: 카탈로그를 지금의 저장소와 맞춰 본다. 여기서 실패하면 DevHub가 저장소에 더 이상 없는
 * 것을 보여 준다는 뜻이다. 검사를 건너뛰지 말고 데이터를 고친다.
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
    // 링크 생성 규칙만 보기 위한 가짜 revision. 현재 커밋으로 화면에 나가지 않는다.
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

describe('document links', () => {
  const linksIn = (blocks: Block[]): string[] =>
    blocks.flatMap((block) => {
      const inline = (nodes: Inline[]): string[] =>
        nodes.flatMap((node) =>
          node.kind === 'link'
            ? [node.href, ...inline(node.children)]
            : node.kind === 'strong'
              ? inline(node.children)
              : [],
        );
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
          return inline(block.inline);
        case 'list':
          return block.items.flatMap(linksIn);
        case 'table':
          return [...block.head, ...block.rows.flat()].flatMap(inline);
        case 'quote':
          return linksIn(block.blocks);
        default:
          return [];
      }
    });
  const headingIds = (path: string) =>
    new Set(parseMarkdown(read(path)).flatMap((b) => (b.kind === 'heading' ? [b.id] : [])));

  it('point at documents, files, and headings that exist', () => {
    const broken = [...catalog.documents, ...catalog.records].flatMap((doc) =>
      linksIn(parseMarkdown(read(doc.path))).flatMap((href) => {
        const link = resolveDocLink(doc.path, href);
        const ok =
          link.kind === 'external' ||
          (link.kind === 'anchor' && headingIds(doc.path).has(link.anchor)) ||
          (link.kind === 'document' && (!link.anchor || headingIds(link.path).has(link.anchor))) ||
          (link.kind === 'file' && exists(link.path));
        return ok ? [] : [`${doc.path} → ${href}`];
      }),
    );
    expect(broken).toEqual([]);
  });
});

describe('source files', () => {
  it('are plain text: a raw control character makes git treat the file as binary', () => {
    const text = [...filesUnder('apps/devhub'), ...filesUnder('apps/devhub-e2e')].filter((path) =>
      /\.(ts|tsx|mts|mjs|js|json|css|md)$/.test(path),
    );
    // 탭 · 줄바꿈 · 캐리지 리턴은 보통 텍스트이고, 나머지 C0 바이트와 DEL은 아니다.
    // eslint-disable-next-line no-control-regex -- 이 정규식이 찾으려는 대상이 제어 문자다
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
