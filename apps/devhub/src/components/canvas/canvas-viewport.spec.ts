import { createElement, Fragment } from 'react';

import { CanvasEdges, CanvasViewport, openModal } from '@berrypjh/devhub-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const canvas = () =>
  renderToStaticMarkup(
    createElement(CanvasViewport, {
      label: '예시 그림',
      content: { width: 400, height: 300 },
      legend: [
        { box: 'dashed', label: '코드가 없는 단계' },
        { line: '6 4', label: '되돌아가는 흐름' },
      ],
      summary: '요약',
      children: () => null,
    }),
  );

describe('CanvasViewport', () => {
  it('offers "크게 보기" and opens nothing until asked', () => {
    const html = canvas();
    expect(html).toMatch(/<button[^>]*aria-label="크게 보기"/);
    expect(html).not.toContain('<dialog');
  });

  it('folds the controls and legend behind "도움말" but keeps them as the description', () => {
    const html = canvas();
    const [, helpId] = html.match(/aria-expanded="false" aria-controls="([^"]+)"/) ?? [];
    expect(helpId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<div id="${helpId}" hidden=""`));
    expect(html).toMatch(
      new RegExp(`role="group" aria-label="예시 그림" aria-describedby="[^"]* ${helpId}"`),
    );
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('stroke-dasharray="3 2"');
    expect(html).toContain('되돌아가는 흐름');
    expect(html).toContain('<kbd');
  });

  it('floats the zoom controls as one labelled group', () => {
    const html = canvas();
    const group =
      html.match(
        /<div role="group" aria-label="보기 조절".*?<\/output>.*?(?=<div role="group" aria-label="예시 그림")/,
      )?.[0] ?? '';
    for (const name of ['축소', '확대', '화면에 맞추기', '크게 보기'])
      expect(group).toMatch(new RegExp(`aria-label="${name}"`));
    expect(group).toMatch(/>100<!-- -->%<\/output>|>100%<\/output>/);
  });
});

describe('openModal', () => {
  it('opens once even when React runs the effect twice (development Strict Mode)', () => {
    const calls: string[] = [];
    const dialog = {
      open: false,
      showModal() {
        if (this.open) throw new Error('already open');
        this.open = true;
        calls.push('showModal');
      },
    };
    openModal(dialog);
    openModal(dialog);
    expect(calls).toEqual(['showModal']);
    expect(dialog.open).toBe(true);
    openModal(null);
  });
});

describe('CanvasEdges', () => {
  it('gives each drawing its own arrow marker, so a second copy never shares an id', () => {
    const edges = [{ id: 'e', path: 'M 0 0 L 10 10' }];
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(CanvasEdges, { edges, width: 10, height: 10 }),
        createElement(CanvasEdges, { edges, width: 10, height: 10 }),
      ),
    );
    const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map(([, id]) => id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`marker-end="url(#${id})"`);
  });
});
