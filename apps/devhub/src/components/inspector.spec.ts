import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RepositorySnapshot } from '../domain/model';
import { findStep } from '../lib/entities';
import { inspectStep } from '../lib/inspection';

import { Inspector } from './inspector';

const snapshot = vi.hoisted(() => ({
  current: {
    repositoryId: 'snapdone',
    commit: 'a'.repeat(40),
    branch: 'main',
    source: 'env',
    dirty: false,
  } as RepositorySnapshot,
}));

vi.mock('../lib/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/snapshot')>()),
  currentSnapshot: () => snapshot.current,
  committedPaths: () => null,
}));

const exchange = findStep('webview-auth-handoff', 'exchange');
if (!exchange) throw new Error('fixture step missing');
const inspection = inspectStep(exchange.scenario, exchange.step);
const render = () => renderToStaticMarkup(createElement(Inspector, { inspection }));
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
const section = (html: string, id: string) =>
  html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';

describe('Inspector evidence lists', () => {
  it('links each cited file once per section, with one copy button beside it', () => {
    const html = render();
    const sources = new Set(inspection.source.map((ref) => ref.path)).size;
    const tests = new Set(inspection.tests.map((test) => test.source.path)).size;
    for (const [id, files] of [
      ['inspector-source', sources],
      ['inspector-tests', tests],
    ] as const) {
      const part = section(html, id);
      expect({ id, links: count(part, /target="_blank"/g) }).toEqual({ id, links: files });
      expect({ id, copies: count(part, /aria-label="경로 복사: /g) }).toEqual({
        id,
        copies: files,
      });
    }
    expect(html).not.toContain('최신 main에서 보기');
  });

  it('says what each list holds before it is read', () => {
    const html = render();
    expect(html).toContain('web 4 · api 2');
    expect(html).toContain('vitest 3 · go-test 2 · playwright 3');
  });

  it('shows each test file with its runner and run conditions once', () => {
    const html = render();
    expect(count(html, />DB 필요</g)).toBe(1);
    for (const title of ['TestHandoffCreatesChildWebSession', 'TestHandoffExchangeChecksProof']) {
      expect(html).toContain(title);
    }
  });

  it('leaves out overview facts that hold nothing', () => {
    const html = render();
    for (const term of ['경유', '증거 공백', '부재 검색']) expect(html).not.toContain(`>${term}<`);
  });
});

describe('Inspector without a snapshot commit', () => {
  it('links to the branch and says so in text', () => {
    snapshot.current = { ...snapshot.current, commit: null, source: 'unavailable', dirty: null };
    const html = render();
    expect(html).toContain('/blob/main/apps/web/src/lib/auth/handoff.ts');
    expect(html).toContain('최신 main 기준');
    expect(html).toContain('최신 main에서 보기, 새 창');
  });
});
