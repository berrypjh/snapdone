import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { sourceHref } from '../../lib/source-usage';

import { ScenarioOutline } from './scenario-outline';

const escape = (text: string) => text.replaceAll('&', '&amp;');
const render = (id: string) => {
  const scenario = catalog.scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error(`no scenario ${id}`);
  return { scenario, html: renderToStaticMarkup(createElement(ScenarioOutline, { scenario })) };
};

describe('ScenarioOutline', () => {
  it('lists every step as a titled article with its step link', () => {
    for (const { id } of catalog.scenarios) {
      const { scenario, html } = render(id);
      expect(html.match(/<article /g)).toHaveLength(scenario.steps.length);
      for (const step of scenario.steps) {
        expect(html).toContain(`href="/scenarios/${scenario.id}/steps/${step.id}"`);
      }
    }
  });

  it('carries runtime, source, API, and tests for each step as text', () => {
    const { scenario, html } = render('webview-auth-handoff');
    const step = scenario.steps.find((s) => s.apis.length > 0 && s.tests.length > 0);
    expect(step).toBeDefined();
    if (!step) return;
    const runtime = catalog.runtimes.find((r) => r.id === step.runtime);
    expect(html).toContain(escape(runtime?.name ?? ''));
    for (const source of step.source) expect(html).toContain(escape(sourceHref(source.path)));
    for (const id of step.apis) {
      const api = catalog.apis.find((a) => a.id === id);
      expect(html).toContain(`${api?.method} ${api?.path}`);
    }
    for (const term of ['실행 위치', '담당', '소스', 'API', '테스트']) {
      expect(html).toContain(`${term}</dt>`);
    }
  });

  it('links each source and test file once per step', () => {
    for (const { id } of catalog.scenarios) {
      const { scenario, html } = render(id);
      const files = scenario.steps.reduce(
        (n, step) =>
          n +
          new Set(step.source.map((ref) => ref.path)).size +
          new Set(
            step.tests.flatMap((testId) =>
              catalog.tests.filter((test) => test.id === testId).map((test) => test.source.path),
            ),
          ).size,
        0,
      );
      expect({ id, links: html.match(/href="\/source\?path=/g)?.length ?? 0 }).toEqual({
        id,
        links: files,
      });
    }
  });

  it('says 없음 for missing source and tests, and leaves out empty API, contracts, and next', () => {
    const { scenario, html } = render('finish-task-from-image');
    const articles = html.split('<article').slice(1);
    expect(articles).toHaveLength(scenario.steps.length);
    for (const article of articles) {
      expect(article.match(/없음/g)).toHaveLength(2);
      expect(article).not.toContain('API</dt>');
      expect(article).not.toContain('계약</dt>');
    }
    const last = articles[articles.length - 1];
    expect(last).not.toContain('다음</dt>');
  });

  it('names the next step only when it is not simply the one below', () => {
    for (const { id } of catalog.scenarios) {
      const { scenario, html } = render(id);
      html
        .split('<article')
        .slice(1)
        .forEach((article, index) => {
          const { next } = scenario.steps[index];
          const following = scenario.steps[index + 1]?.id;
          const shown = !(next.length === 0 || (next.length === 1 && next[0] === following));
          expect({ step: `${id}/${index + 1}`, shown: article.includes('다음</dt>') }).toEqual({
            step: `${id}/${index + 1}`,
            shown,
          });
        });
    }
  });
});
