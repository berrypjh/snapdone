import { describe, expect, it } from 'vitest';

import { parseLoginResponse, parseProviders, parseSession, toAuthErrorCode } from './auth';

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

  it.each(['intro', 'purpose', 'first-image', 'complete'])('accepts the %s step', (step) => {
    expect(parseSession({ ...session, onboardingStep: step })?.onboardingStep).toBe(step);
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

describe('parseLoginResponse', () => {
  const session = {
    user: { id: 'user-1' },
    onboardingStep: 'intro',
    expiresAt: '2026-10-01T00:00:00Z',
  };

  it('keeps the session and credential only', () => {
    expect(parseLoginResponse({ session, credential: 'c', extra: 1 })).toEqual({
      session,
      credential: 'c',
    });
  });

  it.each([null, { session }, { session, credential: '' }, { session: null, credential: 'c' }])(
    'rejects %j',
    (value) => {
      expect(parseLoginResponse(value)).toBeNull();
    },
  );
});

describe('parseProviders', () => {
  it('keeps only providers this client knows', () => {
    expect(parseProviders({ providers: ['apple', 'google'] })).toEqual(['google']);
  });

  it('reads a malformed body as no providers', () => {
    expect(parseProviders({ providers: 'google' })).toEqual([]);
    expect(parseProviders(null)).toEqual([]);
  });
});
