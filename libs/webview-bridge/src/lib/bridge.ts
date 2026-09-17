/** WebView User-Agent에 덧붙여, web이 첫 HTML부터 앱 내 모드로 렌더링할 수 있게 한다. */
export const IN_APP_USER_AGENT_TOKEN = 'SnapdoneApp';

/** 이 계약의 버전. User-Agent에 실려 web이 앱이 이해하는 메시지를 알 수 있다. */
export const BRIDGE_VERSION = 1;

/** WebView `applicationNameForUserAgent` prop 값. 예: `SnapdoneApp/1`. */
export const inAppUserAgentName = () => `${IN_APP_USER_AGENT_TOKEN}/${BRIDGE_VERSION}`;

/** 요청이나 페이지가 앱 WebView 안에서 실행 중이면 true. */
export const isInAppUserAgent = (userAgent: string | null | undefined) =>
  userAgent?.includes(`${IN_APP_USER_AGENT_TOKEN}/`) ?? false;

/**
 * web이 `window.ReactNativeWebView.postMessage`로 보내는 메시지.
 * - `ready`: 페이지 제목을 네이티브 헤더에 넘긴다 (v1)
 * - `auth-required`: 이 WebView에 web 세션이 없다. 앱이 세션을 확인하고 핸드오프를 다시 시작한다
 * - `handoff-ready`: 핸드오프 verifier cookie를 만들었다. 앱은 `challenge`로 일회용 코드를 받는다
 */
export type WebToAppMessage =
  | { type: 'ready'; title: string }
  | { type: 'auth-required' }
  | { type: 'handoff-ready'; challenge: string; next: string };

/** `postMessage`는 문자열만 전달한다. */
export const encodeWebToAppMessage = (message: WebToAppMessage) => JSON.stringify(message);

/** S256 challenge 모양: SHA-256의 base64url(패딩 없음). */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const isPath = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

/**
 * WebView 원시 메시지를 파싱한다. 알려진 메시지가 아니면 `null`로 무시한다.
 * 인증 메시지는 필드가 정확히 맞을 때만 받는다.
 */
export function decodeWebToAppMessage(raw: string): WebToAppMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  switch (record.type) {
    case 'ready':
      return typeof record.title === 'string' ? { type: 'ready', title: record.title } : null;
    case 'auth-required':
      return hasOnlyKeys(record, ['type']) ? { type: 'auth-required' } : null;
    case 'handoff-ready': {
      const { challenge, next } = record;
      if (!hasOnlyKeys(record, ['type', 'challenge', 'next'])) return null;
      if (typeof challenge !== 'string' || !CHALLENGE.test(challenge) || !isPath(next)) return null;
      return { type: 'handoff-ready', challenge, next };
    }
    default:
      return null;
  }
}
