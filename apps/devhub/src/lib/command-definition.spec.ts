import { describe, expect, it } from 'vitest';

import { catalog } from '../data';
import type { CommandRef } from '../domain/model';
import { readJson } from '../test-support/repository-files';

import { definitionOf } from './command-definition';

const command = (id: string) => catalog.commands.find((c) => c.id === id) as CommandRef;

describe('definitionOf', () => {
  it('reads a root script body from package.json', () => {
    const scripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;
    expect(definitionOf(command('lint'))).toBe(scripts.lint);
    expect(definitionOf(command('verify'))).toContain('pnpm test');
  });

  it("reads an Nx target's command from the project manifest", () => {
    expect(definitionOf(command('api-migrate'))).toBe('go run ./cmd/migrate');
  });

  it('has a definition for every catalog command today', () => {
    expect(catalog.commands.filter((c) => definitionOf(c) === null).map((c) => c.id)).toEqual([]);
  });

  it('returns null for a target the manifest does not write down, instead of guessing', () => {
    const inferred: CommandRef = {
      ...command('lint'),
      source: { kind: 'nx-target', project: 'web', target: 'test' },
    };
    expect(definitionOf(inferred)).toBeNull();
  });
});
