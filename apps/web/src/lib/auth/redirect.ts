import type { AuthErrorCode } from '@snapdone/auth-contracts';
import { isJobDetailPath } from '@snapdone/webview-bridge';

/** 로그인 후 돌아갈 수 있는 page. 그 외는 홈으로 간다. */
const RETURN_PATHS = new Set([
  '/',
  '/history',
  '/me',
  '/onboarding',
  '/process',
  '/settings/processing',
]);

export const DEFAULT_RETURN_PATH = '/';

/**
 * 디코딩하지 않은 값이 allowlist와 정확히 같거나 처리 결과 하나의 경로(`/history/{소문자 uuid}`)일 때만 받는다.
 * 그래서 `//host` · 백슬래시 · 제어 문자 · 퍼센트 · 이중 인코딩 · scheme · 하위 경로는 통과하지 못한다.
 */
export const safeReturnPath = (value: string | null | undefined): string =>
  value && (RETURN_PATHS.has(value) || isJobDetailPath(value)) ? value : DEFAULT_RETURN_PATH;

/** 로그인 page 주소. 로그인 뒤 `returnTo`로 돌아가고, 보일 오류가 있으면 함께 싣는다. */
export const loginPage = (returnTo: string, error?: AuthErrorCode) => {
  const query = new URLSearchParams({ next: returnTo });
  if (error) query.set('error', error);
  return `/login?${query}`;
};
