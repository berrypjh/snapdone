import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterOptions, parseFilter, runRows, trendOverview } from '@/lib/evaluations/overview';

import EvalComparePage from '../../../app/evals/compare/[comparisonId]/page';
import { removeResults, resultsRepository } from '../../../test-support/evaluation-results';
import { EvalsOverview } from '../evals-overview';

import { ComparisonView } from './comparison-view';

// route 입구가 요청 시점까지 기다리고, 셸의 탐색기 서랍이 경로를 읽는다(layout.spec과 같은 방식).
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('next/navigation', async (actual) => ({
  ...(await actual<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/evals/compare/x',
}));

afterEach(removeResults);

/** Go가 만든 comparison golden 하나를 그린다. */
const view = (name: string, runExists: (id: string) => boolean = () => false) => {
  const r = resultsRepository(false);
  const id = r.copyComparison(name);
  return renderToStaticMarkup(
    createElement(ComparisonView, { comparison: r.repo.getComparison(id), runExists }),
  );
};

describe('comparable comparisons', () => {
  it('shows a classification comparison with every axis, per-label F1, and a passed gate', () => {
    const html = view('replay-pair');

    for (const title of [
      '품질 차이',
      '신뢰성 차이',
      '지연 차이',
      'token · 비용 차이',
      'category별 차이',
      'case 변화',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).toMatch(
      /category-accuracy[\s\S]*?높을수록 좋음[\s\S]*?33\.3%[\s\S]*?100\.0%[\s\S]*?\+66\.7pp[\s\S]*?개선/,
    );
    // gate 결과 칩 자체를 본다(규칙 표의 통과 · 실패 글자와 섞이지 않게).
    expect(html).toMatch(/gate-example-v1<\/code><span[^>]*ui-chip[\s\S]*?ui-chip__label">통과</);
    expect(html).toContain('<caption>gate gate-example-v1 규칙</caption>');
    // 작은 표본 경고와 서술이라는 말이 늘 보인다.
    expect(html).toContain('small sample: 3 paired cases');
    expect(html).toContain('통계적 유의성이나 우열은 주장하지 않음');
    expect(html).toContain('고쳐짐');
  });

  it('shows a failed gate and the newly failed and errored cases', () => {
    const html = view('gate-failed');

    expect(html).toMatch(/gate-example-v1<\/code><span[^>]*ui-chip[\s\S]*?ui-chip__label">실패</);
    expect(html).toMatch(/pass-rate-drop-pp<\/th><td class="tabular-nums">5<\/td>/);
    expect(html).toContain('새로 틀림 6');
    expect(html).toContain('새로 실행 오류 1');
    expect(html).toMatch(
      /▼ <\/span>새로 틀림<\/span><span class="typo-body-medium-strong tabular-nums">6</,
    );
  });

  it('shows a text comparison without per-label deltas and with unavailable latency and tokens', () => {
    const html = view('text-pair');

    expect(html).not.toContain('category별 차이');
    expect(html).toContain('비교하지 않음 — latency is measured only in live runs');
    expect(html).toMatch(/비교하지 않음 — baseline usage is unavailable/);
    expect(html).toMatch(/corpus-cer[\s\S]*?낮을수록 좋음/);
    expect(html).toContain('gate 없음 — 규칙 없이 만든 비교');
    expect(html).toContain('새로 틀림 2');
  });

  it('shows a translation comparison and leaves unsupported semantic deltas without a bar', () => {
    const html = view('translation-pair');

    expect(html).toMatch(/normalized-exact-match-rate[\s\S]*?악화/);
    // 의미 유사도는 양쪽 다 unsupported라 비교 불가이고 막대 대신 이유다.
    expect(html).toMatch(
      /semantic-similarity[\s\S]*?지원 안 함[\s\S]*?baseline or candidate value is not measured[\s\S]*?비교 불가/,
    );
    expect(html).not.toContain('category별 차이');
  });

  it('keeps the partial warning visible and does not apply the gate', () => {
    const html = view('partial-pair');

    expect(html).toContain(
      'candidate run is partial; only paired cases are compared and no gate applies',
    );
    expect(html).toContain('적용하지 않음: gate needs completed runs with the same evaluator');
  });

  it('links to the run pages only when those runs exist', () => {
    expect(view('replay-pair', () => true)).toContain('href="/evals/runs/run-base"');
    const missing = view('replay-pair');
    expect(missing).not.toContain('href="/evals/runs/run-base"');
    expect(missing).toContain('(이 저장소의 결과에 없음)');
  });
});

describe('incomparable comparison', () => {
  it('shows only the reasons, no deltas, and a gate that was not applied', () => {
    const html = view('incomparable');

    expect(html).toContain('× 비교 불가');
    expect(html).toContain('비교할 수 없는 이유');
    expect(html).toContain('selection hash differs');
    expect(html).toContain('적용하지 않음: runs are not comparable');
    expect(html).not.toContain('품질 차이');
    expect(html).not.toContain('case 변화');
  });
});

describe('overview and route', () => {
  it('lists saved comparisons on /evals with their comparability and gate', () => {
    const r = resultsRepository();
    const failed = r.copyComparison('gate-failed');
    const incomparable = r.copyComparison('incomparable');
    const entries = r.repo.listRuns();
    const trend = trendOverview(entries);
    const rows = runRows(entries, trend);
    const html = renderToStaticMarkup(
      createElement(EvalsOverview, {
        rows,
        trend,
        filter: parseFilter(rows, null, null),
        options: filterOptions(rows),
        comparisons: r.repo.listComparisons(),
      }),
    );

    expect(html).toContain(`href="/evals/compare/${failed}"`);
    expect(html).toContain('gate × 실패');
    expect(html).toMatch(
      new RegExp(
        `${incomparable}</a><p[^>]*><span[^>]*>run-base</span> → <span[^>]*>run-cand</span> · × 비교 불가`,
      ),
    );
  });

  it.each(['../secret', 'Not_An_Id', 'no-such-comparison-anywhere'])(
    'answers 404 for %j',
    async (comparisonId) => {
      await expect(
        EvalComparePage({ params: Promise.resolve({ comparisonId }) }),
      ).rejects.toMatchObject({
        digest: expect.stringContaining('404'),
      });
    },
  );
});
