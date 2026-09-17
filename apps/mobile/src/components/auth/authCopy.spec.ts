import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_CODES } from '../../auth/model';

import { authErrorMessage, continueWith, PROVIDER_ORDER, unavailableMessage } from './authCopy';

describe('auth copy', () => {
  it('keeps the confirmed button order and labels', () => {
    expect(PROVIDER_ORDER.map(continueWith)).toEqual([
      'Google로 계속하기',
      'Apple로 계속하기',
      '네이버로 계속하기',
      '카카오로 계속하기',
    ]);
  });

  it('has a polite message for every error except cancel', () => {
    for (const code of AUTH_ERROR_CODES) {
      const message = authErrorMessage(code);
      if (code === 'cancelled') expect(message).toBeNull();
      else expect(message).toMatch(/니다\.$|주세요\.$/);
    }
  });

  it('names the unavailable providers in order', () => {
    expect(unavailableMessage([])).toBeNull();
    expect(unavailableMessage(['naver', 'kakao'])).toBe(
      '지금은 네이버 · 카카오 로그인을 사용할 수 없습니다.',
    );
  });
});
