import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLegalLinks, isSignUpAllowed } from './legal';

afterEach(() => vi.unstubAllEnvs());

describe('getLegalLinks', () => {
  it('returns both documents when both are https URLs', () => {
    vi.stubEnv('EXPO_PUBLIC_TERMS_URL', 'https://example.com/terms');
    vi.stubEnv('EXPO_PUBLIC_PRIVACY_URL', 'https://example.com/privacy');

    expect(getLegalLinks()).toEqual({
      terms: 'https://example.com/terms',
      privacy: 'https://example.com/privacy',
    });
  });

  it.each([
    ['both empty', '', ''],
    ['privacy missing', 'https://example.com/terms', ''],
    ['not https', 'http://example.com/terms', 'https://example.com/privacy'],
  ])('returns null when %s', (_, terms, privacy) => {
    vi.stubEnv('EXPO_PUBLIC_TERMS_URL', terms);
    vi.stubEnv('EXPO_PUBLIC_PRIVACY_URL', privacy);

    expect(getLegalLinks()).toBeNull();
  });
});

describe('isSignUpAllowed', () => {
  it('blocks production without documents and allows development', () => {
    expect(isSignUpAllowed(null, false)).toBe(false);
    expect(isSignUpAllowed(null, true)).toBe(true);
    expect(isSignUpAllowed({ terms: 'https://a', privacy: 'https://b' }, false)).toBe(true);
  });
});
