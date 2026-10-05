import { readFileSync, writeFileSync } from 'node:fs';

import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { caseMatrix, compareCommands, summaryTable } from '@/lib/evaluations/run-view';

import { removeResults, resultsRepository } from '../../../test-support/evaluation-results';
import { parseRunView, RunDetailView } from '../run-detail';

vi.mock('next/navigation', async (actual) => ({
  ...(await actual<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/evals/runs/pair',
}));

afterEach(removeResults);

type Json = Record<string, unknown>;
const measured = (value: number) => ({ availability: 'measured', value });

/**
 * replay-golden에 규칙 기준선 variant `rule-v`를 더한다. rule-v는 case-a를 틀리고 case-b는 그대로 틀리며, 요약은
 * category 정확도가 낮고 critical 비율이 높다.
 */
const pairRun = () => {
  const r = resultsRepository();
  r.copyRun('replay-golden', 'pair');
  const rule = { adapter: 'baseline', provider: 'none', model: 'rule-v' };
  r.edit('pair/metadata.json', (m) => {
    const [v] = m.variants as Json[];
    (m.variants as Json[]).push({ ...v, id: 'rule-v', ...rule });
  });
  r.edit('pair/summary.json', (s) => {
    const [v] = s.variants as Json[];
    const copy = JSON.parse(JSON.stringify(v)) as Json;
    Object.assign(copy.variant as Json, { id: 'rule-v', ...rule });
    const q = (copy.quality as Json[])[0].classification as Json;
    (q.category as Json).accuracy = measured(0);
    (q.risk as Json).criticalRate = measured(0.5);
    (s.variants as Json[]).push(copy);
  });
  const path = r.file('pair/cases.jsonl');
  const lines = readFileSync(path, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l) as Json);
  const rule_lines = lines.map((line) => {
    const copy = JSON.parse(JSON.stringify(line)) as Json;
    copy.variantId = 'rule-v';
    copy.invocationId = `rule-v/${String(copy.caseId)}/1`;
    if (copy.caseId === 'case-a') {
      copy.quality = { outcome: 'failed', checks: [{ name: 'category', outcome: 'failed' }] };
    }
    return copy;
  });
  writeFileSync(path, [...lines, ...rule_lines].map((l) => JSON.stringify(l)).join('\n') + '\n');
  return r;
};

const page = (r: ReturnType<typeof resultsRepository>, query: Json = {}) => {
  const run = r.repo.getRun('pair');
  return renderToStaticMarkup(
    createElement(RunDetailView, { run, view: parseRunView(run, query) }),
  );
};

describe('run read model', () => {
  it('puts Go values side by side without judging which is better', () => {
    const run = pairRun().repo.getRun('pair');
    const { columns, rows } = summaryTable(run.summary, 'image-classification');
    const [replay, rule] = rows;

    expect(columns.map((c) => c.label)[0]).toBe('category 정확도');
    expect(replay.cells[0].text).toBe('33.3%');
    expect(rule.cells[0].text).toBe('0.0%');
    expect(rule.cells[2].text).toBe('50.0%');
    // 판정 칸이 없다 — delta · best · grade 같은 것은 Go comparison 산출물의 몫이다.
    expect(Object.keys(replay).sort()).toEqual(['cells', 'report']);
    expect(Object.keys(replay.cells[0]).sort()).toEqual([
      'availability',
      'missing',
      'reason',
      'text',
    ]);
  });

  it('names the Go command that judges each pair', () => {
    expect(compareCommands('pair', ['replay-v', 'rule-v'])).toEqual([
      'pnpm eval compare --baseline pair:replay-v --candidate pair:rule-v',
    ]);
    expect(compareCommands('solo', ['only'])).toEqual([]);
  });

  it('groups cases where variants disagree and where every variant failed', () => {
    const run = pairRun().repo.getRun('pair');
    const { rows, counts, matches } = caseMatrix(run.cases, ['replay-v', 'rule-v']);

    expect(rows.map((row) => row.caseId)).toEqual(['case-a', 'case-b', 'case-c']);
    expect(counts).toEqual({ all: 3, diff: 1, failed: 1 });
    expect(rows.filter(matches.diff).map((row) => row.caseId)).toEqual(['case-a']);
    expect(rows.filter(matches.failed).map((row) => row.caseId)).toEqual(['case-b']);
  });
});

describe('run page with several variants', () => {
  it('shows the side-by-side table, the compare commands, and one variant in detail', () => {
    const html = page(pairRun());

    expect(html).toContain('variant 비교 2개');
    expect(html).toContain('<caption>variant 나란히</caption>');
    expect(html).toContain('pnpm eval compare --baseline pair:replay-v --candidate pair:rule-v');
    expect(html).toContain('comparison.json');
    expect(html).not.toContain('나빠짐');
    expect(html).not.toContain('최고');
    expect(html).toContain('모든 품질 지표');
    expect(html).toContain('case별 결과');
    expect(html).toContain('variant 자세히 — replay-v');
    // 고르지 않은 variant의 자세한 묶음은 그리지 않는다.
    expect(html.match(/<h3 class="typo-body-small-strong">한눈에<\/h3>/g)).toHaveLength(1);
  });

  it('follows the URL for the variant and the case filter', () => {
    const html = page(pairRun(), { variant: 'rule-v', show: 'failed' });

    expect(html).toContain('variant 자세히 — rule-v');
    expect(html).toMatch(/✓\u00a0<\/span>모두 실패 1/);
    expect(html).toContain('>case-b<');
    expect(html).toContain('규칙 기준선');
  });

  it('ignores an unknown variant or filter in the URL', () => {
    const html = page(pairRun(), { variant: '../x', show: 'regressed' });

    expect(html).toContain('variant 자세히 — replay-v');
    expect(html).toMatch(/✓\u00a0<\/span>전체 3/);
  });
});
