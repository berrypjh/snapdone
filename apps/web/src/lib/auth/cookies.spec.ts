import { describe, expect, it } from 'vitest';

import { authCookies, decodePreauth, encodePreauth, secondsUntil } from './cookies';

const STATE = 'a'.repeat(43);
const VERIFIER = 'b'.repeat(43);

describe('authCookies', () => {
  it('uses __Host- names with Secure in production', () => {
    expect(authCookies(true)).toEqual({
      session: '__Host-snapdone-session',
      preauth: '__Host-snapdone-preauth',
      handoff: '__Host-snapdone-handoff',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
  });

  it('uses separate dev names without Secure for local HTTP', () => {
    expect(authCookies(false)).toEqual({
      session: 'snapdone-session-dev',
      preauth: 'snapdone-preauth-dev',
      handoff: 'snapdone-handoff-dev',
      options: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
    });
  });

  it('never sets a Domain', () => {
    expect(authCookies(true).options).not.toHaveProperty('domain');
  });
});

describe('secondsUntil', () => {
  it('floors to whole seconds before expiry', () => {
    const now = Date.parse('2026-09-18T00:00:00Z');

    expect(secondsUntil('2026-09-18T12:00:00.900Z', now)).toBe(43_200);
    expect(secondsUntil('2026-09-17T23:59:59Z', now)).toBeLessThan(0);
  });
});

describe('preauth', () => {
  it('round-trips state, verifier and return path', () => {
    const preauth = { state: STATE, verifier: VERIFIER, returnTo: '/history' };

    expect(decodePreauth(encodePreauth(preauth))).toEqual(preauth);
  });

  it.each([
    undefined,
    '',
    `${STATE}.${VERIFIER}`,
    `${STATE}.${VERIFIER}.%2F.extra`,
    `short.${VERIFIER}.%2F`,
    `${STATE}.bad+verifier${'x'.repeat(40)}.%2F`,
    `${STATE}.${VERIFIER}.%E0%A4%A`,
  ])('rejects %j', (value) => {
    expect(decodePreauth(value)).toBeNull();
  });
});
