'use client';

import { useEffect } from 'react';

import { encodeWebToAppMessage, type WebToAppMessage } from '@snapdone/webview-bridge';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** 앱 WebView 안이면 계약 메시지를 한 번 보낸다. 브라우저에서는 아무 일도 하지 않는다. */
export function InAppMessage({ message }: { message: WebToAppMessage }) {
  const encoded = encodeWebToAppMessage(message);

  useEffect(() => {
    window.ReactNativeWebView?.postMessage(encoded);
  }, [encoded]);

  return null;
}
