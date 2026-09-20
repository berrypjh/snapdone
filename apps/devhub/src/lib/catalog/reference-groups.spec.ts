import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';

import { findStep } from './entities';
import {
  countByProject,
  countByRunner,
  groupSources,
  groupTests,
  REPOSITORY_GROUP,
} from './reference-groups';

const exchange = findStep('webview-auth-handoff', 'exchange');
if (!exchange) throw new Error('fixture step missing');
const tests = exchange.step.tests.flatMap((id) => catalog.tests.filter((test) => test.id === id));

describe('groupSources', () => {
  it('shows each file once, under its project, with every symbol cited in it', () => {
    const groups = groupSources(exchange.step.source);
    expect(groups.map((group) => group.project)).toEqual(['web', 'api']);
    const handoff = groups[0].files.find((file) => file.name === 'handoff.ts');
    expect(handoff).toMatchObject({
      path: 'apps/web/src/lib/auth/handoff.ts',
      folder: 'src/lib/auth/',
      symbols: ['handleHandoff', 'completeHandoff'],
    });
    const files = groups.flatMap((group) => group.files);
    expect(files).toHaveLength(new Set(exchange.step.source.map((ref) => ref.path)).size);
    expect(countByProject(groups, (file) => file.symbols.length)).toBe('web 4 · api 2');
  });

  it('puts paths outside every project in the repository group', () => {
    const [group] = groupSources([{ path: 'docs/architecture/data-access.md' }]);
    expect(group).toEqual({
      project: REPOSITORY_GROUP,
      files: [
        {
          path: 'docs/architecture/data-access.md',
          name: 'data-access.md',
          folder: 'docs/architecture/',
          symbols: [],
        },
      ],
    });
  });
});

describe('groupTests', () => {
  it('says the file, runner, and run conditions once for all its tests', () => {
    const groups = groupTests(tests);
    const files = groups.flatMap((group) => group.files);
    expect(files.map((file) => `${file.name}:${file.titles.length}`)).toEqual([
      'handoff.spec.ts:3',
      'handoff_test.go:2',
      'auth.spec.ts:2',
      'in-app.spec.ts:1',
    ]);
    const go = files.find((file) => file.name === 'handoff_test.go');
    expect(go).toMatchObject({ runner: 'go-test', requires: ['database'] });
    expect(files.reduce((n, file) => n + file.titles.length, 0)).toBe(tests.length);
    expect(countByRunner(tests)).toBe('vitest 3 · go-test 2 · playwright 3');
  });
});
