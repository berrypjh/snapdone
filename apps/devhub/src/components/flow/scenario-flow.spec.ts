import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { catalog } from '../../data';
import { flowModel } from '../../lib/catalog/flow';

import { ScenarioFlow } from './scenario-flow';

const nav = vi.hoisted(() => ({ segments: [] as string[] }));
vi.mock('next/navigation', () => ({ useSelectedLayoutSegments: () => nav.segments }));

const scenario = catalog.scenarios[0];
const model = flowModel(scenario);
const render = () =>
  renderToStaticMarkup(createElement(ScenarioFlow, { model, title: scenario.title }));

describe('ScenarioFlow', () => {
  it('summarises the drawing in text and names the canvas', () => {
    nav.segments = [];
    const html = render();
    expect(html).toContain(
      `단계 ${model.nodes.length}개 · 연결 ${model.edges.length}개 · 선택: 없음`,
    );
    expect(html).toContain(`aria-label="${scenario.title} 흐름 그림"`);
    expect(html).not.toContain('href="#devhub-inspector"');
  });

  it('marks the selected step and offers a jump to its details', () => {
    const node = model.nodes[1];
    nav.segments = ['steps', node.id];
    const html = render();
    nav.segments = [];
    expect(html).toContain(`선택: ${node.order}. ${node.intent}`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('· 선택됨');
    expect(html).toContain('href="#devhub-inspector"');
  });

  it('labels every zoom control', () => {
    const html = render();
    for (const name of ['축소', '확대', '화면에 맞추기', '크게 보기'])
      expect(html).toMatch(new RegExp(`<button[^>]*aria-label="${name}"`));
    expect(html).toContain('<output');
  });
});
