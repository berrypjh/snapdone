import { describe, expect, it } from 'vitest';

import {
  decodeWebToAppMessage,
  encodeWebToAppMessage,
  inAppUserAgentName,
  isInAppUserAgent,
} from './bridge';

describe('in-app User-Agent', () => {
  it('names the app with the contract version', () => {
    expect(inAppUserAgentName()).toBe('SnapdoneApp/1');
  });

  it('recognizes the token the app appends', () => {
    const userAgent = `Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ${inAppUserAgentName()}`;

    expect(isInAppUserAgent(userAgent)).toBe(true);
  });

  it('treats ordinary browsers and missing headers as the browser service', () => {
    expect(isInAppUserAgent('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false);
    expect(isInAppUserAgent('SnapdoneApp')).toBe(false);
    expect(isInAppUserAgent(null)).toBe(false);
    expect(isInAppUserAgent(undefined)).toBe(false);
  });
});

describe('web to app messages', () => {
  it('round-trips a ready message', () => {
    const raw = encodeWebToAppMessage({ type: 'ready', title: '기록' });

    expect(decodeWebToAppMessage(raw)).toEqual({ type: 'ready', title: '기록' });
  });

  it('ignores text that is not JSON', () => {
    expect(decodeWebToAppMessage('ready')).toBeNull();
  });

  it('ignores unknown types and malformed fields', () => {
    expect(decodeWebToAppMessage(JSON.stringify({ type: 'close' }))).toBeNull();
    expect(decodeWebToAppMessage(JSON.stringify({ type: 'ready', title: 3 }))).toBeNull();
    expect(decodeWebToAppMessage('null')).toBeNull();
  });
});
