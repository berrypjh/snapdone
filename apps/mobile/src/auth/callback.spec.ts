import { describe, expect, it } from 'vitest';

import { parseOAuthCallback } from './callback';

const REDIRECT = 'mobile://auth/callback';

describe('parseOAuthCallback', () => {
  it('reads a result code and the app state', () => {
    expect(parseOAuthCallback(`${REDIRECT}?code=abc-_1&state=s%2B1`, REDIRECT)).toEqual({
      type: 'code',
      code: 'abc-_1',
      state: 's+1',
    });
  });

  it('reads a server error and narrows unknown codes', () => {
    expect(parseOAuthCallback(`${REDIRECT}?error=cancelled&state=s`, REDIRECT)).toEqual({
      type: 'error',
      error: 'cancelled',
      state: 's',
    });
    expect(parseOAuthCallback(`${REDIRECT}?error=access_denied&state=s`, REDIRECT)).toMatchObject({
      error: 'provider_unavailable',
    });
  });

  it.each([
    ['another scheme', 'evil://auth/callback?code=c&state=s'],
    ['another host', 'mobile://evil/callback?code=c&state=s'],
    ['another path', 'mobile://auth/callback/extra?code=c&state=s'],
    ['a path prefix', 'mobile://auth/call?code=c&state=s'],
    ['exp:// in Expo Go', 'exp://192.168.0.10:8081/--/auth/callback?code=c&state=s'],
    ['no state', `${REDIRECT}?code=c`],
    ['empty state', `${REDIRECT}?code=c&state=`],
    ['no code or error', `${REDIRECT}?state=s`],
    ['both code and error', `${REDIRECT}?code=c&error=cancelled&state=s`],
    ['duplicated state', `${REDIRECT}?code=c&state=s&state=t`],
    ['a fragment', `${REDIRECT}?code=c&state=s#code=x`],
    ['a second query mark', `${REDIRECT}?code=c?x&state=s`],
    ['broken encoding', `${REDIRECT}?code=%E0%A4%A&state=s`],
  ])('rejects %s', (_, url) => {
    expect(parseOAuthCallback(url, REDIRECT)).toBeNull();
  });
});
