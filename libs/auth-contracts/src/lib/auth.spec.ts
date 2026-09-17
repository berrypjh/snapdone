import { describe, expect, it } from 'vitest';

import { parseSession, toAuthErrorCode } from './auth';

describe('toAuthErrorCode', () => {
  it('keeps known codes and hides anything else', () => {
    expect(toAuthErrorCode('invalid_callback')).toBe('invalid_callback');
    expect(toAuthErrorCode('rate_limited')).toBe('provider_unavailable');
    expect(toAuthErrorCode('AuthApiError: User already registered')).toBe('provider_unavailable');
  });

  it('does not accept a platform-only code from the server', () => {
    expect(toAuthErrorCode('storage_unavailable')).toBe('provider_unavailable');
  });
});

describe('parseSession', () => {
  const session = {
    user: { id: 'user-1' },
    onboardingStep: 'intro',
    expiresAt: '2026-10-01T00:00:00Z',
  };

  it('keeps only the three session fields', () => {
    expect(
      parseSession({ ...session, credential: 'secret', user: { id: 'user-1', email: 'x' } }),
    ).toEqual(session);
  });

  it.each([
    null,
    'session',
    { ...session, user: null },
    { ...session, user: { id: 1 } },
    { ...session, onboardingStep: 'unknown' },
    { ...session, expiresAt: 0 },
  ])('rejects %j', (value) => {
    expect(parseSession(value)).toBeNull();
  });
});
