import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { sourceUsage } from '../repository/source-usage';

import { buildSearchIndex, normalize, search, tokensOf, topResults } from './search-index';

const index = buildSearchIndex();
const labels = (query: string) => search(index, query).map((r) => `${r.kind}:${r.label}`);
const shown = (query: string) =>
  topResults(search(index, query)).map((r) => `${r.kind}:${r.label}`);

describe('index', () => {
  it('derives one entry per catalog entity, with unique keys', () => {
    const keys = index.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    const count = (kind: string) => index.filter((entry) => entry.kind === kind).length;
    expect(count('scenario')).toBe(catalog.scenarios.length);
    expect(count('step')).toBe(catalog.scenarios.flatMap((s) => s.steps).length);
    expect(count('api')).toBe(catalog.apis.length);
    expect(count('test')).toBe(catalog.tests.length);
    expect(count('document')).toBe(catalog.documents.length);
    expect(count('command')).toBe(catalog.commands.length);
    expect(count('source')).toBe(sourceUsage().size);
    expect(count('node')).toBe(catalog.nodes.length);
  });

  it('points every result at an DevHub route', () => {
    expect(index.filter((entry) => !entry.href.startsWith('/'))).toEqual([]);
  });
});

describe('tokens', () => {
  it('splits camelCase and punctuation and keeps the whole word', () => {
    expect(tokensOf('webHandoff.ts')).toEqual(
      expect.arrayContaining(['webhandoff', 'web', 'handoff', 'ts']),
    );
    expect(tokensOf('WebView 경계')).toEqual(expect.arrayContaining(['webview', '경계']));
    expect(normalize('  Session ')).toBe('session');
  });
});

describe('ranking', () => {
  it('puts an exact id, path, or title first', () => {
    expect(labels('auth-contracts')[0]).toBe('library:auth-contracts');
    expect(labels('/v1/auth/handoff/start')[0]).toBe('api:POST /v1/auth/handoff/start');
    expect(labels('quality-gates')).toEqual(['document:docs/engineering/quality-gates.md']);
  });

  it('orders tiers exact → prefix → word → substring → related', () => {
    const tiers = search(index, 'webview').map((r) => r.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    expect(new Set(tiers)).toEqual(new Set([0, 1, 2, 4]));
  });

  it('falls back to substring when no word starts with the query', () => {
    const results = search(index, 'andoff');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.tier >= 3)).toBe(true);
  });

  it('is deterministic and case-insensitive', () => {
    expect(labels('session')).toEqual(labels('session'));
    expect(labels('SESSION')).toEqual(labels('session'));
  });

  it('finds nothing for an empty query or an unknown word', () => {
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, 'zzzz-not-in-repo')).toEqual([]);
  });
});

describe('concept queries reach scenarios, sources, docs, and tests', () => {
  it('webview', () => {
    expect(shown('webview')).toEqual(
      expect.arrayContaining([
        'concept:WebView 경계',
        'scenario:앱 → 기록 WebView',
        'scenario:WebView 로그인 핸드오프',
        'library:webview-bridge',
        'source:libs/webview-bridge/src/lib/bridge.ts',
      ]),
    );
    expect(labels('webview')).toContain('source:apps/mobile/src/auth/webHandoff.ts');
  });

  it('handoff', () => {
    expect(shown('handoff')).toEqual(
      expect.arrayContaining([
        'scenario:WebView 로그인 핸드오프',
        'source:apps/web/src/lib/auth/handoff.ts',
        'api:POST /v1/auth/handoff/start',
        'contract:handoff-ready',
      ]),
    );
    expect(shown('handoff').some((r) => r.startsWith('test:'))).toBe(true);
  });

  it('session', () => {
    expect(shown('session')).toEqual(
      expect.arrayContaining([
        'api:GET /v1/auth/session',
        'scenario:앱 진입 · 세션 복원',
        'contract:Session',
      ]),
    );
  });

  it('history', () => {
    expect(shown('history')).toEqual(
      expect.arrayContaining([
        'source:apps/web/src/app/(product)/history/page.tsx',
        'scenario:보호된 기록 화면 접근',
      ]),
    );
  });
});

describe('topResults', () => {
  it('keeps rank order and caps each kind', () => {
    const all = search(index, 'handoff');
    const top = topResults(all, 2, 30);
    const perKind = new Map<string, number>();
    for (const r of top) perKind.set(r.kind, (perKind.get(r.kind) ?? 0) + 1);
    expect(Math.max(...perKind.values())).toBeLessThanOrEqual(2);
    const positions = top.map((r) => all.indexOf(r));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
