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

describe('auth messages', () => {
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

  it('round-trips auth-required and handoff-ready', () => {
    const ready = { type: 'handoff-ready', challenge, next: '/history' } as const;

    expect(decodeWebToAppMessage(encodeWebToAppMessage({ type: 'auth-required' }))).toEqual({
      type: 'auth-required',
    });
    expect(decodeWebToAppMessage(encodeWebToAppMessage(ready))).toEqual(ready);
  });

  it('keeps accepting a v1 ready message with extra fields', () => {
    expect(decodeWebToAppMessage(JSON.stringify({ type: 'ready', title: '기록', v: 2 }))).toEqual({
      type: 'ready',
      title: '기록',
    });
  });

  it.each([
    { type: 'auth-required', next: '/history' },
    { type: 'handoff-ready', challenge, next: '/history', credential: 'x' },
    { type: 'handoff-ready', challenge: 'short', next: '/history' },
    { type: 'handoff-ready', challenge: `${challenge}=`, next: '/history' },
    { type: 'handoff-ready', challenge, next: 'https://evil.example/' },
    { type: 'handoff-ready', challenge, next: '//evil.example' },
    { type: 'handoff-ready', challenge },
    [{ type: 'auth-required' }],
  ])('rejects malformed auth message %j', (message) => {
    expect(decodeWebToAppMessage(JSON.stringify(message))).toBeNull();
  });
});
