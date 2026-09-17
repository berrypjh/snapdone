import type { AuthErrorCode } from '@snapdone/auth-contracts';

const AUTH_ERROR_MESSAGE: Record<Exclude<AuthErrorCode, 'cancelled'>, string> = {
  provider_unavailable: '지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  network: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  session_expired: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  invalid_callback: '로그인을 끝내지 못했습니다. 다시 시도해 주세요.',
};

export const authErrorMessage = (error: AuthErrorCode | null): string | null =>
  !error || error === 'cancelled' ? null : AUTH_ERROR_MESSAGE[error];

export const GOOGLE_UNAVAILABLE = '지금은 Google 로그인을 사용할 수 없습니다.';
