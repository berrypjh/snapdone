import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, stripQuery } from './scrub';

describe('stripQuery', () => {
  it('drops query and hash', () => {
    expect(stripQuery('https://web.test/auth/callback?code=c1&state=s1#x')).toBe(
      'https://web.test/auth/callback',
    );
    expect(stripQuery('/history')).toBe('/history');
  });
});

describe('scrubEvent', () => {
  it('keeps only method and query-free url', () => {
    const event = {
      type: undefined,
      request: {
        method: 'GET',
        url: 'https://web.test/auth/handoff?code=secret-code',
        headers: { authorization: 'Bearer secret-token' },
        cookies: { session: 'secret-cookie' },
        query_string: 'code=secret-code',
        data: 'body',
      },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toEqual({ method: 'GET', url: 'https://web.test/auth/handoff' });
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret/);
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'secret' })).toBeNull();
  });

  it('strips query from navigation and fetch urls', () => {
    expect(
      scrubBreadcrumb({ category: 'navigation', data: { from: '/a?code=1', to: '/b?state=2' } }),
    ).toEqual({
      category: 'navigation',
      data: { from: '/a', to: '/b' },
    });
    expect(
      scrubBreadcrumb({ category: 'fetch', data: { url: '/api?code=1', status_code: 200 } }),
    ).toEqual({
      category: 'fetch',
      data: { url: '/api', status_code: 200 },
    });
  });
});
