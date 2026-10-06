import { createElement } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { renderInDevHub } from '../../test-support/devhub-provider';

import Loading from './loading';

// 셸의 탐색기 서랍이 경로를 읽는다(layout.spec과 같은 방식).
vi.mock('next/navigation', async (actual) => ({
  ...(await actual<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/evals',
}));

describe('evals loading', () => {
  it('keeps the navigation and shows the wait only in the work area', () => {
    const html = renderInDevHub(createElement(Loading));

    // 평가 page가 셸을 그리므로 fallback이 셸 없이 그려지면 탐색기 · 상단 막대가 사라진다.
    expect(html).toContain('<header');
    expect(html).toContain('aria-labelledby="explorer-evals"');
    expect(html).toMatch(/<main[^>]*>.*평가 결과를 읽는 중…/s);
    expect(html).toContain('읽는 법');
  });
});
