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
 * 명령이 실제로 무엇을 실행하는지. 빌드 시점에 정의 파일에서 읽는다 — 루트 스크립트 본문이나
 * Nx target의 `options.command`. 거기에 적혀 있지 않으면(추론된 Nx target) null이고 추측하지 않는다.
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

/** `definitionOf`가 어디서 읽었는지 독자에게 보여 준다: `package.json › scripts.lint`. */
export const definitionSource = ({ source }: CommandRef): string | null => {
  if (source.kind === 'package-script') return `package.json › scripts.${source.script}`;
  const project = catalog.nodes.find((node) => node.id === source.project);
  if (!project || project.kind === 'external') return null;
  return `${project.manifest.path} › targets.${source.target}`;
};
