import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `'use client'` 파일이 가져오는 코드를 따라가 Node 모듈(`node:fs` 등)에 닿지 않는지 본다. 닿으면 브라우저 번들을
 * 만들지 못해 Next build가 실패한다 — Node에서 도는 단위 테스트는 이것을 잡지 못한다.
 */

const SRC = resolve(__dirname, '..');

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

const resolveImport = (from: string, spec: string) => {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  return ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find(existsSync);
};

/** 값을 가져오는 import만 따라간다. `import type`은 번들에 들어가지 않는다. */
const valueImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]);

const nodeImportsReachedFrom = (entry: string) => {
  const seen = new Set<string>();
  const found: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('node:')) found.push(`${file.slice(SRC.length + 1)} → ${spec}`);
      else if (spec.startsWith('.') || spec.startsWith('@/')) {
        const next = resolveImport(file, spec);
        if (next) visit(next);
      }
    }
  };
  visit(entry);
  return found;
};

describe('client components', () => {
  const clients = files(SRC).filter(
    (file) => !file.includes('.spec.') && /^['"]use client['"]/.test(readFileSync(file, 'utf8')),
  );

  it('exist', () => {
    expect(clients.length).toBeGreaterThan(0);
  });

  it.each(clients.map((file) => [file.slice(SRC.length + 1), file]))(
    '%s reaches no Node module',
    (_, file) => {
      expect(nodeImportsReachedFrom(file)).toEqual([]);
    },
  );
});
