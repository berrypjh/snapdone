import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { VerificationLimits, VerificationSection } from '../../components/entity/verification-note';
import { catalog } from '../../data';
import type { EvidenceGap } from '../../domain/model';
import { headingPattern, read, readJson } from '../../test-support/repository-files';

import { GAP } from './labels';
import {
  CI_DOC,
  GAP_PRIORITY,
  scenarioGaps,
  scenarioTests,
  TEST_RUNS,
  testRunsOf,
  verificationSummary,
} from './verification';

const scenario = (id: string) => {
  const found = catalog.scenarios.find((s) => s.id === id);
  if (!found) throw new Error(`no scenario ${id}`);
  return found;
};

describe('verification summary', () => {
  it('ranks every gap kind exactly once', () => {
    const kinds: EvidenceGap['kind'][] = Object.keys(GAP) as EvidenceGap['kind'][];
    expect([...GAP_PRIORITY].sort()).toEqual([...kinds].sort());
  });

  it('keeps the mobile restore flow at "runtime unverified" only', () => {
    expect(verificationSummary(scenario('app-entry-session-restore'))).toEqual({
      kinds: ['런타임 미검증'],
      shown: ['런타임 미검증'],
      more: 0,
    });
  });

  it('shows the browser login as unverified against the real provider, not as untested', () => {
    const summary = verificationSummary(scenario('browser-google-login'));
    expect(summary.shown[0]).toBe('외부 연동 미검증');
    expect(summary.kinds).not.toContain('테스트 없음');
  });

  it('shows two kinds and counts the rest for the mobile login', () => {
    const summary = verificationSummary(scenario('mobile-google-login'));
    expect(summary.shown).toEqual(['외부 연동 미검증', '런타임 미검증']);
    expect(summary.more).toBe(1);
    expect(summary.kinds).toContain('설정 필요');
  });

  it('is independent of the implementation status', () => {
    const implemented = catalog.scenarios.filter((s) => s.status === 'implemented');
    const withGaps = implemented.filter((s) => verificationSummary(s).kinds.length > 0);
    expect(withGaps.length).toBeGreaterThan(0);
    expect(withGaps.length).toBeLessThanOrEqual(implemented.length);
  });

  it('collects scenario gaps first, then step gaps with their step', () => {
    const gaps = scenarioGaps(scenario('browser-google-login'));
    expect(gaps[0].step).toBeUndefined();
    expect(gaps.some((gap) => gap.step)).toBe(true);
  });
});

describe('test runs', () => {
  it('name root scripts and quality-gate headings that exist', () => {
    const { scripts } = readJson<{ scripts: Record<string, string> }>('package.json');
    const doc = catalog.documents.find((d) => d.id === 'quality-gates');
    if (!doc) throw new Error('no quality-gates document');
    const text = read(doc.path);
    for (const run of [...Object.values(TEST_RUNS)]) {
      expect(scripts, run.script).toHaveProperty(run.script);
      expect(text, run.doc.heading).toMatch(headingPattern(String(run.doc.heading)));
    }
    expect(text).toMatch(headingPattern(String(CI_DOC.heading)));
  });

  it('group the cited tests by runner with their combined requirements', () => {
    const runs = testRunsOf(scenarioTests(scenario('browser-google-login')));
    const runners = runs.map((run) => run.runner);
    expect(runners).toContain('playwright');
    expect(runs.find((run) => run.runner === 'playwright')?.requires).toEqual(
      expect.arrayContaining(['port-binding', 'browser-binaries']),
    );
    expect(runs.reduce((sum, run) => sum + run.count, 0)).toBe(
      scenarioTests(scenario('browser-google-login')).length,
    );
  });
});

describe('verification markup', () => {
  it('writes limits as text next to the status, and nothing when there are none', () => {
    const limited = renderToStaticMarkup(
      createElement(VerificationLimits, { scenario: scenario('mobile-google-login') }),
    );
    expect(limited).toContain('미검증: 외부 연동 미검증 · 런타임 미검증 외 1');
    const clean = catalog.scenarios.find((s) => verificationSummary(s).kinds.length === 0);
    if (clean) {
      expect(renderToStaticMarkup(createElement(VerificationLimits, { scenario: clean }))).toBe('');
    }
  });

  it('separates registered tests from pass results and lists every gap with its note', () => {
    const html = renderToStaticMarkup(
      createElement(VerificationSection, { scenario: scenario('browser-google-login') }),
    );
    expect(html).toContain('통과했다는 결과가 아니다');
    expect(html).toContain('pnpm e2e');
    expect(html).toContain('href="/documents/quality-gates#e2e-범위"');
    for (const gap of scenarioGaps(scenario('browser-google-login'))) {
      expect(html).toContain(gap.note);
    }
  });
});
