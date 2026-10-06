import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DevHubShell } from '../components/shell/devhub-shell';
import { renderInDevHub } from '../test-support/devhub-provider';

import RootLayout from './layout';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

describe('skip links', () => {
  it('open the document body, once, outside every route', () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, createElement('p')));
    const body = html.slice(html.indexOf('<body>') + '<body>'.length);
    // 앞에는 이동 포커스 자리만 있어서, 이동한 뒤 처음 누르는 Tab이 건너뛰기 링크로 간다.
    expect(body).toMatch(
      /^<div tabindex="-1" class="outline-none"><\/div><a href="#devhub-main" class="ui-skip-link">본문으로 건너뛰기<\/a><a href="#devhub-inspector" class="ui-skip-link">상세 정보로 건너뛰기<\/a>/,
    );
  });

  it('are not part of the route shell, so Next never focuses them after a navigation', () => {
    const html = renderInDevHub(
      createElement(DevHubShell, {
        inspector: null,
        children: createElement('main'),
      }),
    );
    expect(html).not.toContain('ui-skip-link');
    expect(html).toMatch(/^<div class="[^"]*\bgrid\b/);
  });

  it('keeps every icon decorative and every view named by its words', () => {
    const html = renderInDevHub(
      createElement(DevHubShell, {
        inspector: null,
        children: createElement('main'),
      }),
    );
    // 여기서 그리는 선 아이콘들. 공용 검색 입력은 자기 아이콘을 wrapper에서 숨긴다.
    const svgs = (html.match(/<svg[^>]*>/g) ?? []).filter((svg) =>
      svg.includes('stroke="currentColor"'),
    );
    expect(svgs.length).toBeGreaterThan(0);
    expect(svgs.every((svg) => svg.includes('aria-hidden="true"'))).toBe(true);
    // 화면 사이 이동은 탐색기가 맡는다. 상단 바에는 보기 nav가 없다.
    expect(html).not.toContain('aria-label="보기"');
    const nav = html.match(/<nav aria-label="저장소 항목"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const names = [...nav.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(([, inner]) =>
      inner.replace(/<[^>]+>/g, ''),
    );
    expect(names).toEqual(expect.arrayContaining(['개요', '아키텍처', '평가']));
  });
});
