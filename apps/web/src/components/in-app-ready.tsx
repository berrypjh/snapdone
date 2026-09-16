'use client';

import { useEffect } from 'react';

import { encodeWebToAppMessage } from '@snapdone/webview-bridge';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export function InAppReady({ title }: { title: string }) {
  useEffect(() => {
    window.ReactNativeWebView?.postMessage(encodeWebToAppMessage({ type: 'ready', title }));
  }, [title]);

  return null;
}
