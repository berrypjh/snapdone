'use client';

import { useEffect } from 'react';

/**
 * hydration이 끝나 화면이 입력을 받을 수 있게 되면 `<html data-hydrated>`를 붙인다.
 * 서버 HTML은 hydration 전에도 같은 모양이라, E2E는 이 표시로 준비를 기다린다(`apps/web-e2e`).
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset['hydrated'] = 'true';
  }, []);
  return null;
}
