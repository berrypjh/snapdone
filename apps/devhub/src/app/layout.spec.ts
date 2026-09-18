import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DevHubShell } from '../components/devhub-shell';

import RootLayout from './layout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

describe('skip links', () => {
  it('open the document body, once, outside every route', () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, createElement('p')));
    const body = html.slice(html.indexOf('<body>') + '<body>'.length);
    expect(body).toMatch(
      /^<a href="#devhub-main" class="ui-skip-link">본문으로 건너뛰기<\/a><a href="#devhub-inspector" class="ui-skip-link">상세 정보로 건너뛰기<\/a>/,
    );
  });

  it('are not part of the route shell, so Next never focuses them after a navigation', () => {
    const html = renderToStaticMarkup(
      createElement(DevHubShell, {
        selection: {},
        inspector: null,
        children: createElement('main'),
      }),
    );
    expect(html).not.toContain('ui-skip-link');
    expect(html).toMatch(/^<div class="[^"]*\bgrid\b/);
  });

  it('keeps every icon decorative and every view named by its words', () => {
    const html = renderToStaticMarkup(
      createElement(DevHubShell, {
        selection: {},
        inspector: null,
        children: createElement('main'),
      }),
    );
    // Icons drawn here (line icons). The shared search field hides its own icon on a wrapper.
    const svgs = (html.match(/<svg[^>]*>/g) ?? []).filter((svg) =>
      svg.includes('stroke="currentColor"'),
    );
    expect(svgs.length).toBeGreaterThan(0);
    expect(svgs.every((svg) => svg.includes('aria-hidden="true"'))).toBe(true);
    const nav = html.match(/<nav aria-label="보기"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const names = [...nav.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(([, inner]) =>
      inner.replace(/<[^>]+>/g, ''),
    );
    expect(names).toEqual(['개요', '시나리오', '아키텍처', '문서', '엔지니어링']);
  });
});
