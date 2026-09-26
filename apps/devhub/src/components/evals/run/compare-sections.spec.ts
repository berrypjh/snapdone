import { readFileSync, writeFileSync } from 'node:fs';

import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { caseMatrix, grade, summaryTable } from '@/lib/evaluations/run-view';

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
 * replay-golden에 규칙 기준선 variant `rule-v`를 더한다. rule-v는 case-a를 틀리고(기준보다 나빠짐) case-b는 그대로
 * 틀리며, 요약은 category 정확도가 낮고 critical 비율이 높다.
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

describe('run comparison read model', () => {
  it('marks the best value per column and the change against the base', () => {
    const run = pairRun().repo.getRun('pair');
    const { base, rows } = summaryTable(run.summary, 'image-classification', 'replay-v');
    const [replay, rule] = rows;

    expect(base.variant.id).toBe('replay-v');
    // category 정확도: 33.3% 대 0% — 기준이 최고, rule-v는 33.3pp 나빠짐.
    expect(replay.cells[0].best).toBe(true);
    expect(rule.cells[0].delta).toEqual({ text: '−33.3pp', change: 'worse' });
    // critical 비율은 낮을수록 좋다 — 0% 대 50%.
    expect(rule.cells[2].delta).toEqual({ text: '+50.0pp', change: 'worse' });
    expect(grade(replay)).toBe('기준');
    expect(grade(rule)).toBe('악화 — 나빠짐 2');
  });

  it('finds cases where variants disagree and where one got worse than the base', () => {
    const run = pairRun().repo.getRun('pair');
    const { rows, counts, matches } = caseMatrix(run.cases, ['replay-v', 'rule-v'], 'replay-v');

    expect(rows.map((row) => row.caseId)).toEqual(['case-a', 'case-b', 'case-c']);
    expect(counts).toEqual({ all: 3, diff: 1, regressed: 1, failed: 1 });
    expect(rows.filter(matches.regressed).map((row) => row.caseId)).toEqual(['case-a']);
  });
});

describe('run page with several variants', () => {
  it('puts the comparison first and shows one variant in detail', () => {
    const html = page(pairRun());

    expect(html).toContain('variant 비교 2개');
    expect(html).toContain('<caption>variant 비교 — 기준 replay-v</caption>');
    expect(html).toContain('−33.3pp 나빠짐');
    expect(html).toContain('악화 — 나빠짐 2');
    expect(html).toContain('모든 품질 지표');
    expect(html).toContain('case별 결과');
    expect(html).toContain('variant 자세히 — replay-v');
    // 고르지 않은 variant의 자세한 묶음은 그리지 않는다.
    expect(html.match(/<h3 class="typo-body-small-strong">한눈에<\/h3>/g)).toHaveLength(1);
  });

  it('follows the URL for the variant, the base, and the case filter', () => {
    const html = page(pairRun(), { variant: 'rule-v', base: 'rule-v', show: 'regressed' });

    expect(html).toContain('variant 자세히 — rule-v');
    expect(html).toContain('<caption>variant 비교 — 기준 rule-v</caption>');
    expect(html).toContain('+33.3pp 좋아짐');
    // rule-v가 기준이면 replay-v가 통과한 case-a는 나빠진 것이 아니다 — rule-v는 실패했다.
    expect(html).toMatch(/✓\u00a0<\/span>기준보다 나빠짐 0/);
    expect(html).toContain('없음 — 이 필터에 맞는 case 없음');
    expect(html).toContain('규칙 기준선');
  });

  it('ignores an unknown variant in the URL', () => {
    const html = page(pairRun(), { variant: '../x', base: 'nope', show: 'bogus' });

    expect(html).toContain('variant 자세히 — replay-v');
    expect(html).toContain('<caption>variant 비교 — 기준 replay-v</caption>');
  });
});

describe('best marker', () => {
  it('marks nothing when every variant has the same value', () => {
    const run = pairRun().repo.getRun('pair');
    const { rows } = summaryTable(run.summary, 'image-classification', null);
    // 실행 완료율은 둘 다 100%.
    expect(rows.map((row) => row.cells[5].best)).toEqual([false, false]);
  });
});
