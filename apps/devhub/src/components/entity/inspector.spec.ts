import { createElement } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RepositorySnapshot } from '../../domain/model';
import { findStep } from '../../lib/catalog/entities';
import { inspectStep } from '../../lib/catalog/inspection';
import { renderInDevHub } from '../../test-support/devhub-provider';

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

vi.mock('../../lib/repository/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/repository/snapshot')>()),
  currentSnapshot: () => snapshot.current,
  committedPaths: () => null,
}));

const exchange = findStep('webview-auth-handoff', 'exchange');
if (!exchange) throw new Error('fixture step missing');
const inspection = inspectStep(exchange.scenario, exchange.step);
const render = () => renderInDevHub(createElement(Inspector, { inspection }));
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
afterEach(() => vi.unstubAllEnvs());

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

  it('puts the editor action beside copy, and only while developing', () => {
    const editor = /aria-label="에디터에서 열기: ([^"]+)"/g;
    // 두 경우 모두 모드를 밝힌다. 로컬 env 파일이 테스트 실행의 `NODE_ENV`를 정하기 때문이다.
    vi.stubEnv('NODE_ENV', 'production');
    expect(count(render(), editor)).toBe(0);

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEVHUB_EDITOR', 'cursor');
    const html = render();
    const files = new Set(inspection.source.map((ref) => ref.path)).size;
    expect(count(section(html, 'inspector-source'), editor)).toBe(files);
    // 파일의 두 동작은 에디터를 앞에 두고 붙어 있고, 사이에는 그 아이콘만 있다.
    expect(html).toMatch(
      /에디터에서 열기: ([^"]+)"[^<]*<svg[\s\S]*?<\/a>\s*<span[^>]*><button[^>]*aria-label="경로 복사: \1"/,
    );
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

describe('step pager', () => {
  const { scenario } = exchange;
  const pagerOf = (index: number) => inspectStep(scenario, scenario.steps[index]).pager;

  it('pages through the steps in the scenario order, named by their intent', () => {
    const pager = pagerOf(1);
    expect(pager?.unit).toBe('단계');
    expect(pager?.current).toBe(scenario.steps[1].id);
    expect(pager?.entities.map((step) => step.label)).toEqual(
      scenario.steps.map((step) => step.intent),
    );
  });

  it('is a pair of arrows named after their target, landing on its details', () => {
    const html = renderInDevHub(createElement(Inspector, { inspection }));
    const pager = html.match(/<nav aria-label="단계 이동"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const links = [...pager.matchAll(/<a [^>]*>/g)].map(([tag]) => ({
      href: tag.match(/href="([^"]+)"/)?.[1],
      name: tag.match(/aria-label="([^"]+)"/)?.[1],
    }));
    const { steps } = exchange.scenario;
    const at = steps.findIndex((s) => s.id === exchange.step.id);
    expect(links).toEqual([
      {
        href: `/scenarios/${exchange.scenario.id}/steps/${steps[at - 1].id}#devhub-inspector`,
        name: `이전 단계: ${steps[at - 1].intent}`,
      },
      {
        href: `/scenarios/${exchange.scenario.id}/steps/${steps[at + 1].id}#devhub-inspector`,
        name: `다음 단계: ${steps[at + 1].intent}`,
      },
    ]);
  });

  it('keeps the missing side as a disabled arrow', () => {
    const { scenario } = exchange;
    const first = inspectStep(scenario, scenario.steps[0]);
    const html = renderInDevHub(createElement(Inspector, { inspection: first }));
    const pager = html.match(/<nav aria-label="단계 이동"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(pager).toMatch(
      /<button[^>]*disabled[^>]*aria-label="이전 단계 없음"|<button[^>]*aria-label="이전 단계 없음"[^>]*disabled/,
    );
    expect(pager.match(/<a /g)).toHaveLength(1);

    const last = inspectStep(scenario, scenario.steps[scenario.steps.length - 1]);
    const lastPager =
      renderInDevHub(createElement(Inspector, { inspection: last })).match(
        /<nav aria-label="단계 이동"[\s\S]*?<\/nav>/,
      )?.[0] ?? '';
    expect(lastPager).toMatch(
      /<button[^>]*disabled[^>]*aria-label="다음 단계 없음"|<button[^>]*aria-label="다음 단계 없음"[^>]*disabled/,
    );
    expect(lastPager.match(/<a /g)).toHaveLength(1);
  });
});
