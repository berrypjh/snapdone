import { createElement } from 'react';

import { ExplorerDrawerProvider } from '@berrypjh/devhub-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { filterOptions, parseFilter, runRows, trendOverview } from '@/lib/evaluations/overview';
import { EvaluationArtifactError } from '@/lib/evaluations/repository';

import { renderInDevHub, testRouter } from '../../test-support/devhub-provider';
import { removeResults, resultsRepository } from '../../test-support/evaluation-results';
import { DevHubShell } from '../shell/devhub-shell';
import { TopBar } from '../shell/top-bar';

import { EvalsOverview } from './evals-overview';
import { RunDetailView, RunProblem } from './run-detail';

afterEach(removeResults);

// 상단 바의 탐색기 서랍이 경로를 읽는다(layout.spec과 같은 방식).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/evals',
}));

const unavailable = {
  availability: 'unavailable',
  value: null,
  reason: 'no predicted case with a non-empty reference',
};
type TextJson = { variants: { quality: { text: Record<string, unknown> }[] }[] };

const overviewHtml = (
  r: ReturnType<typeof resultsRepository>,
  query: { task?: string; dataset?: string } = {},
) => {
  const entries = r.repo.listRuns();
  const trend = trendOverview(entries);
  const rows = runRows(entries, trend);
  return renderToStaticMarkup(
    createElement(EvalsOverview, {
      rows,
      trend,
      filter: parseFilter(rows, query.task, query.dataset),
      options: filterOptions(rows),
    }),
  );
};

/** text-golden을 시작 시각만 바꿔 두 번 더 복사해 비교 가능한 묶음을 만든다. */
const textSeries = () => {
  const r = resultsRepository();
  for (const [id, at] of [
    ['text-b', '2026-09-23T06:00:00Z'],
    ['text-c', '2026-09-24T06:00:00Z'],
  ]) {
    r.copyRun('text-golden', id);
    r.edit(`${id}/metadata.json`, (m) => (m.startedAt = at));
  }
  return r;
};

describe('/evals overview', () => {
  it('explains how to create a run when there are no results', () => {
    const html = overviewHtml(resultsRepository(false));

    expect(html).toContain('평가 run 없음');
    expect(html).toContain('pnpm eval replay');
    expect(html).not.toContain('<table');
  });

  it('lists mixed task runs with links to their detail pages and accessible names', () => {
    const html = overviewHtml(resultsRepository());

    for (const id of ['replay-golden', 'text-golden', 'translation-golden']) {
      expect(html).toContain(`href="/evals/runs/${id}"`);
    }
    expect(html).toContain('최근 run 3개');
    expect(html).toContain('aria-label="필터"');
    // 답 출처를 세고, 실제 모델 run이 없으면 경고한다.
    expect(html).toMatch(/기록 재채점<\/span><\/span><\/span><span class="typo-body-small">3</);
    expect(html).toContain('실제 모델을 호출한 run 없음');
    // 상태는 색만이 아니라 기호와 글자로도 읽힌다.
    expect(html).toContain('◐');
    expect(html).toContain('일부만 실행');
    expect(html).toContain('사진 분류');
    expect(html).toContain('보존 구간 재현율');
    // 완료 run이 하나뿐이라 이을 추세가 없다.
    expect(html).toContain('이을 수 있는 추세 없음');
    expect(html).not.toContain('role="img"');
  });

  it('warns on a variant whose calls did not all finish, next to its metric', () => {
    const r = resultsRepository();
    r.edit('text-golden/summary.json', (s) => {
      const execution = (s.variants as Record<string, Record<string, number>>[])[0].execution;
      execution.completed = 2;
      execution.failed = 1;
    });
    const html = overviewHtml(r);

    // replay-golden은 미실행 1, text-golden은 방금 고친 실패 1.
    expect(html).toContain('미실행 1 / 3번 — 이 variant의 지표는 실패를 틀린 답으로 셈');
    expect(html).toContain('실행 실패 1 / 3번');
  });

  it('shows an unavailable metric as text with its reason, not as zero', () => {
    const r = resultsRepository();
    r.edit(
      'text-golden/summary.json',
      (s) => ((s as unknown as TextJson).variants[0].quality[0].text.corpusCer = unavailable),
    );
    const html = overviewHtml(r);

    expect(html).toContain('값 없음');
    expect(html).toContain(unavailable.reason);
    expect(html).not.toContain('0.000');
  });

  it('filters by task and marks the chosen filter as current', () => {
    const html = overviewHtml(resultsRepository(), { task: 'translation' });

    expect(html).toContain('href="/evals/runs/translation-golden"');
    expect(html).not.toContain('href="/evals/runs/replay-golden"');
    expect(html).toMatch(
      /aria-current="true"[^>]*href="\/evals\?task=translation"><span aria-hidden="true">✓/,
    );
    expect(html).toContain('최근 run 1개');
  });

  it('draws a comparable series with a text alternative and a data table', () => {
    const html = overviewHtml(textSeries());

    expect(html).toMatch(
      /role="img" aria-label="corpus CER 추세, run 3개\. 처음 [^"]+, 마지막 [^"]+\. 낮을수록 좋음\."/,
    );
    expect(html).toContain('<summary');
    expect(html).toContain('표로 보기');
    expect(html.match(/<circle /g)).toHaveLength(3);
  });

  it('breaks the line at a run without a value and says so', () => {
    const r = textSeries();
    r.edit(
      'text-b/summary.json',
      (s) => ((s as unknown as TextJson).variants[0].quality[0].text.corpusCer = unavailable),
    );
    const html = overviewHtml(r);

    expect(html).toContain('값이 없는 run 1개');
    expect(html.match(/<circle /g)).toHaveLength(2);
    // 가운데 값이 없어 이어지는 구간이 없다 — 선을 그리지 않는다.
    expect(html).not.toMatch(/<path d="M[^"]*L/);
  });
});

describe('/evals run detail', () => {
  it('shows translation diagnostics without a pass rate when the policy does not score', () => {
    const run = resultsRepository().repo.getRun('translation-golden');
    const html = renderToStaticMarkup(createElement(RunDetailView, { run }));

    expect(html).toContain('보존 구간 재현율');
    expect(html).toContain('진단값');
    expect(html).toContain('지원 안 함');
    expect(html).not.toContain('pass rate');
    expect(html).toContain('href="/evals"');
  });

  it('shows the per-field table for text extraction', () => {
    const run = resultsRepository().repo.getRun('text-golden');
    const html = renderToStaticMarkup(createElement(RunDetailView, { run }));

    expect(html).toContain('tv field별');
    expect(html).toContain('store');
  });

  it('explains a run that cannot be read', () => {
    const error = new EvaluationArtifactError(
      'unsupported-schema',
      'run metadata schemaVersion 2 is not supported',
      'tools/evals/results/x/metadata.json',
    );
    const html = renderToStaticMarkup(createElement(RunProblem, { error }));

    expect(html).toContain('role="alert"');
    expect(html).toContain('모르는 schema 버전');
    expect(html).toContain('tools/evals/results/x/metadata.json');
  });
});

const topBar = () =>
  renderInDevHub(
    createElement(ExplorerDrawerProvider, {
      children: createElement(TopBar, { summary: 'berry/snapdone' }),
    }),
  );

describe('top bar', () => {
  it('shows the product and summary and leaves moving between views to the explorer', () => {
    const html = topBar();

    expect(html).toContain('Snapdone DevHub');
    expect(html).toContain('berry/snapdone');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('aria-current');
  });
});

const explorer = (pathname: string) =>
  renderInDevHub(
    createElement(DevHubShell, { inspector: null, children: createElement('main') }),
    testRouter(pathname),
  );

describe('evals in the explorer', () => {
  it('lists every task under 평가 and marks the current one', () => {
    const html = explorer('/evals/tasks/image-classification');

    for (const href of [
      '/evals/tasks/image-classification',
      '/evals/tasks/text-extraction',
      '/evals/tasks/translation',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('<a href="/evals/tasks/image-classification" aria-current="page"');
    expect(html).not.toContain('<a href="/evals" aria-current="page"');
  });

  it('marks 평가 itself on the evals overview', () => {
    expect(explorer('/evals')).toContain('<a href="/evals" aria-current="page"');
  });
});

describe('explorer groups', () => {
  it('folds documents by topic and opens only the group of the current document', () => {
    const html = explorer('/documents/agents');
    const groups = [...html.matchAll(/<details( open="")?[^>]*>[\s\S]*?<\/details>/g)];
    const documents = groups.filter(([group]) => group.includes('href="/documents/'));

    expect(documents.length).toBeGreaterThan(1);
    expect(documents.filter(([, open]) => open).map(([group]) => group)).toEqual([
      expect.stringContaining('href="/documents/agents"'),
    ]);
  });

  it('splits scenarios by track, open by default', () => {
    const html = explorer('/');

    for (const title of ['현재 동작', '개발 흐름']) expect(html).toContain(title);
    const scenarios = [...html.matchAll(/<details( open="")?[^>]*>[\s\S]*?<\/details>/g)].filter(
      ([group]) => group.includes('href="/scenarios/'),
    );
    expect(scenarios.every(([, open]) => open)).toBe(true);
  });
});

describe('task page', () => {
  it('switches the dataset filter to a select form when there are many datasets', () => {
    const r = resultsRepository();
    for (let i = 1; i <= 7; i++) {
      r.copyRun('translation-golden', `tr-${i}`);
      r.edit(`tr-${i}/metadata.json`, (m) => {
        (m.dataset as Record<string, unknown>).name = `translation-set-${i}`;
      });
      r.edit(`tr-${i}/summary.json`, (s) => {
        (s.dataset as Record<string, unknown>).name = `translation-set-${i}`;
      });
    }
    const entries = r.repo.listRuns();
    const trend = trendOverview(entries);
    const rows = runRows(entries, trend);
    const html = renderToStaticMarkup(
      createElement(EvalsOverview, {
        rows,
        trend,
        filter: parseFilter(rows, 'translation', undefined),
        options: filterOptions(rows),
        task: 'translation',
      }),
    );

    expect(html).toMatch(/<form [^>]*action="\/evals\/tasks\/translation" method="get"/);
    expect(html).toContain('dataset 8개');
    expect(html).toContain('<option value="translation-set-7 v1">');
    // 과제 화면의 dataset 목록에 다른 과제의 dataset은 없다.
    expect(html).not.toContain('unit v1');
    expect(html).not.toContain('id="filter-dataset"');
  });

  it('shows only that task and keeps filters on the task page', () => {
    const r = resultsRepository();
    const entries = r.repo.listRuns();
    const trend = trendOverview(entries);
    const rows = runRows(entries, trend);
    const html = renderToStaticMarkup(
      createElement(EvalsOverview, {
        rows,
        trend,
        filter: parseFilter(rows, 'translation', undefined),
        options: filterOptions(rows),
        task: 'translation',
      }),
    );

    expect(html).toContain('href="/evals/runs/translation-golden"');
    expect(html).not.toContain('href="/evals/runs/replay-golden"');
    expect(html).toContain('확정된 원문을 번역하는지');
    expect(html).not.toContain('id="filter-task"');
    expect(html).toContain('href="/evals/tasks/translation?dataset=');
  });
});
