import { describe, expect, it } from 'vitest';

import { AUTH_ERROR_CODES } from '../../auth/model';

import {
  authErrorMessage,
  continueWith,
  LOGOUT_FAILED,
  LOGOUT_NOT_REVOKED,
  PROVIDER_ORDER,
  restoreFailedMessage,
  unavailableMessage,
} from './authCopy';

describe('auth copy', () => {
  it('offers only Google for now', () => {
    expect(PROVIDER_ORDER.map(continueWith)).toEqual(['Google로 계속하기']);
  });

  it('has a polite message for every error except cancel', () => {
    for (const code of AUTH_ERROR_CODES) {
      const message = authErrorMessage(code);
      if (code === 'cancelled') expect(message).toBeNull();
      else expect(message).toMatch(/니다\.$|주세요\.$/);
    }
  });

  it('names the unavailable provider', () => {
    expect(unavailableMessage([])).toBeNull();
    expect(unavailableMessage(['google'])).toBe('지금은 Google 로그인을 사용할 수 없습니다.');
  });
});

describe('restore and logout copy', () => {
  it('asks to unlock the device only for a storage failure', () => {
    expect(restoreFailedMessage('storage_unavailable')).toContain('기기 잠금');
    expect(restoreFailedMessage('network')).toContain('인터넷 연결');
    expect(restoreFailedMessage('provider_unavailable')).not.toContain('기기 잠금');
  });

  it('tells a device-only logout apart from a failed logout', () => {
    expect(LOGOUT_NOT_REVOKED.title).toContain('이 기기에서 로그아웃');
    expect(LOGOUT_NOT_REVOKED.message).toContain('완료되지 않았습니다');
    expect(LOGOUT_FAILED.title).toContain('하지 못했습니다');
  });
});
