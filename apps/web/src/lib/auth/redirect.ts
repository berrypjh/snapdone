/** 로그인 후 돌아갈 수 있는 page. 그 외는 홈으로 간다. */
const RETURN_PATHS = new Set(['/', '/history', '/onboarding']);

export const DEFAULT_RETURN_PATH = '/';

/**
 * 디코딩하지 않은 값이 allowlist와 정확히 같을 때만 받는다. 그래서 `//host` · 백슬래시 ·
 * 제어 문자 · 퍼센트 · 이중 인코딩 · scheme은 통과하지 못한다.
 */
export const safeReturnPath = (value: string | null | undefined): string =>
  value && RETURN_PATHS.has(value) ? value : DEFAULT_RETURN_PATH;
