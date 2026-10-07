import { describe, expect, it } from 'vitest';

import { safeReturnPath } from './redirect';

describe('safeReturnPath', () => {
  it.each([
    '/',
    '/history',
    '/onboarding',
    '/process',
    '/settings/processing',
    '/history/4f1c2a9e-0000-4000-8000-000000000000',
  ])('keeps the allowed page %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    '',
    'history',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/%2F%2Fevil.example',
    '/%252Fhistory',
    '/%68istory',
    '/history\n',
    '/history\u0000',
    'https://evil.example/history',
    'data:text/html,hi',
    '/history?x=1',
    '/settings',
    '/settings/processing/',
    '/settings/processing?x=1',
    '/settings/Processing',
    '/settings/notifications',
    '//evil.example/settings/processing',
    '/history/job-1',
    '/history/4F1C2A9E-0000-4000-8000-000000000000',
    '/history/4f1c2a9e-0000-4000-8000-000000000000/',
    '/history/4f1c2a9e-0000-4000-8000-000000000000?x=1',
    '/history/4f1c2a9e-0000-4000-8000-000000000000/receipt',
    '/history/%34f1c2a9e-0000-4000-8000-000000000000',
  ])('falls back to home for %j', (value) => {
    expect(safeReturnPath(value)).toBe('/');
  });
});
