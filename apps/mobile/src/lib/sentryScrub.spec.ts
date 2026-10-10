import type { ErrorEvent } from '@sentry/react-native';
import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, stripQuery } from './sentryScrub';

describe('stripQuery', () => {
  it('drops query and hash', () => {
    expect(stripQuery('mobile://auth/callback?code=c1&state=s1')).toBe('mobile://auth/callback');
    expect(stripQuery('https://web.test/history#top')).toBe('https://web.test/history');
  });
});

describe('scrubEvent', () => {
  it('keeps only method and query-free url', () => {
    const event = {
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.test/v1/auth/exchange?code=secret-code',
        headers: { authorization: 'Bearer secret-token' },
        data: 'secret-body',
      },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toEqual({ method: 'POST', url: 'https://api.test/v1/auth/exchange' });
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret/);
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console and touch breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'secret' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'touch', message: 'secret' })).toBeNull();
  });

  it('strips query from navigation and http urls', () => {
    expect(
      scrubBreadcrumb({ category: 'xhr', data: { url: '/v1/x?code=1', status_code: 500 } }),
    ).toEqual({
      category: 'xhr',
      data: { url: '/v1/x', status_code: 500 },
    });
  });
});
