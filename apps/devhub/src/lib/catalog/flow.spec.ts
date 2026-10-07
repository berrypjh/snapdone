import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';

import { flowModel, NODE, shortPath } from './flow';
import { inspectStep } from './inspection';

const scenario = (id: string) => {
  const found = catalog.scenarios.find((s) => s.id === id);
  if (!found) throw new Error(`no scenario ${id}`);
  return found;
};

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + NODE.width &&
  b.x < a.x + NODE.width &&
  a.y < b.y + NODE.height &&
  b.y < a.y + NODE.height;

describe('flowModel', () => {
  it('draws the mobile job result WebView flow in its two runtimes, left to right', () => {
    const model = flowModel(scenario('mobile-history-webview'));
    expect(model.lanes.map((lane) => lane.id)).toEqual(['mobile-app', 'mobile-webview']);
    expect(model.nodes.map((node) => node.id)).toEqual([
      'tap-recent',
      'open-webview',
      'render',
      'title',
    ]);
    const xs = model.nodes.map((node) => node.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(model.edges.map((edge) => edge.id)).toEqual([
      'tap-recent->open-webview',
      'open-webview->render',
      'render->title',
    ]);
  });

  it('spans the four runtimes of the WebView handoff', () => {
    const lanes = flowModel(scenario('webview-auth-handoff')).lanes.map((lane) => lane.id);
    expect(lanes).toEqual(['mobile-app', 'mobile-webview', 'next-server', 'go-api']);
  });

  it.each(catalog.scenarios.map((s) => [s.id, s] as const))(
    'lays out %s with one node per step, no overlaps, inside the canvas',
    (_id, s) => {
      const model = flowModel(s);
      expect(model.nodes).toHaveLength(s.steps.length);
      expect(model.lanes.map((lane) => lane.id).sort()).toEqual(
        [...new Set(s.steps.map((step) => step.runtime))].sort(),
      );
      for (const [i, a] of model.nodes.entries()) {
        expect(a.x + NODE.width).toBeLessThanOrEqual(model.width);
        expect(a.y + NODE.height).toBeLessThanOrEqual(model.height);
        for (const b of model.nodes.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
      expect(model.edges).toHaveLength(s.steps.flatMap((step) => step.next).length);
    },
  );

  it('marks edges that return to an earlier step as loops', () => {
    const model = flowModel(scenario('app-entry-session-restore'));
    const loop = model.edges.find((edge) => edge.id === 'restore-failed->read-credential');
    expect(loop?.back).toBe(true);
    expect(
      model.edges
        .filter((edge) => !edge.back)
        .every((edge) => {
          const from = model.nodes.find((n) => n.id === edge.from);
          const to = model.nodes.find((n) => n.id === edge.to);
          return !!from && !!to && to.x > from.x;
        }),
    ).toBe(true);
  });
});

describe('shortPath', () => {
  it('keeps the last two segments of deep paths', () => {
    expect(shortPath('apps/web/src/lib/auth/handoff.ts')).toBe('…/auth/handoff.ts');
    expect(shortPath('AGENTS.md')).toBe('AGENTS.md');
  });
});

describe('inspectStep', () => {
  it('shows the step source, tests, and a reason for every empty section', () => {
    for (const s of catalog.scenarios) {
      for (const step of s.steps) {
        const inspection = inspectStep(s, step);
        expect(inspection.title).toBe(step.intent);
        expect(inspection.source).toBe(step.source);
        expect(inspection.tests.map((test) => test.id)).toEqual([...new Set(step.tests)]);
        expect(
          inspection.sourceEmpty && inspection.docsEmpty && inspection.testsEmpty,
        ).toBeTruthy();
      }
    }
  });
});
