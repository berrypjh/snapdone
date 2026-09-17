import type { AuthProvider } from '@snapdone/auth-contracts';

import type { AuthErrorCode } from '../../auth/model';

export const PROVIDER_ORDER: readonly AuthProvider[] = ['google'];

export const PROVIDER_NAME: Record<AuthProvider, string> = {
  google: 'Google',
};

export const AUTH_ERROR_MESSAGE: Record<Exclude<AuthErrorCode, 'cancelled'>, string> = {
  provider_unavailable: '지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  session_expired: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  invalid_callback: '로그인을 끝내지 못했습니다. 다시 시도해 주세요.',
  storage_unavailable:
    '이 기기에 로그인 정보를 저장하지 못했습니다. 기기 잠금을 해제한 뒤 다시 시도해 주세요.',
};

export const authErrorMessage = (error: AuthErrorCode): string | null =>
  error === 'cancelled' ? null : AUTH_ERROR_MESSAGE[error];

export const continueWith = (provider: AuthProvider) => `${PROVIDER_NAME[provider]}로 계속하기`;

export const unavailableMessage = (providers: AuthProvider[]): string | null => {
  if (providers.length === 0) return null;
  const names = providers.map((provider) => PROVIDER_NAME[provider]).join(' · ');
  return `지금은 ${names} 로그인을 사용할 수 없습니다.`;
};

/** 저장된 로그인을 확인하지 못했을 때. credential은 남아 있어 로그인 화면이 아니라 재시도를 보인다. */
export const restoreFailedMessage = (error: AuthErrorCode): string =>
  error === 'storage_unavailable'
    ? '저장된 로그인 정보를 읽지 못했습니다. 기기 잠금을 해제한 뒤 다시 시도해 주세요.'
    : '로그인 정보를 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';

export const LOGOUT_FAILED = {
  title: '로그아웃하지 못했습니다',
  message: '이 기기에서 로그인 정보를 지우지 못했습니다. 기기 잠금을 해제한 뒤 다시 시도해 주세요.',
};

export const LOGOUT_NOT_REVOKED = {
  title: '이 기기에서 로그아웃했습니다',
  message:
    '서버에 연결하지 못해 로그인 세션 취소는 완료되지 않았습니다. 세션은 일정 시간이 지나면 만료됩니다.',
};
