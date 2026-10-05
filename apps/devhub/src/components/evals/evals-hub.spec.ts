import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { runRows, trendOverview } from '@/lib/evaluations/overview';
import { readVariantCatalog } from '@/lib/evaluations/variant-catalog';
import type { ProviderModelList } from '@/lib/evaluations/variant-command';

import { removeResults, resultsRepository } from '../../test-support/evaluation-results';
import { ROOT } from '../../test-support/repository-files';

import { EvalsHub, TARGETS } from './evals-hub';

afterEach(removeResults);

const noKeys: ProviderModelList[] = [
  { provider: 'anthropic', state: 'no-key', models: [] },
  { provider: 'openai', state: 'no-key', models: [] },
];

const hub = (withGoldens = true, providers: ProviderModelList[] = noKeys) => {
  const r = resultsRepository(withGoldens);
  const entries = r.repo.listRuns();
  const rows = runRows(entries, trendOverview(entries));
  return renderToStaticMarkup(
    createElement(EvalsHub, {
      rows,
      comparisons: r.repo.listComparisons(),
      catalog: readVariantCatalog(ROOT),
      providers,
    }),
  );
};

describe('/evals hub', () => {
  it('summarizes each task in one line and links to its page', () => {
    const html = hub();

    for (const task of ['image-classification', 'text-extraction', 'translation']) {
      expect(html).toContain(`href="/evals/tasks/${task}"`);
    }
    expect(html).toContain('사진의 종류 · 할 일 · 읽을 값을 맞히는지');
    expect(html).toContain('href="/evals/runs/replay-golden"');
    // run 목록 · 필터는 과제 화면에 있다.
    expect(html).not.toContain('aria-label="필터"');
  });

  it('explains every kind of comparison and the Go commands that make official runs', () => {
    const html = hub();

    for (const name of [
      '여러 모델 · 공급자',
      'OpenAI 호환 서비스(Grok 등)',
      '지시문(프롬프트) 변경',
      '규칙 기준선',
    ]) {
      expect(html).toContain(name);
    }
    expect(html).toContain('한 run으로 — 권장');
    expect(html).toContain('pnpm eval run --dataset');
    expect(html).toContain('pnpm eval compare --baseline');
    expect(html).toContain('tools/evals/gates');
    expect(html).toContain('pnpm eval plan --dataset');
    expect(html).toContain('실제 모델을 호출한 run 없음');
  });

  it('builds official run commands from repository files, listed models, and typed model names', () => {
    const html = hub();

    expect(html).toContain('정식 run 명령 만들기');
    // 고를 것: 기준선(파일)과 실험 설정(파일). 모델은 공급자 목록에서 고르거나 직접 적는다.
    expect(html).toContain('--variant baseline-always-other');
    expect(html).toMatch(/늘 other \/ none<\/span>.*호출 없음/s);
    expect(html).toContain('aria-label="모델 직접 적기"');
    expect(html).toContain('지시문 변경');
    // dataset은 과제별 묶음이고, live adapter가 없는 과제는 고를 수 없다.
    expect(html).toMatch(
      /<optgroup label="사진 분류"><option value="sample-classification" selected="">sample-classification<\/option>/,
    );
    expect(html).toMatch(
      /<optgroup label="번역"><option value="sample-translation" disabled="">sample-translation — 기록 재채점만<\/option>/,
    );
    expect(html).toContain('dev · 1건');
    expect(html).toMatch(/<option value="validation" disabled="">validation · 0건<\/option>/);
    // 아무것도 고르지 않은 처음: 명령 없음, run id는 비어 있다.
    expect(html).toContain('고른 것 0개');
    expect(html).toContain('왼쪽에서 하나 이상 고르면 명령이 만들어짐');
    expect(html).toContain('+ 기준선');
    expect(html).toContain('placeholder="비우면 run-시각"');
    expect(html).not.toContain('export ANTHROPIC_API_KEY');
  });

  it('shows why the latest models are missing when DevHub has no key', () => {
    const html = hub();

    expect(html).toContain('최신 목록 Anthropic key 없음 · OpenAI key 없음');
    expect(html).toContain(
      'title="ANTHROPIC_API_KEY 없이 DevHub를 띄움 · OPENAI_API_KEY 없이 DevHub를 띄움"',
    );
    expect(html).toContain('없음 — 불러온 모델이 없음. 아래에 직접 적는다');
    expect(html).not.toMatch(/title="[^"]* · --variant (anthropic|openai):/);
  });

  it('lists models loaded from a provider, newest first, as provider:model choices', () => {
    const html = hub(true, [
      {
        provider: 'anthropic',
        state: 'ok',
        models: [{ id: 'claude-new', name: 'Claude New', created: '2026-09-01' }],
      },
      { provider: 'openai', state: 'failed', models: [], reason: 'HTTP 401' },
    ]);

    expect(html).toContain('최신 목록 Anthropic 1개 · OpenAI 실패(HTTP 401)');
    expect(html).toContain('title="claude-new · --variant anthropic:claude-new"');
    expect(html).toMatch(/Claude New<\/span>.*Anthropic · 출시 2026-09-01/s);
  });

  it('narrows models by company only when two companies are listed', () => {
    const html = hub(true, [
      {
        provider: 'anthropic',
        state: 'ok',
        models: [{ id: 'claude-new', name: 'Claude New', created: null }],
      },
      {
        provider: 'openai',
        state: 'ok',
        models: [{ id: 'gpt-new', name: 'gpt-new', created: null }],
      },
    ]);

    expect(html).toContain('aria-label="회사로 좁히기"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*전체<\/button>/s);
  });

  it('points exploration at the notebook lab', () => {
    const html = hub();

    expect(html).toContain('tools/evals/lab');
  });

  it('still explains everything when there is no run yet', () => {
    const html = hub(false);

    expect(html).toContain('과제 3개');
    expect(html).toContain('비교할 수 있는 것');
    expect(html).toContain('정식 run 명령 만들기');
  });

  it('does not repeat what the right-hand guide already explains', () => {
    // 칩의 title(마우스를 올렸을 때의 설명)은 어느 화면에서나 같으므로 보이는 글자만 본다.
    const html = hub().replace(/ title="[^"]*"/g, '');

    expect(html).not.toContain('누가 답했든 지표는 나옴');
    expect(html).not.toContain('모델 성능이 아님');
    expect(html).not.toContain('모델이 넘어야 할 최저선');
  });

  it('keeps tasks, the builder and commands open, and folds reference parts', () => {
    const html = hub();
    const at = (text: string) => html.indexOf(text);

    expect(at('과제 3개')).toBeLessThan(at('정식 run 명령 만들기'));
    expect(at('정식 run 명령 만들기')).toBeLessThan(at('정식 run을 만드는 명령'));
    expect(at('정식 run을 만드는 명령')).toBeLessThan(at('비교할 수 있는 것 8가지'));
    // 참고는 접힌 details — 제목에 개수가 있다.
    expect(html).toMatch(
      /<details class="group[^"]*"><summary[^>]*><h2[^>]*>.*비교할 수 있는 것 8가지/,
    );
    expect(html).toContain('저장된 짝 비교 1개');
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('짝 비교 · gate 명령 복사');
  });

  it('points only at example files that exist', () => {
    for (const target of TARGETS.filter((t) => !t.example.startsWith('--'))) {
      expect(existsSync(join(ROOT, 'tools/evals', target.example)), target.example).toBe(true);
    }
  });
});
