import { afterEach, describe, expect, it, vi } from 'vitest';

import { getWebBaseUrl, webUrl, webViewNavigation } from './web';

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

describe('webUrl', () => {
  it('joins a path with or without a leading slash', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', BASE_URL);

    expect(webUrl('/history')).toBe(`${BASE_URL}/history`);
    expect(webUrl('history')).toBe(`${BASE_URL}/history`);
  });
});

describe('webViewNavigation', () => {
  it('keeps pages of the web app inside the WebView', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', BASE_URL);

    expect(webViewNavigation(BASE_URL)).toBe('load');
    expect(webViewNavigation(`${BASE_URL}/history?tab=all#top`)).toBe('load');
    expect(webViewNavigation('about:blank')).toBe('load');
  });

  it('sends other sites and schemes to the system', () => {
    vi.stubEnv('EXPO_PUBLIC_WEB_BASE_URL', BASE_URL);

    expect(webViewNavigation('https://example.com/')).toBe('external');
    expect(webViewNavigation('http://192.168.0.10:30001/history')).toBe('external');
    expect(webViewNavigation('tel:010-1234-5678')).toBe('external');
  });
});
