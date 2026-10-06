import { createElement } from 'react';

import { useDevHubLink, useDevHubLocation, useDevHubNavigate } from '@berrypjh/devhub-ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DevHubRoot } from './devhub-root';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/architecture/web',
}));

function Probe() {
  const Link = useDevHubLink();
  const { pathname, hash } = useDevHubLocation();
  useDevHubNavigate()('/docs');
  return createElement(Link, { to: '/scenarios', 'aria-current': 'page' }, `${pathname}|${hash}`);
}

describe('DevHubRoot', () => {
  it('gives the shared shell the Next pathname, an empty server hash, next/link anchors and push', () => {
    push.mockClear();
    const html = renderToStaticMarkup(createElement(DevHubRoot, null, createElement(Probe)));
    expect(html).toBe('<a aria-current="page" href="/scenarios">/architecture/web|</a>');
    expect(push).toHaveBeenCalledWith('/docs');
  });
});
