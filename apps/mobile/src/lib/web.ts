export const getWebBaseUrl = (): string => {
  const value = process.env.EXPO_PUBLIC_WEB_BASE_URL;

  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_WEB_BASE_URL이 설정되지 않았습니다. apps/mobile/.env.example을 apps/mobile/.env로 복사하고 Metro를 --clear로 재시작하세요.',
    );
  }

  return value.replace(/\/+$/, '');
};

export const webUrl = (path: string) =>
  `${getWebBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

/** WebView 안에서 열 수 있는 web 경로. 정확히 같아야 한다. `/auth/callback`(Google)은 넣지 않는다. */
const WEB_VIEW_PATHS = new Set([
  '/',
  '/history',
  '/login',
  '/onboarding',
  '/auth/handoff',
  '/auth/handoff/start',
  '/auth/handoff/ready',
]);

type HttpUrl = { origin: string; path: string };

const AUTHORITY = /^([a-z0-9.-]+|\[[0-9a-f:.]+\])(:\d{1,5})?$/i;

/** 공백 · 백슬래시 · 제어 문자. */
// eslint-disable-next-line no-control-regex -- 제어 문자를 거부하려고 찾는다
const UNSAFE = /[\\\s\x00-\x1f\x7f]/;

/**
 * `http(s)://host[:port]/path?query#hash`를 직접 나눈다. RN `URL`은 구현이 불완전하다.
 * userinfo(`@`) · 백슬래시 · 공백 · 제어 문자가 있으면 `null`이다.
 */
export const parseHttpUrl = (url: string): HttpUrl | null => {
  if (UNSAFE.test(url)) return null;
  const match = /^(https?):\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!match || !AUTHORITY.test(match[2])) return null;
  const [, scheme, authority, path] = match;
  return { origin: `${scheme}://${authority}`.toLowerCase(), path: path || '/' };
};

/** `url`이 web 서비스 origin의 page(`path`를 주면 그 경로)이면 true. 메시지를 보낸 page 확인에 쓴다. */
export const isWebPage = (url: string, path?: string): boolean => {
  const target = parseHttpUrl(url);
  const web = parseHttpUrl(getWebBaseUrl());
  return !!target && !!web && target.origin === web.origin && (!path || target.path === path);
};

export type WebNavigation = 'load' | 'external' | 'block';

/**
 * WebView가 여는 주소를 정한다. web origin의 허용 경로만 안에서 열고, 다른 https 사이트는
 * 시스템 브라우저로 보내며, 그 외(`javascript:` · `data:` · `file:` · `intent:` · 외부 http · 모르는 경로)는 막는다.
 * `about:blank`는 WebView 초기 문서라 허용한다.
 */
export const webViewNavigation = (url: string): WebNavigation => {
  if (url === 'about:blank') return 'load';
  const target = parseHttpUrl(url);
  if (!target) return 'block';
  if (isWebPage(url)) return WEB_VIEW_PATHS.has(target.path) ? 'load' : 'block';
  return target.origin.startsWith('https://') ? 'external' : 'block';
};

/** 핸드오프 1단계: web이 verifier cookie를 만들고 ready page로 보낸다. */
export const handoffStartUrl = (next: string) =>
  webUrl(`/auth/handoff/start?next=${encodeURIComponent(next)}`);

/** 핸드오프 2단계: web 서버가 code를 이 WebView의 verifier로 교환한다. */
export const handoffExchangeUrl = (code: string, next: string) =>
  webUrl(`/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
