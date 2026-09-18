import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { catalog } from '../data';
import type { CommandRef } from '../domain/model';

import { REPOSITORY_ROOT } from './snapshot';

type Manifest = {
  scripts?: Record<string, string>;
  targets?: Record<string, { options?: { command?: string } }>;
  nx?: { targets?: Record<string, { options?: { command?: string } }> };
};

const readManifest = (path: string): Manifest | null =>
  REPOSITORY_ROOT
    ? (JSON.parse(readFileSync(join(REPOSITORY_ROOT, path), 'utf8')) as Manifest)
    : null;

/**
 * What a command actually runs, read from the file that defines it at build time: the root
 * script body, or the Nx target's `options.command`. Null when the definition is not written
 * there (an inferred Nx target) — never guessed.
 */
export const definitionOf = ({ source }: CommandRef): string | null => {
  if (source.kind === 'package-script') {
    return readManifest('package.json')?.scripts?.[source.script] ?? null;
  }
  const project = catalog.nodes.find((node) => node.id === source.project);
  if (!project || project.kind === 'external') return null;
  const manifest = readManifest(project.manifest.path);
  const targets = manifest?.targets ?? manifest?.nx?.targets;
  return targets?.[source.target]?.options?.command ?? null;
};

/** Where `definitionOf` reads from, for the reader: `package.json › scripts.lint`. */
export const definitionSource = ({ source }: CommandRef): string | null => {
  if (source.kind === 'package-script') return `package.json › scripts.${source.script}`;
  const project = catalog.nodes.find((node) => node.id === source.project);
  if (!project || project.kind === 'external') return null;
  return `${project.manifest.path} › targets.${source.target}`;
};
