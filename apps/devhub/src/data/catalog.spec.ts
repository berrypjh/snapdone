import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isCanonicalPath } from '../domain/links';
import type { ApplicationRef, LibraryRef, SourceRef } from '../domain/model';
import {
  exists,
  manifestPaths,
  read,
  readJson,
  ROOT,
  symbolPattern,
} from '../test-support/repository-files';

import { swaggerDocument } from './apis';
import { RUNNER_COMMAND } from './commands';
import { catalog } from './index';

/** Checks the curated catalog against the repository files it describes. */

type NxConfig = {
  name?: string;
  tags?: string[];
  implicitDependencies?: string[];
  targets?: Record<string, unknown>;
};
type PackageManifest = { name: string; nx?: NxConfig; dependencies?: Record<string, string> };

const projects = catalog.nodes.filter(
  (node): node is ApplicationRef | LibraryRef => node.kind !== 'external',
);

const allSourceRefs = (): SourceRef[] => [
  ...projects.map((project) => project.manifest),
  ...catalog.nodes.flatMap((node) => (node.kind === 'external' ? node.evidence : [])),
  ...catalog.apis.map((api) => api.handler),
  ...catalog.contracts.map((contract) => contract.definedIn),
  ...catalog.relations.flatMap((relation) =>
    relation.kind === 'workspace-dependency' ? [relation.evidence] : relation.evidence,
  ),
];

const nxPackageManifests = () =>
  [...manifestPaths('apps', 'package.json'), ...manifestPaths('libs', 'package.json')]
    .map((path) => ({ path, manifest: readJson<PackageManifest>(path) }))
    .filter(({ manifest }) => manifest.nx);

const nxConfigOf = (manifestPath: string): NxConfig =>
  manifestPath.endsWith('project.json')
    ? readJson<NxConfig>(manifestPath)
    : (readJson<PackageManifest>(manifestPath).nx ?? {});

const idsOf = (items: { id: string }[]) => items.map((item) => item.id);

describe('repository', () => {
  it('builds links only from a trusted https base and its own templates', () => {
    const { webUrl, browse } = catalog.repository;
    const url = new URL(webUrl);
    expect(url.protocol).toBe('https:');
    expect(url.search + url.hash).toBe('');
    expect(webUrl.endsWith('/')).toBe(false);
    for (const template of [browse.file, browse.directory]) {
      expect(template.startsWith('{base}/')).toBe(true);
      expect(template).toContain('{rev}');
      expect(template).toContain('{path}');
    }
    expect(browse.lineRange).toMatch(/^#.*\{start\}.*\{end\}/);
  });

  it('maps every test runner to a command that exists', () => {
    const ids = new Set(catalog.commands.map((command) => command.id));
    expect(Object.values(RUNNER_COMMAND).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe('ids', () => {
  it.each([
    ['nodes', idsOf(catalog.nodes)],
    ['runtimes', idsOf(catalog.runtimes)],
    ['relations', idsOf(catalog.relations)],
    ['apis', idsOf(catalog.apis)],
    ['contracts', idsOf(catalog.contracts)],
    ['documents', idsOf(catalog.documents)],
    ['commands', idsOf(catalog.commands)],
    ['tests', idsOf(catalog.tests)],
    ['scenarios', idsOf(catalog.scenarios)],
  ])('are unique across %s', (_name, ids) => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('source refs', () => {
  it('are canonical repository-relative paths that exist', () => {
    const bad = allSourceRefs().filter((ref) => !isCanonicalPath(ref.path) || !exists(ref.path));
    expect(bad).toEqual([]);
  });

  it('name symbols written in the referenced file', () => {
    const missing = allSourceRefs().filter(
      (ref) => ref.symbol && !symbolPattern(ref.symbol).test(read(ref.path)),
    );
    expect(missing).toEqual([]);
  });

  it('carry no commit SHA, URL, or line anchor outside the repository record', () => {
    const { repository: _repository, ...records } = catalog;
    const text = JSON.stringify(records);
    expect(text).not.toMatch(/\b[0-9a-f]{40}\b|https?:\/\/|#L\d/);
  });
});

describe('projects', () => {
  it('match every Nx project manifest in apps/ and libs/', () => {
    const declared = [
      ...nxPackageManifests().map(({ path, manifest }) => ({
        id: manifest.nx?.name,
        manifest: path,
        packageName: manifest.name,
        tags: manifest.nx?.tags,
      })),
      ...manifestPaths('apps', 'project.json').map((path) => {
        const config = readJson<NxConfig>(path);
        return { id: config.name, manifest: path, packageName: undefined, tags: config.tags };
      }),
    ];
    const curated = projects.map((project) => ({
      id: project.id,
      manifest: project.manifest.path,
      packageName: project.packageName,
      tags: project.nxTags,
    }));

    expect(curated.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      declared.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    );
  });

  it('are libraries exactly when they live under libs/', () => {
    for (const project of projects) {
      expect(project.kind === 'library').toBe(project.root.startsWith('libs/'));
      expect(project.manifest.path.startsWith(`${project.root}/`)).toBe(true);
    }
  });
});

describe('relations', () => {
  const nodeIds = new Set(idsOf(catalog.nodes));

  it('point at existing nodes, APIs, and contracts', () => {
    const apiIds = new Set(idsOf(catalog.apis));
    const contractIds = new Set(idsOf(catalog.contracts));
    for (const relation of catalog.relations) {
      expect(nodeIds.has(relation.from) && nodeIds.has(relation.to)).toBe(true);
      if (relation.kind === 'runtime') {
        expect(relation.apis.every((id) => apiIds.has(id))).toBe(true);
        expect(relation.contracts.every((id) => contractIds.has(id))).toBe(true);
      }
    }
  });

  it('list exactly the workspace dependencies the manifests declare', () => {
    const byPackage = new Map(projects.map((project) => [project.packageName, project.id]));
    const declared = nxPackageManifests().flatMap(({ path, manifest }) => {
      const from = String(manifest.nx?.name);
      const packageDeps = Object.entries(manifest.dependencies ?? {})
        .filter(([, version]) => version.startsWith('workspace:'))
        .map(([name]) => `${from}->${byPackage.get(name)}:package-dependency@${path}`);
      const implicit = (manifest.nx?.implicitDependencies ?? []).map(
        (to) => `${from}->${to}:implicit-dependency@${path}`,
      );
      return [...packageDeps, ...implicit];
    });
    const curated = catalog.relations
      .filter((relation) => relation.kind === 'workspace-dependency')
      .map((r) => `${r.from}->${r.to}:${r.declaredBy}@${r.evidence.path}`);

    expect(curated.sort()).toEqual(declared.sort());
  });

  it('name only API paths that appear in their evidence files', () => {
    // A `{param}` segment is written in the caller as a template placeholder: `/jobs/${id}`.
    const callPattern = (path: string) =>
      new RegExp(
        path
          .split(/\{[^}]+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('\\$\\{[^`]+?\\}'),
      );
    const patternOf = new Map(catalog.apis.map((api) => [api.id, callPattern(api.path)]));
    for (const relation of catalog.relations) {
      if (relation.kind !== 'runtime' || relation.interaction !== 'http-call') continue;
      const evidence = relation.evidence.map((ref) => read(ref.path)).join('\n');
      const missing = relation.apis.filter((id) => !patternOf.get(id)?.test(evidence));
      expect(missing).toEqual([]);
    }
  });
});

describe('apis', () => {
  type Swagger = { paths: Record<string, Record<string, unknown>> };
  const swagger = readJson<Swagger>(swaggerDocument.path);
  const documented = Object.entries(swagger.paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
  );
  const key = (api: { method: string; path: string }) => `${api.method} ${api.path}`;

  it('match the generated Swagger document for every always-on route', () => {
    const curated = catalog.apis.filter((api) => api.exposure === 'always').map(key);
    expect(curated.sort()).toEqual(documented.sort());
  });

  it('keep non-production routes out of Swagger', () => {
    const hidden = catalog.apis.filter((api) => api.exposure === 'non-production').map(key);
    expect(hidden.filter((route) => documented.includes(route))).toEqual([]);
  });
});

describe('contracts', () => {
  it('name literals that appear in the defining file', () => {
    for (const contract of catalog.contracts) {
      const text = read(contract.definedIn.path);
      const literal =
        contract.kind === 'webview-message' ? `type: '${contract.name}'` : contract.name;
      expect(text).toContain(literal);
    }
  });

  it('are owned by a library', () => {
    const libraryIds = new Set(projects.filter((p) => p.kind === 'library').map((p) => p.id));
    expect(catalog.contracts.every((contract) => libraryIds.has(contract.owner))).toBe(true);
  });
});

describe('documents', () => {
  it('cover every markdown file under docs/', () => {
    const onDisk = readdirSync(join(ROOT, 'docs'), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.md'))
      .map((path) => `docs/${path.split('\\').join('/')}`);
    const curated = catalog.documents.map((doc) => doc.path).filter((p) => p.startsWith('docs/'));
    expect(curated.sort()).toEqual(onDisk.sort());
  });

  it('carry the title written as the first heading', () => {
    for (const doc of catalog.documents) {
      expect(read(doc.path).split('\n')[0]).toBe(`# ${doc.title}`);
    }
  });
});

describe('commands', () => {
  const scripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;

  it('cover every root package.json script', () => {
    const curated = catalog.commands.flatMap((command) =>
      command.source.kind === 'package-script' ? [command.source.script] : [],
    );
    expect(curated.sort()).toEqual(Object.keys(scripts).sort());
  });

  it('name Nx targets the project manifest declares explicitly', () => {
    const manifestOf = new Map(projects.map((project) => [project.id, project.manifest.path]));
    for (const { source } of catalog.commands) {
      if (source.kind !== 'nx-target') continue;
      const targets = nxConfigOf(String(manifestOf.get(source.project))).targets ?? {};
      expect(Object.keys(targets)).toContain(source.target);
    }
  });
});
