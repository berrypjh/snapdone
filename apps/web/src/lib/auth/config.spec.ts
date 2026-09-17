import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLegalLinks, getWebOrigin, isAllowedOrigin, isSignUpAllowed } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('getWebOrigin', () => {
  it('accepts a bare origin', () => {
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');

    expect(getWebOrigin()).toBe('http://localhost:3000');
  });

  it.each(['', 'localhost:3000', 'http://localhost:3000/', 'http://localhost:3000/app', 'ftp://x'])(
    'rejects %j',
    (value) => {
      vi.stubEnv('WEB_ORIGIN', value);

      expect(() => getWebOrigin()).toThrow(/WEB_ORIGIN/);
    },
  );

  it('requires https in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_ORIGIN', 'http://snapdone.example');

    expect(() => getWebOrigin()).toThrow(/WEB_ORIGIN/);
  });
});

describe('isAllowedOrigin', () => {
  it('matches the configured origin exactly', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://snapdone.example');

    expect(isAllowedOrigin('https://snapdone.example')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('https://snapdone.example.evil.example')).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });
});

describe('legal links', () => {
  it('needs both documents over https', () => {
    vi.stubEnv('TERMS_URL', 'https://snapdone.example/terms');
    vi.stubEnv('PRIVACY_URL', 'http://snapdone.example/privacy');

    expect(getLegalLinks()).toBeNull();

    vi.stubEnv('PRIVACY_URL', 'https://snapdone.example/privacy');

    expect(getLegalLinks()).toEqual({
      terms: 'https://snapdone.example/terms',
      privacy: 'https://snapdone.example/privacy',
    });
  });

  it('blocks sign-up in production without the documents', () => {
    expect(isSignUpAllowed(null, true)).toBe(false);
    expect(isSignUpAllowed(null, false)).toBe(true);
  });
});
