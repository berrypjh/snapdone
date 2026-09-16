/** WebView User-Agent에 덧붙여, web이 첫 HTML부터 앱 내 모드로 렌더링할 수 있게 한다. */
export const IN_APP_USER_AGENT_TOKEN = 'SnapdoneApp';

/** 이 계약의 버전. User-Agent에 실려 web이 앱이 이해하는 메시지를 알 수 있다. */
export const BRIDGE_VERSION = 1;

/** WebView `applicationNameForUserAgent` prop 값. 예: `SnapdoneApp/1`. */
export const inAppUserAgentName = () => `${IN_APP_USER_AGENT_TOKEN}/${BRIDGE_VERSION}`;

/** 요청이나 페이지가 앱 WebView 안에서 실행 중이면 true. */
export const isInAppUserAgent = (userAgent: string | null | undefined) =>
  userAgent?.includes(`${IN_APP_USER_AGENT_TOKEN}/`) ?? false;

/** web이 `window.ReactNativeWebView.postMessage`로 보내는 메시지. `ready`는 페이지 제목을 네이티브 헤더에 넘긴다. */
export type WebToAppMessage = { type: 'ready'; title: string };

/** `postMessage`는 문자열만 전달한다. */
export const encodeWebToAppMessage = (message: WebToAppMessage) => JSON.stringify(message);

/** WebView 원시 메시지를 파싱한다. 알려진 메시지가 아니면 `null`로 무시한다. */
export function decodeWebToAppMessage(raw: string): WebToAppMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;

  const { type, title } = value as Record<string, unknown>;
  return type === 'ready' && typeof title === 'string' ? { type, title } : null;
}
