import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { catalog } from '../../data';

import { ScenarioOutline } from './scenario-outline';

const nav = vi.hoisted(() => ({ segments: [] as string[] }));
vi.mock('next/navigation', () => ({ useSelectedLayoutSegments: () => nav.segments }));

const render = (id: string, segments: string[] = []) => {
  nav.segments = segments;
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

  it('summarises each step in one line and leaves the evidence to the inspector', () => {
    const { scenario, html } = render('webview-auth-handoff');
    const step = scenario.steps.find((s) => s.apis.length > 0 && s.tests.length > 0);
    if (!step) throw new Error('fixture step missing');
    const runtime = catalog.runtimes.find((r) => r.id === step.runtime)?.name;
    expect(html).toContain(
      `${runtime} · 담당 ${step.owner} · API ${step.apis.length}` +
        `${step.contracts.length ? ` · 계약 ${step.contracts.length}` : ''}` +
        ` · 테스트 ${step.tests.length}`,
    );
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('href="/source?path=');
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
          expect({ step: `${id}/${index + 1}`, shown: article.includes(' · 다음 ') }).toEqual({
            step: `${id}/${index + 1}`,
            shown,
          });
        });
    }
  });

  it('marks the selected step in words, not only by color', () => {
    const { html } = render('webview-auth-handoff', ['steps', 'exchange']);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /steps\/exchange" aria-current="page"|aria-current="page"[^>]*steps\/exchange"/,
    );
    expect(html.match(/ · 선택됨/g)).toHaveLength(1);
  });
});
