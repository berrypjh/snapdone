import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWebBaseUrl,
  handoffExchangeUrl,
  handoffStartUrl,
  isWebPage,
  parseHttpUrl,
  webUrl,
  webViewNavigation,
} from './web';

const BASE_URL = 'http://192.168.0.10:3000';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getWebBaseUrl', () => {
  it('reads EXPO_PUBLIC_WEB_BASE_URL without trailing slashes', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', `${BASE_URL}//`);

    expect(getWebBaseUrl()).toBe(BASE_URL);
  });

  it('tells the developer to copy .env and restart Metro', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', '');

    expect(() => getWebBaseUrl()).toThrow(/--clear/);
  });
});

describe('with a web base URL', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', BASE_URL);
  });

  it('joins a path with or without a leading slash', () => {
    expect(webUrl('/history')).toBe(`${BASE_URL}/history`);
    expect(webUrl('history')).toBe(`${BASE_URL}/history`);
  });

  it('builds handoff URLs with encoded values', () => {
    expect(handoffStartUrl('/history')).toBe(`${BASE_URL}/auth/handoff/start?next=%2Fhistory`);
    expect(handoffExchangeUrl('a+b/c', '/history')).toBe(
      `${BASE_URL}/auth/handoff?code=a%2Bb%2Fc&next=%2Fhistory`,
    );
  });

  describe('parseHttpUrl', () => {
    it('splits origin and path', () => {
      expect(parseHttpUrl('HTTPS://Example.com:8443/a/b?x=1#y')).toEqual({
        origin: 'https://example.com:8443',
        path: '/a/b',
      });
      expect(parseHttpUrl('http://192.168.0.10:3000?x')).toEqual({
        origin: 'http://192.168.0.10:3000',
        path: '/',
      });
    });

    it.each([
      'http://user@192.168.0.10:3000/history',
      'http://192.168.0.10:3000@evil.example/history',
      'http://192.168.0.10:3000\\@evil.example/',
      'http:/192.168.0.10:3000/history',
      'http://192.168.0.10:3000/his tory',
      'http://192.168.0.10:3000/history\n',
      'http://evil.example%2F@x/',
      '//192.168.0.10:3000/history',
      'ftp://192.168.0.10:3000/',
    ])('rejects %j', (url) => {
      expect(parseHttpUrl(url)).toBeNull();
    });
  });

  describe('webViewNavigation', () => {
    it.each([
      BASE_URL,
      `${BASE_URL}/history?tab=all#top`,
      `${BASE_URL}/login?next=%2Fhistory`,
      `${BASE_URL}/auth/handoff?code=c&next=%2Fhistory`,
      'about:blank',
    ])('loads %s inside the WebView', (url) => {
      expect(webViewNavigation(url)).toBe('load');
    });

    it.each(['https://example.com/', 'https://accounts.google.com/o/oauth2/v2/auth'])(
      'sends %s to the system browser',
      (url) => {
        expect(webViewNavigation(url)).toBe('external');
      },
    );

    it.each([
      `${BASE_URL}/auth/callback?code=c&state=s`,
      `${BASE_URL}/settings`,
      `${BASE_URL}/history/`,
      'http://192.168.0.10:30001/history',
      'http://192.168.0.10:3000.evil.example/history',
      'http://example.com/',
      'about:srcdoc',

      'javascript:alert(1)',

      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'intent://scan/#Intent;scheme=zxing;end',
      'tel:010-1234-5678',
      'http://user@192.168.0.10:3000/history',
    ])('blocks %s', (url) => {
      expect(webViewNavigation(url)).toBe('block');
    });
  });

  it('matches the page that sent a message by origin and path', () => {
    expect(isWebPage(`${BASE_URL}/auth/handoff/ready?next=%2F`, '/auth/handoff/ready')).toBe(true);
    expect(isWebPage(`${BASE_URL}/login`, '/auth/handoff/ready')).toBe(false);
    expect(isWebPage('https://evil.example/auth/handoff/ready', '/auth/handoff/ready')).toBe(false);
    expect(isWebPage(`${BASE_URL}/login`)).toBe(true);
  });
});
